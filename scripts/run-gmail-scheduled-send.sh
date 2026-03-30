#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/scripts/logs"
LOG_FILE="$LOG_DIR/gmail-scheduled-send.log"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

npx tsx scripts/gmail-scheduled-send.ts >> "$LOG_FILE" 2>&1
exit $?
