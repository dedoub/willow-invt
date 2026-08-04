/**
 * 텔레그램 메시지 배칭.
 *
 * CEO는 생각나는 대로 메시지를 여러 개 끊어 보낸다. 그때마다 따로 처리하면
 * 앞 메시지에 대한 답이 뒤 메시지 맥락 없이 나가고, 액션도 중복 실행된다.
 * 그래서 짧은 디바운스로 묶고, 처리 중에 새 메시지가 오면 진행 중인 run을
 * 멈춘 뒤 이전 입력까지 합쳐 다시 돌린다.
 *
 * 이 파일이 따로 있는 이유: 배칭은 타이머와 abort가 얽힌 레이스라 눈으로
 * 읽어서는 못 잡는다. __tests__/message-batcher.test.mts로 검증한다.
 */

export type QueuedPhase = 'queued' | 'merged' | 'restart' | 'starting'

export interface MessageBatcherContext {
  /** 디바운스 대기 시간(ms) */
  delayMs: number
  /**
   * 진행 중 run의 AbortController. 봇의 다른 흐름(콜백/명령/재개)도 같은 맵을
   * 쓰기 때문에 배처가 소유하지 않고 주입받는다.
   */
  abortControllers: Map<number, AbortController>
  /**
   * 진행 중 run의 원본 입력. 액션 단계에 들어가면 봇이 직접 지워서
   * (dropInFlight) 재배칭 대상에서 뺀다.
   */
  inFlightText: Map<number, string>
  run(chatId: number, combined: string, signal: AbortSignal, lastMessageId: number): Promise<void>
  onProgress?(chatId: number, opts: {
    messageCount: number
    replyToMessageId?: number
    phase: QueuedPhase
    startedAt?: number
  }): Promise<void> | void
  /** run 직전 호출. 봇이 inflight 파일에 기록해 재시작 시 복구한다. */
  persist?(chatId: number, combined: string, lastMessageId: number): void
  log?(message: string): void
}

interface Batch {
  messages: string[]
  timer: ReturnType<typeof setTimeout>
  lastMessageId: number
}

export function createMessageBatcher(ctx: MessageBatcherContext) {
  const buffers = new Map<number, Batch>()
  /**
   * abort된 run의 입력을 다음 배치까지 들고 있는 자리.
   *
   * 여기를 거치지 않고 fire() 시점에 inFlightText를 읽으면 유실된다.
   * abort된 run은 끝나면서 finally로 inFlightText를 지우는데, 그게
   * 디바운스(기본 1초)보다 먼저 끝나면 읽을 게 남지 않기 때문이다.
   * codex는 대부분 1초 안에 abort에 반응하므로 사실상 항상 유실됐다.
   * 그래서 abort를 거는 그 자리에서 동기적으로 꺼내 온다.
   */
  const carryover = new Map<number, string>()

  function fire(chatId: number) {
    const batch = buffers.get(chatId)
    buffers.delete(chatId)
    if (!batch) return

    void (async () => {
      const savedText = carryover.get(chatId)
      carryover.delete(chatId)
      const allMessages = savedText ? [savedText, ...batch.messages] : batch.messages
      const combined = allMessages.join('\n\n')
      if (allMessages.length > 1) {
        ctx.log?.(`📨 배칭 완료: ${allMessages.length}개 메시지 통합 처리${savedText ? ' (이전 메시지 포함)' : ''}`)
      }

      ctx.persist?.(chatId, combined, batch.lastMessageId)
      await ctx.onProgress?.(chatId, {
        messageCount: allMessages.length,
        replyToMessageId: batch.lastMessageId,
        phase: 'starting',
      })

      const ac = new AbortController()
      ctx.abortControllers.set(chatId, ac)
      ctx.inFlightText.set(chatId, combined)
      try {
        await ctx.run(chatId, combined, ac.signal, batch.lastMessageId)
      } finally {
        ctx.abortControllers.delete(chatId)
        ctx.inFlightText.delete(chatId)
      }
    })()
  }

  return {
    /** 새 메시지를 배치에 넣는다. 진행 중인 run이 있으면 멈추고 다시 묶는다. */
    async push(chatId: number, text: string, messageId: number): Promise<void> {
      const existingAbort = ctx.abortControllers.get(chatId)
      if (existingAbort) {
        // 순서 중요: abort된 run의 finally가 inFlightText를 지우기 전에 꺼낸다.
        // 이 두 줄 사이에 await이 들어가면 다시 유실 레이스가 생긴다.
        const carried = ctx.inFlightText.get(chatId)
        ctx.inFlightText.delete(chatId)
        existingAbort.abort()
        // carried가 없을 때 덮어쓰면 안 된다. 같은 배치 창에서 abort가
        // 두 번 걸리면 두 번째는 빈 값이라 먼저 챙겨둔 걸 날린다.
        if (carried) carryover.set(chatId, carried)
        ctx.log?.(`🔄 [${chatId}] 기존 처리 취소 — 새 메시지와 합침`)
      }

      const existing = buffers.get(chatId)
      if (existing) {
        clearTimeout(existing.timer)
        existing.messages.push(text)
        existing.lastMessageId = messageId
        await ctx.onProgress?.(chatId, {
          messageCount: existing.messages.length,
          replyToMessageId: messageId,
          phase: existingAbort ? 'restart' : 'merged',
        })
        ctx.log?.(`📦 메시지 배칭: ${existing.messages.length}개 누적 (chat ${chatId})`)
        existing.timer = setTimeout(() => fire(chatId), ctx.delayMs)
        return
      }

      await ctx.onProgress?.(chatId, {
        messageCount: 1,
        replyToMessageId: messageId,
        phase: existingAbort ? 'restart' : 'queued',
        startedAt: Date.now(),
      })
      buffers.set(chatId, {
        messages: [text],
        lastMessageId: messageId,
        timer: setTimeout(() => fire(chatId), ctx.delayMs),
      })
    },

    /**
     * 진행 중 입력을 재배칭 대상에서 뺀다. 액션 실행 단계에 들어가면
     * 같은 액션이 두 번 돌지 않도록 봇이 호출한다.
     */
    dropInFlight(chatId: number): void {
      ctx.inFlightText.delete(chatId)
      // 이미 회수해 둔 것도 버린다. 액션까지 간 입력을 다시 합치면
      // 같은 액션이 두 번 실행된다.
      carryover.delete(chatId)
    },

    /** 사용자 취소. 대기 중 배치와 진행 중 run을 모두 정리한다. */
    cancel(chatId: number): void {
      const batch = buffers.get(chatId)
      if (batch) {
        clearTimeout(batch.timer)
        buffers.delete(chatId)
      }
      ctx.abortControllers.get(chatId)?.abort()
      ctx.abortControllers.delete(chatId)
      ctx.inFlightText.delete(chatId)
      carryover.delete(chatId)
    },

    /** 대기 중인 배치가 있는지 */
    pending(chatId: number): boolean {
      return buffers.has(chatId)
    },
  }
}
