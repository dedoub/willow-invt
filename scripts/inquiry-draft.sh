#!/bin/zsh
# 문의 답변 초안 — 네 앱(보이스카드·포틀·스크립타·리뷰노트)의 앱 안 1:1 문의 중
# 사람이 아직 답을 못 한 것에 대해 CEO 봇이 **초안만** 써서 텔레그램으로 넘긴다.
#
# 왜 여기(willow-invt)에 있나: 초안을 앱이 쓰면 생성이 느리거나 실패할 때 그게
# 고객의 요청 경로에 얹힌다. 초안은 우리 쪽 편의지 고객이 기다릴 일이 아니다.
# 그리고 프롬프트 하나가 네 앱을 다 맡는다.
#
# 이 잡은 답을 **보내지 않는다** — draft_body 한 칸만 쓴다. 발행은 사람이 각 앱의
# 관리 화면(윌로우 대시보드 /inquiries · scripta.quest · reviewnotes.app)에서 한다.
#
# 형태는 보이스카드 CEO 리포트(voice-cards/scripts/ceo-report.sh)를 그대로 따랐다:
# headless `claude -p` 에 Supabase MCP 툴만 열어 준다.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

DIR="/Volumes/PRO-G40/app-dev/willow-invt"
PROMPT="$DIR/scripts/inquiry-draft-prompt.md"
LOGDIR="/Users/dongwookkim/logs/inquiry-draft"
LOG="$LOGDIR/inquiry-draft.log"
LOCK="$LOGDIR/.running.lock"

# 외장 드라이브가 없으면 조용히 끝낸다 — drive-launcher 가 이미 기다렸는데도 없다면
# 오늘은 볼 수 없는 것이고, 그건 시끄럽게 할 일이 아니다.
[ -d "$DIR" ] || exit 0
[ -f "$PROMPT" ] || exit 0

mkdir -p "$LOGDIR" || exit 1

# 겹쳐 도는 것을 막는다. 앞선 실행이 텔레그램을 보낸 뒤 초안을 저장하기 전이면
# 두 번째 실행이 같은 스레드를 다시 집어 같은 초안을 두 번 보낸다.
# mkdir 은 원자적이라 잠금으로 쓴다. 죽은 잠금은 2시간 뒤 스스로 풀린다.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    echo "[$(date '+%F %T %Z')] stale lock 제거하고 진행" >> "$LOG"
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    echo "[$(date '+%F %T %Z')] 이미 실행 중 — 건너뜀" >> "$LOG"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

cd "$DIR" || exit 1

echo "================ $(date '+%Y-%m-%d %H:%M:%S %Z') run start ================" >> "$LOG"

# --mcp-config + --strict-mcp-config: 이 잡이 무엇에 접속하는지를 이 저장소의
# .mcp.json 하나로 못 박는다. 사용자 전역 설정이 바뀌어도 잡의 접근 범위는 그대로다.
# --allowedTools 는 execute_sql 하나뿐 — 파일도, 셸도, 웹도 열지 않는다.
/opt/homebrew/bin/claude -p "$(cat "$PROMPT")" \
  --model sonnet \
  --mcp-config "$DIR/.mcp.json" \
  --strict-mcp-config \
  --allowedTools "mcp__supabase__execute_sql" \
  --output-format text >> "$LOG" 2>&1

echo "================ exit $? $(date '+%H:%M:%S') ================" >> "$LOG"
