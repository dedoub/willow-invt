'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { partitionResults, type RecognitionPiece } from '@/lib/dictation'

// 브라우저 Web Speech API 받아쓰기.
//
// 서버를 쓰지 않는다 — 인식은 브라우저가 하고 결과 텍스트만 입력창으로 간다.
// 그래서 오디오는 어디에도 저장되지 않고 채점 API도 그대로다(이미 텍스트를 받는다).
//
// 지원하지 않는 브라우저(Firefox 등)에서는 supported=false 로 두고 호출부가 버튼을
// 아예 안 그린다. 없는 기능을 눌러 실패하는 것보다 안 보이는 게 낫다.

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** onresult 이벤트에서 이번에 새로 들어온 조각만 뽑는다. */
function piecesFromEvent(event: unknown): RecognitionPiece[] {
  const e = event as {
    resultIndex?: number
    results?: { length: number; [i: number]: { isFinal: boolean; 0?: { transcript?: string } } }
  }
  const list = e?.results
  if (!list) return []
  const out: RecognitionPiece[] = []
  for (let i = e.resultIndex ?? 0; i < list.length; i++) {
    const r = list[i]
    if (!r) continue
    out.push({ transcript: String(r[0]?.transcript ?? ''), isFinal: !!r.isFinal })
  }
  return out
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': '마이크 권한이 필요해요. 브라우저 주소창에서 허용해 주세요.',
  'service-not-allowed': '마이크 권한이 필요해요. 브라우저 주소창에서 허용해 주세요.',
  'no-speech': '소리가 잡히지 않았어요. 다시 눌러 말해 주세요.',
  'audio-capture': '마이크를 찾지 못했어요. 입력 장치를 확인해 주세요.',
}

export function useDictation(opts: {
  lang: string
  /** 확정된 문장이 나올 때마다 호출 — 호출부가 입력창에 이어붙인다. */
  onFinal: (text: string) => void
  onError?: (message: string) => void
}) {
  const { lang, onFinal, onError } = opts
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  // 서버에는 window가 없어 렌더 중에 바로 못 정한다. 서버 스냅샷을 false로 두면
  // 하이드레이션이 어긋나지 않으면서 클라이언트에서 실제 지원 여부로 맞춰진다.
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!getRecognitionCtor(),
    () => false,
  )
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // 콜백을 ref로 들고 있는 이유: 인식기는 한 번 만들고 계속 쓰는데, 핸들러가
  // 매 렌더의 클로저를 잡으면 옛 answer 위에 이어붙게 된다.
  const onFinalRef = useRef(onFinal)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onFinalRef.current = onFinal
    onErrorRef.current = onError
  }, [onFinal, onError])


  const stop = useCallback(() => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    setListening(false)
    // 중간분은 확정되지 않은 추측이라 멈추는 순간 버린다.
    setInterim('')
    if (rec) { try { rec.stop() } catch { /* 이미 끝난 인식기 */ } }
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) return
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = lang
    // 문장 중간의 짧은 침묵에서 끊기지 않게 — 한 문항을 통째로 말할 수 있어야 한다.
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      const { final, interim: next } = partitionResults(piecesFromEvent(event))
      if (final) onFinalRef.current(final)
      setInterim(next)
    }
    rec.onerror = (event) => {
      const code = String((event as { error?: string })?.error ?? '')
      // no-speech 는 잠깐 조용했다는 뜻일 뿐이라 인식기를 죽이지 않는다.
      if (code === 'no-speech') return
      onErrorRef.current?.(ERROR_TEXT[code] ?? '음성 인식에 실패했어요. 다시 시도해 주세요.')
      stop()
    }
    rec.onend = () => {
      // 브라우저가 알아서 끊는 경우가 있다. 상태를 맞춰 버튼이 계속 "듣는 중"으로
      // 남지 않게 한다.
      if (recognitionRef.current === rec) stop()
    }
    recognitionRef.current = rec
    setInterim('')
    try {
      rec.start()
      setListening(true)
    } catch {
      recognitionRef.current = null
      onErrorRef.current?.('마이크를 시작하지 못했어요.')
    }
  }, [lang, stop])

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop()
    else start()
  }, [start, stop])

  // 화면을 떠나면 마이크를 놓는다.
  useEffect(() => () => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) { try { rec.abort() } catch { /* 이미 끝난 인식기 */ } }
  }, [])

  return { supported, listening, interim, start, stop, toggle }
}
