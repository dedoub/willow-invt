---
name: youtube-summary
description: 유튜브 영상 자막 추출 및 요약. "유튜브 요약", "영상 내용", "youtube summary", "영상 정리" 시 사용.
metadata:
  bashPattern:
    - "youtube\\.com|youtu\\.be"
  filePattern:
    - "**/youtube*"
  priority: 5
---

# YouTube 영상 자막 추출 & 요약

## 트리거
- CEO가 YouTube URL을 보냈을 때
- "유튜브 요약", "영상 내용 뭐야", "이 영상 정리해줘" 등

## 자막 추출 방법

### 1단계: youtube-transcript-api (Python) — 권장
```bash
/tmp/yt-env/bin/python3 -c "
from youtube_transcript_api import YouTubeTranscriptApi
ytt = YouTubeTranscriptApi()
transcript = ytt.fetch('VIDEO_ID', languages=['ko', 'en'])
text = ' '.join([s.text for s in transcript.snippets])
print(text)
"
```

**venv가 없으면 먼저 생성:**
```bash
python3 -m venv /tmp/yt-env && /tmp/yt-env/bin/pip install youtube-transcript-api
```

**한국어 번역 자막이 필요하면:**
```python
tlist = ytt.list('VIDEO_ID')
for t in tlist:
    if t.is_generated:
        ko = t.translate('ko').fetch()
        text = ' '.join([s.text for s in ko.snippets])
```

### 2단계: 메타데이터 기반 (대체)
자막 추출 실패 시 Playwright로 영상 메타데이터 추출:
```javascript
// ytInitialPlayerResponse.videoDetails에서
// title, shortDescription, keywords, lengthSeconds 추출
```

## 요약 형식
1. **영상 제목** (채널명, 길이)
2. **핵심 내용 정리** — 챕터/주제별 구조화
3. **시사점** — CEO 사업(윌로우/텐소프트웍스/ETF)과의 연결점

## 위키 저장 규칙
- CEO가 "좋다"고 한 영상만 위키에 저장
- 저장 내용: 영상 요약 + 시사점 + 원문 링크
- section은 맥락에 맞게 선택 (전략/투자/기술 등)

## 주의사항
- YouTube PO 토큰 정책으로 자막 직접 URL 접근 불가 (2026-03 기준)
- yt-dlp도 impersonation 없이는 자막 다운로드 실패
- youtube-transcript-api Python 패키지가 현재 가장 안정적
- IP 차단 시 잠시 후 재시도 또는 Playwright 대체 사용
