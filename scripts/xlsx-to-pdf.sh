#!/bin/bash
# 엑셀 파일을 PDF 로 뽑는다. 한 번에 한 파일씩.
#
#   bash scripts/xlsx-to-pdf.sh <입력.xlsx> [출력.pdf]
#
# LibreOffice 는 이 맥에서 한글 글리프를 통째로 빠뜨린다(굴림체·맑은 고딕이 없다).
# Microsoft Excel 로 뽑는다. AppleScript 응답이 늦게 와서 timeout 이 나지만 저장은
# 끝나 있으므로, 응답을 기다리지 않고 파일이 생기는지 본다.
set -uo pipefail
IN="$1"
OUT="${2:-${IN%.*}.pdf}"
rm -f "$OUT"

osascript >/dev/null 2>&1 <<APPLESCRIPT
tell application "Microsoft Excel"
  with timeout of 240 seconds
    try
      close every workbook saving no
    end try
    open (POSIX file "$IN")
    delay 2
    save active workbook in (POSIX file "$OUT") as PDF file format
    delay 2
    try
      close every workbook saving no
    end try
  end timeout
end tell
APPLESCRIPT

for _ in $(seq 1 60); do
  [ -s "$OUT" ] && break
  sleep 1
done

if [ -s "$OUT" ]; then
  echo "OK   $(basename "$OUT")"
else
  echo "FAIL $(basename "$IN")" >&2
  exit 1
fi
