'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  shouldSeedDraft, sortThreads,
  type InquiryAppKey, type InquiryAppResult, type InquiryDraftDto,
  type InquiryMessageDto, type InquiryThreadDto,
} from '@/lib/inquiry-inbox-core'
import {
  composeKey, createLatestOnly, draftOf, errorOf, isSeeded,
  publishFailed, publishSucceeded, seedDraft, setDraft,
  EMPTY_COMPOSE, type ComposeState,
} from '@/lib/inquiry-compose'

interface AppMeta {
  key: InquiryAppKey
  label: string
  dot: string
  writable: boolean
  adminUrl: string | null
}

interface Conversation {
  app: InquiryAppKey
  threadId: string
  messages: InquiryMessageDto[]
  /** CEO 봇이 써 둔 초안. 없으면 null. */
  draft: InquiryDraftDto | null
  /** 초안을 **못 읽은** 경우의 사유. null 인 초안과 구별해야 한다. */
  draftError: string | null
}

const fmt = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** 신원값은 스키마가 이미 들고 있는 uuid/subject 다. 화면에는 앞자리만 보인다. */
const shortId = (v: string | null) => (v ? (v.length > 18 ? v.slice(0, 18) + '…' : v) : '—')

export function InquiryInbox() {
  const mobile = useIsMobile()
  const [apps, setApps] = useState<AppMeta[]>([])
  const [results, setResults] = useState<InquiryAppResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<{ app: InquiryAppKey; id: string } | null>(null)
  const [convo, setConvo] = useState<Conversation | null>(null)
  const [convoLoading, setConvoLoading] = useState(false)
  const [convoError, setConvoError] = useState<string | null>(null)

  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE)
  const [publishing, setPublishing] = useState<string | null>(null)

  // 늦게 온 대화 응답이 다른 스레드에 꽂히지 않게 하는 가드. **한 겹뿐이다** —
  // 아래 loadConvo 의 isCurrent 검사 외에 스레드 id 를 다시 대조하는 곳은 없다.
  const latest = useRef(createLatestOnly())

  const loadList = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/inquiries')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setApps(data.apps ?? [])
      setResults(data.results ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const loadConvo = useCallback(async (app: InquiryAppKey, id: string) => {
    const ticket = latest.current.begin()
    setSelected({ app, id })
    setConvo(null)
    setConvoError(null)
    setConvoLoading(true)
    try {
      const res = await fetch(`/api/inquiries/thread?app=${encodeURIComponent(app)}&id=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!latest.current.isCurrent(ticket)) return   // 그 사이 다른 스레드를 골랐다 — 버린다
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const messages: InquiryMessageDto[] = data.messages ?? []
      const draft: InquiryDraftDto | null = data.draft ?? null
      setConvo({
        app: data.app, threadId: data.threadId, messages,
        draft, draftError: data.draftError ?? null,
      })
      // 입력창을 빈 칸이 아니라 고칠 초안으로 연다. 키는 **응답이 말하는 스레드**로
      // 만든다 — 지금 고른 것(selected)이 아니라. 두 값은 같아야 하고 위 가드가
      // 그걸 보장하지만, 채우는 글의 주소는 그 글이 온 곳에서 가져오는 게 맞다.
      if (shouldSeedDraft(draft, messages) && draft) {
        setCompose(s => seedDraft(s, composeKey(data.app, data.threadId), draft.body))
      }
    } catch (err) {
      if (!latest.current.isCurrent(ticket)) return
      setConvoError(err instanceof Error ? err.message : String(err))
    } finally {
      if (latest.current.isCurrent(ticket)) setConvoLoading(false)
    }
  }, [])

  const appMeta = useMemo(() => {
    const m = new Map<InquiryAppKey, AppMeta>()
    for (const a of apps) m.set(a.key, a)
    return m
  }, [apps])

  // 네 앱 스레드를 한 줄로 세운다 — 미답변 먼저, 그 안에서 최근 순.
  const threads = useMemo(() => {
    const all: InquiryThreadDto[] = []
    for (const r of results) if (r.status === 'ok') all.push(...r.threads)
    return sortThreads(all)
  }, [results])

  const broken = useMemo(
    () => results.filter((r): r is Extract<InquiryAppResult, { status: 'error' }> => r.status === 'error'),
    [results],
  )

  const unanswered = threads.filter(x => x.unreadForAdmin).length
  const selectedThread = selected ? threads.find(x => x.app === selected.app && x.id === selected.id) ?? null : null
  const selectedMeta = selectedThread ? appMeta.get(selectedThread.app) ?? null : null
  const key = selected ? composeKey(selected.app, selected.id) : ''

  const publish = useCallback(async () => {
    if (!selected || !selectedMeta?.writable) return
    const k = composeKey(selected.app, selected.id)
    const text = draftOf(compose, k)
    if (text.trim() === '') return
    setPublishing(k)
    try {
      const res = await fetch('/api/inquiries/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: selected.app, threadId: selected.id, body: text }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      // 서버가 확인한 뒤에야 입력창을 비운다.
      setCompose(s => publishSucceeded(s, k))
      await Promise.all([loadList(), loadConvo(selected.app, selected.id)])
    } catch (err) {
      // 실패 — 쓴 글은 그대로 두고, 사유는 이 스레드 칸에만 적는다.
      setCompose(s => publishFailed(s, k, err instanceof Error ? err.message : String(err)))
    } finally {
      setPublishing(null)
    }
  }, [selected, selectedMeta, compose, loadList, loadConvo])

  const draft = draftOf(compose, key)
  const composeError = errorOf(compose, key)
  /** 입력창의 글이 아무도 손대지 않은 봇 초안인가 — 화면이 그렇게 말해야 한다. */
  const seeded = isSeeded(compose, key)
  /** 읽기 전용 앱(스크립타·리뷰노트)에 보여줄 초안. 낡은 초안은 안 보여준다. */
  const botDraft = convo && shouldSeedDraft(convo.draft, convo.messages) ? convo.draft : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: mobile ? '1fr' : 'minmax(300px, 380px) minmax(0, 1fr)',
      gap: t.density.blockGap, alignItems: 'start',
    }}>
      {/* ── 목록 ─────────────────────────────────────────────────────────── */}
      <LCard>
        <LSectionHead
          title="고객문의함"
          meta={loading ? '불러오는 중' : `${threads.length}건 · 미답변 ${unanswered}건`}
          note="네 앱 · 미답변 먼저"
          action={<LHeadBtn icon="refresh" title="새로고침" onClick={loadList} busy={loading} />}
        />

        {loadError && <Notice tone="danger" text={`목록을 불러오지 못했다 — ${loadError}`} />}

        {/* 깨진 조회는 절대 0건으로 그리지 않는다. 앱별로 따로 말한다. */}
        {broken.map(b => (
          <Notice key={b.app} tone="danger" text={`${b.app} 조회 실패 — ${b.message}`} />
        ))}

        {!loading && !loadError && threads.length === 0 && broken.length === 0 && (
          <div style={{
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.subtle,
            padding: `${t.density.gapLg}px 0`, textAlign: 'center',
          }}>
            네 앱 모두 조회에 성공했고, 문의는 아직 없다
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap }}>
          {threads.map(th => {
            const meta = appMeta.get(th.app)
            const on = selected?.app === th.app && selected?.id === th.id
            const rowKey = composeKey(th.app, th.id)
            const hasDraft = draftOf(compose, rowKey).trim() !== ''
            // 봇이 써 둔 것과 사람이 쓰던 것을 같은 말로 부르지 않는다.
            const rowSeeded = isSeeded(compose, rowKey)
            return (
              <button
                key={`${th.app}:${th.id}`}
                onClick={() => loadConvo(th.app, th.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: on ? t.brand[50] : 'transparent',
                  borderRadius: t.radius.md,
                  padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                  fontFamily: t.font.sans,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: 3 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                    background: meta?.dot ?? t.neutrals.subtle,
                  }} />
                  <span style={{
                    fontSize: `calc(${t.type.label}px * var(--fz, 1))`,
                    fontWeight: t.weight.medium, color: t.neutrals.text,
                  }}>{meta?.label ?? th.app}</span>
                  {th.unreadForAdmin && <LBadge tone="warn">미답변</LBadge>}
                  {th.channel === 'email' && <LBadge tone="neutral">구버전</LBadge>}
                  {hasDraft && <LBadge tone="info">{rowSeeded ? '봇 초안' : '작성중'}</LBadge>}
                  <span style={{
                    marginLeft: 'auto', fontSize: `calc(${t.type.helper}px * var(--fz, 1))`,
                    color: t.neutrals.subtle, fontFamily: t.font.mono, flexShrink: 0,
                  }}>{fmt(th.lastMessageAt)}</span>
                </div>
                <div style={{
                  fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.muted,
                  fontFamily: t.font.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {shortId(th.personId)}
                  {th.platform ? ` · ${th.platform}` : ''}
                  {th.appVersion ? ` ${th.appVersion}` : ''}
                  {th.locale ? ` · ${th.locale}` : ''}
                </div>
              </button>
            )
          })}
        </div>
      </LCard>

      {/* ── 대화 ─────────────────────────────────────────────────────────── */}
      <LCard>
        {!selectedThread ? (
          <div style={{
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.subtle,
            padding: `${t.density.gapLg}px 0`, textAlign: 'center',
          }}>
            왼쪽에서 문의를 고른다
          </div>
        ) : (
          <>
            <LSectionHead
              eyebrow={selectedMeta?.label ?? selectedThread.app}
              title={shortId(selectedThread.personId)}
              meta={`${fmt(selectedThread.createdAt)} 시작 · 마지막 ${fmt(selectedThread.lastMessageAt)}`}
              action={selectedMeta?.adminUrl
                ? <LHeadBtn icon="forward" label="자체 관리자" title={`${selectedMeta.label} 관리자 화면에서 답한다`} href={selectedMeta.adminUrl} />
                : undefined}
            />

            {convoError && <Notice tone="danger" text={`대화를 불러오지 못했다 — ${convoError}`} />}
            {convoLoading && <Notice tone="info" text="대화를 불러오는 중" />}

            {/* 초안을 못 읽은 것은 초안이 없는 것과 다르다. 조용히 빈 칸을 주면
                사람은 초안이 없는 줄 알고 처음부터 다시 쓴다. */}
            {convo?.draftError && (
              <Notice tone="warn" text={`봇 초안을 불러오지 못했다 — ${convo.draftError}. 초안이 없는 게 아니라 못 읽은 것이다.`} />
            )}

            {convo && convo.messages.length === 0 && !convoLoading && (
              <Notice tone="neutral" text="이 스레드에는 메시지가 없다" />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapMd, marginBottom: t.density.gapLg }}>
              {convo?.messages.map(m => (
                <div key={m.id} style={{
                  alignSelf: m.sender === 'support' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  background: m.sender === 'support' ? t.brand[50] : t.neutrals.inner,
                  borderRadius: t.radius.lg,
                  padding: `${t.density.gapSm}px ${t.density.gapMd}px`,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: t.density.gapSm, marginBottom: 3,
                  }}>
                    <span style={{
                      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`,
                      fontWeight: t.weight.semibold,
                      color: m.sender === 'support' ? t.brand[700] : t.neutrals.muted,
                    }}>{m.sender === 'support' ? '우리' : '고객'}</span>
                    <span style={{
                      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`,
                      color: t.neutrals.subtle, fontFamily: t.font.mono,
                    }}>{fmt(m.createdAt)}</span>
                  </div>
                  <div style={{
                    fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.text,
                    lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{m.body}</div>
                </div>
              ))}
            </div>

            {/* ── 답변 ─────────────────────────────────────────────────── */}
            {selectedMeta?.writable ? (
              selectedThread.channel === 'email' ? (
                <Notice
                  tone="warn"
                  text="구버전(이메일) 문의라 앱 안 문의함이 없다 — 여기서 답을 써도 고객은 못 본다"
                />
              ) : (
                <div>
                  {/* 채워져 있는 글이 **이미 보낸 답**으로 보이면, 사람은 창을 닫고
                      고객은 아무 답도 못 받는다. 그래서 채운 즉시 그렇게 말한다. */}
                  {seeded && (
                    <Notice
                      tone="warn"
                      text={`✍️ CEO 봇이 써 둔 초안이다 — 아직 고객에게 나가지 않았다. 읽고 고쳐서 '보내기'를 눌러야 나간다.${
                        convo?.draft?.at ? ` (${fmt(convo.draft.at)} 작성)` : ''
                      }`}
                    />
                  )}
                  <textarea
                    value={draft}
                    onChange={e => setCompose(s => setDraft(s, key, e.target.value))}
                    placeholder="답변을 쓴다"
                    rows={5}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: t.neutrals.inner, border: `1px solid ${t.neutrals.line}`,
                      borderRadius: t.radius.md, padding: t.density.gapMd,
                      fontFamily: t.font.sans, fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
                      color: t.neutrals.text, lineHeight: 1.55,
                    }}
                  />
                  {composeError && <Notice tone="danger" text={`보내지 못했다 — ${composeError}`} />}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: t.density.gapMd,
                    marginTop: t.density.gapSm,
                  }}>
                    <span style={{
                      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
                    }}>
                      보내면 고객 앱에 바로 뜬다
                    </span>
                    <LBtn
                      variant="brand"
                      size="sm"
                      icon={<LIcon name={publishing === key ? 'loader' : 'send'} size={13} stroke={1.8} className={publishing === key ? 'spin' : undefined} />}
                      onClick={publish}
                      disabled={publishing === key || draft.trim() === ''}
                      style={{ marginLeft: 'auto' }}
                    >
                      {publishing === key ? '보내는 중' : '보내기'}
                    </LBtn>
                  </div>
                </div>
              )
            ) : (
              <>
                <Notice
                  tone="info"
                  text={`${selectedMeta?.label ?? selectedThread.app}는 자체 관리자 화면에서 답한다 — 여기서는 읽기만 한다`}
                />
                {/* 여기서 보낼 수는 없지만, 초안을 숨길 이유는 없다. 이게 없으면
                    사람이 텔레그램을 뒤져 같은 글을 찾아 옮긴다. */}
                {botDraft && (
                  <div>
                    <Notice
                      tone="warn"
                      text={`✍️ CEO 봇이 써 둔 초안이다 — 아직 안 나갔다. 복사해서 ${selectedMeta?.label ?? ''} 관리자 화면에서 보낸다.${
                        botDraft.at ? ` (${fmt(botDraft.at)} 작성)` : ''
                      }`}
                    />
                    <div style={{
                      background: t.neutrals.inner, border: `1px solid ${t.neutrals.line}`,
                      borderRadius: t.radius.md, padding: t.density.gapMd,
                      fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.text,
                      lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>{botDraft.body}</div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </LCard>
    </div>
  )
}

function Notice({ tone, text }: { tone: 'danger' | 'warn' | 'info' | 'neutral'; text: string }) {
  const palette = {
    danger: { bg: '#F3DADA', fg: '#8A2A2A', icon: 'info' },
    warn: { bg: '#F9E8D0', fg: '#8A5A1A', icon: 'info' },
    info: { bg: '#DCE8F5', fg: '#1F4E79', icon: 'info' },
    neutral: { bg: t.neutrals.inner, fg: t.neutrals.muted, icon: 'info' },
  }[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: t.density.gapSm,
      background: palette.bg, color: palette.fg,
      borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.gapMd}px`,
      marginBottom: t.density.gapSm,
      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, lineHeight: 1.5,
      wordBreak: 'break-word',
    }}>
      <LIcon name={palette.icon} size={13} stroke={1.8} />
      <span>{text}</span>
    </div>
  )
}
