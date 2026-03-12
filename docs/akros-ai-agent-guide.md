# 인덱스 사업을 위한 자율 진화형 AI 에이전트 가이드

**인덱스 설계·운영·라이선싱을 자율적으로 지원하는 AI 에이전트 아키텍처**

---

## 왜 인덱스 사업에 이 구조가 맞는가

인덱스는 본질적으로 **온톨로지**다.

- 종목(Entity) 간 관계(Relation)로 구성된 구조
- 방법론(Methodology)이라는 규칙 체계가 존재
- 리밸런싱마다 의사결정(Insight)이 발생
- 클라이언트(운용사)별 라이선싱 관계가 복잡

즉, 인덱스 사업의 데이터 자체가 Entity-Relation-Insight 구조와 1:1로 대응된다. 별도의 추상화 없이 사업 데이터가 곧 지식 그래프가 된다.

---

## 아키텍처

```
[Interface] Slack Bot / 내부 대시보드
     ↓
[Brain] LLM + 시스템 프롬프트
     - 인덱스 방법론 숙지
     - 리밸런싱 규칙 이해
     - 클라이언트 히스토리 기억
     ↕ Tool Use
[Hands] MCP 서버 (인덱스 도메인 도구)
     - 종목 데이터 조회/분석
     - 인덱스 성과 계산
     - 리밸런싱 시뮬레이션
     - 라이선싱 관리
     ↕ SQL / API
[Memory] 데이터베이스
     - knowledge_entities (종목, 인덱스, 운용사, 규제...)
     - knowledge_relations (구성종목, 라이선싱, 벤치마크...)
     - knowledge_insights (리밸런싱 결정, 시장 판단, 클라이언트 요청...)
     - attribute_catalog (새로운 팩터, 지표 자동 발견)
     - prompt_sections (시장 상황별 응답 규칙)
```

---

## 적용할 3가지 기둥

### 1. 지식 그래프 (온톨로지) — 핵심

인덱스 사업의 모든 것을 Entity-Relation으로 구조화한다.

**엔티티 타입:**

| 타입 | 예시 |
|------|------|
| `index` | K-Shares Korea Growth Index, KMCA Index |
| `constituent` | 삼성전자, SK하이닉스, NAVER |
| `asset_manager` | 한화자산운용, 미래에셋, Amplify ETFs |
| `etf` | KMCA ETF, K-Shares Korea Growth ETF |
| `methodology` | 시가총액 가중, 동일비중, 팩터 스크리닝 |
| `data_provider` | Bloomberg, Refinitiv, KRX |
| `regulation` | SEC Rule, 금감원 규정 |
| `market` | KOSPI, NYSE, NASDAQ |
| `factor` | 모멘텀, 밸류, 퀄리티, 성장성 |

**관계 타입:**

```
인덱스 —[has_constituent]→ 종목
인덱스 —[uses_methodology]→ 방법론
인덱스 —[licensed_to]→ 운용사
ETF —[tracks]→ 인덱스
운용사 —[manages]→ ETF
종목 —[listed_on]→ 시장
인덱스 —[regulated_by]→ 규제
방법론 —[uses_factor]→ 팩터
인덱스 —[benchmarked_against]→ 인덱스
운용사 —[contracted_with]→ 라이선스 조건
```

**자동 축적 예시:**
```
대화: "한화에서 KMCA 인덱스 라이선스 Start-up Fee를 4월에 지급한대"
     ↓
자동 추출:
  - Entity: 한화자산운용 (asset_manager)
  - Relation: KMCA Index —[licensed_to]→ 한화자산운용
  - Insight: "KMCA Start-up Fee 4월 지급 확정" (decision)
  - Attribute 발견: license_fee_schedule (asset_manager 속성으로 등록)
```

**벡터 검색과의 차이 (인덱스 사업 맥락):**
- 벡터 검색: "KMCA 관련 문서 보여줘" → 비슷한 문서 나열
- 온톨로지: "KMCA 인덱스를 추종하는 ETF의 운용사가 지급해야 할 잔여 수수료는?" → 관계 추론으로 정확한 답

---

### 2. MCP 도구 증강 — 실시간 데이터 접근

인덱스 운영에 필요한 도구를 MCP로 정의한다.

**핵심 도구:**

| 도구 | 설명 | 활용 |
|------|------|------|
| `get_index_performance` | 인덱스 수익률 조회 | 일일/주간/월간 성과 보고 |
| `list_constituents` | 구성종목 목록 | 종목 변경 추적 |
| `simulate_rebalancing` | 리밸런싱 시뮬레이션 | 종목 교체 영향 분석 |
| `get_license_status` | 라이선스 현황 | 수수료 수입 추적 |
| `get_market_data` | 시장 데이터 조회 | 이상 징후 감지 |
| `list_etf_flows` | ETF 자금흐름 | AUM 변동 모니터링 |
| `get_regulatory_updates` | 규제 변경사항 | 컴플라이언스 체크 |
| `calculate_tracking_error` | 추적오차 계산 | ETF 품질 관리 |

**동작 예시:**
```
"KMCA 인덱스 올해 성과 어때?"
     ↓
LLM: get_index_performance(index="KMCA", period="YTD") 호출
     ↓
MCP: DB/API 쿼리 → {return: 12.3%, benchmark: 8.1%, alpha: 4.2%}
     ↓
LLM: "KMCA 인덱스 YTD 수익률 12.3%. 벤치마크 대비 4.2%p 초과 성과입니다.
      다만 최근 1개월은 -1.8%로 조정 국면이니, 다음 리밸런싱에서
      모멘텀 팩터 비중 조정을 검토할 필요가 있습니다."
```

---

### 3. 동적 프롬프트 관리 — 시장 상황에 맞는 판단

에이전트의 행동 규칙이 시장 상황과 사업 맥락에 따라 진화한다.

**동적 섹션 예시:**

| 섹션 키 | 내용 |
|---------|------|
| `market_analysis_style` | 시장 분석 시 참고할 프레임워크 |
| `rebalancing_criteria` | 리밸런싱 의사결정 기준 |
| `client_communication` | 클라이언트별 커뮤니케이션 톤 |
| `risk_thresholds` | 경보를 울리는 임계치 (추적오차, AUM 변동 등) |
| `regulatory_awareness` | 현재 주의해야 할 규제 이슈 |

**자기 수정 흐름:**
```
상황: SEC가 인덱스 방법론 공시 규정을 강화
     ↓
에이전트: 'regulatory_awareness' 섹션 업데이트
         "SEC Index Methodology Disclosure Rule 강화.
          모든 인덱스 관련 보고에 방법론 투명성 체크리스트 포함 필요."
     ↓
이후: 인덱스 관련 대화마다 컴플라이언스 체크가 자동으로 포함됨
```

---

## 인덱스 사업 특화 온톨로지 스키마

```sql
-- 기존 범용 테이블에 인덱스 도메인 속성 추가
-- properties JSONB에 들어갈 표준 속성 (레벨 2)

-- index 엔티티
{
  "ticker": "KMCA",
  "launch_date": "2024-06-15",
  "methodology_type": "market_cap_weighted",
  "rebalancing_frequency": "quarterly",
  "constituent_count": 50,
  "base_value": 1000,
  "currency": "USD",
  "region": "Korea"
}

-- constituent 엔티티
{
  "ticker": "005930.KS",
  "market_cap": 450000000000,
  "weight_in_index": 8.5,
  "sector": "Technology",
  "inclusion_date": "2024-06-15"
}

-- asset_manager 엔티티
{
  "aum": 50000000,
  "license_type": "standard",
  "license_start": "2024-06-01",
  "fee_structure": "startup + ongoing",
  "primary_contact": "차동호 이사"
}
```

**레벨 3 자동 발견 예시:**
```
대화: "Amplify ETFs가 K-Shares 인덱스 3개를 패키지로 라이선싱하려는데,
      볼륨 디스카운트를 원한다고 하네"
     ↓
자동 발견:
  - key: "volume_discount_eligible" (asset_manager 속성)
  - key: "package_deal_count" (asset_manager 속성)
  - insight: "Amplify가 복수 인덱스 패키지 딜 요청. 볼륨 디스카운트 정책 수립 필요"
```

---

## 운영 시나리오

### 시나리오 1: 일일 모닝 브리핑

```
에이전트 (매일 아침 자동):

"인덱스 모닝 브리핑 — 2026-03-09

[성과]
  KMCA Index: -0.8% (전일), YTD +12.3%
  K-Growth Index: +0.3% (전일), YTD +8.7%

[주의]
  ⚠️ KMCA 추적오차 0.45% → 임계치(0.5%) 근접. 모니터링 필요.
  ⚠️ K-Growth 구성종목 중 XX제약 3일 연속 하한가. 리밸런싱 검토.

[라이선싱]
  한화 KMCA Start-up Fee: 4월 지급 예정
  Amplify 계약 갱신: D-15 (3/24)

[시장]
  KOSPI: -1.2%, 외국인 순매도 3,200억
  관련 뉴스: 금감원 ETF 수수료 체계 개편안 발표"
```

### 시나리오 2: 리밸런싱 의사결정 지원

```
"다음 분기 리밸런싱 뭘 바꿔야 할까?"
     ↓
에이전트:
  "KMCA Index 리밸런싱 분석 (2026 Q2)

  [편입 후보] (방법론 기준 충족, 현재 미편입)
  1. 카카오뱅크 — 시총 증가, 금융 섹터 비중 확대
  2. HD현대일렉트릭 — 모멘텀 상위 5%

  [편출 후보]
  1. XX전자 — 시총 하락으로 기준 미달 (60위)
  2. YY바이오 — 거래량 기준 미달 3개월 연속

  [시뮬레이션]
  편입/편출 적용 시 → 추정 수익률 +0.3%p, 추적오차 변동 미미
  섹터 비중 변화: IT 32%→30%, 금융 12%→14%

  방법론 가이드라인 범위 내입니다. 진행할까요?"
```

### 시나리오 3: 클라이언트 문의 대응

```
"Amplify에서 K-Shares Index 백테스트 데이터 요청했어"
     ↓
에이전트:
  "Amplify 요청 이력 확인:
  - 2월: 방법론 문서 요청 → 발송 완료
  - 이번: 백테스트 데이터 요청

  K-Shares Index 백테스트 데이터 (2015-2025):
  연환산 수익률 11.2%, 샤프비율 0.87, 최대낙폭 -28.3%

  PDF 리포트로 만들어서 보낼까요?
  참고: Amplify 계약 갱신이 3/24이라 타이밍 좋습니다."
```

---

## 적용하지 않는 것

| 기둥 | 적용 여부 | 이유 |
|------|----------|------|
| 지식 그래프 | ✅ 적용 | 인덱스 구조 자체가 온톨로지 |
| MCP 도구 | ✅ 적용 | 데이터 조회/분석 자동화 |
| 동적 프롬프트 | ✅ 적용 | 시장 상황별 판단 기준 진화 |
| Attribute Catalog | ✅ 적용 | 새로운 팩터/지표 자동 발견 |
| 코드 자기 수정 | ❌ 미적용 | 금융 시스템에서 코드 자동 수정은 리스크 과다 |

---

## 구현 단계

### Phase 1: 데이터 파이프라인 (1-2주)
```
├── 인덱스/종목/운용사 데이터를 온톨로지 테이블로 마이그레이션
├── MCP 서버 구축 (인덱스 성과, 구성종목 조회 등 기본 도구)
└── 시스템 프롬프트 설계 (인덱스 방법론 숙지 + 응답 규칙)
```

### Phase 2: 지능 부여 (2-3주)
```
├── 지식 그래프 자동 축적 (대화에서 관계/인사이트 추출)
├── 모닝 브리핑 자동화 (일일 성과 + 이상 징후 + 라이선싱 현황)
└── 리밸런싱 시뮬레이션 도구
```

### Phase 3: 자율 진화 (지속적)
```
├── 동적 프롬프트 (시장 상황별 판단 기준 자동 갱신)
├── Attribute Catalog (새 팩터/지표 자동 발견)
└── 클라이언트 이력 기반 맞춤 대응
```

---

## 핵심 통찰

> **인덱스 자체가 온톨로지다.**

종목, 가중치, 방법론, 리밸런싱 규칙 — 이것들은 이미 Entity-Relation 구조다. 자율 진화형 에이전트를 적용한다는 것은 **이미 존재하는 구조를 AI가 읽을 수 있게 만드는 것**이지, 새로운 구조를 억지로 만드는 것이 아니다.

인덱스 사업에서 가장 큰 가치는:
1. **암묵지의 명시화** — "왜 이 종목을 편출했는지"가 insight로 쌓임
2. **클라이언트 기억** — "Amplify가 지난번에 뭘 요청했는지" 자동 추적
3. **리밸런싱 추론** — 과거 결정 패턴을 학습하여 다음 리밸런싱 제안
4. **규제 적응** — 규제 변경이 어떤 인덱스에 영향 미치는지 자동 매핑
