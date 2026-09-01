export function scheduledReportChatId(defaultChatId: number, weekday: string): number | null {
  return Number.isFinite(defaultChatId) && weekday.length > 0 ? defaultChatId : null
}
