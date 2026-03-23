-- 재무제표 요약 테이블 (대시보드/비교 분석용)
CREATE TABLE financial_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,  -- 'willow', 'tensw'
  fiscal_year int NOT NULL,
  fiscal_period_start date NOT NULL,
  fiscal_period_end date NOT NULL,

  -- 손익계산서 요약
  revenue bigint DEFAULT 0,
  cost_of_goods bigint DEFAULT 0,
  gross_profit bigint DEFAULT 0,
  operating_expenses bigint DEFAULT 0,
  operating_income bigint DEFAULT 0,
  non_operating_income bigint DEFAULT 0,
  non_operating_expense bigint DEFAULT 0,
  net_income bigint DEFAULT 0,
  corporate_tax bigint DEFAULT 0,

  -- 재무상태표 요약
  total_current_assets bigint DEFAULT 0,
  total_non_current_assets bigint DEFAULT 0,
  total_assets bigint DEFAULT 0,
  total_current_liabilities bigint DEFAULT 0,
  total_non_current_liabilities bigint DEFAULT 0,
  total_liabilities bigint DEFAULT 0,
  capital_stock bigint DEFAULT 0,
  retained_earnings bigint DEFAULT 0,
  total_equity bigint DEFAULT 0,

  -- 주요 지표
  cash_and_equivalents bigint DEFAULT 0,
  short_term_loans_receivable bigint DEFAULT 0,
  short_term_borrowings bigint DEFAULT 0,
  carried_forward_loss bigint DEFAULT 0,

  -- 메타
  source_document text,
  notes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(company, fiscal_year)
);

COMMENT ON TABLE financial_summaries IS '법인별 연도별 재무제표 요약 (대시보드/비교 분석용)';

-- 재무제표 항목별 상세 테이블 (드릴다운/추이 분석용)
CREATE TABLE financial_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  fiscal_year int NOT NULL,
  statement_type text NOT NULL,  -- 'bs', 'is', 'cf'
  section text NOT NULL,
  account_code text,
  account_name text NOT NULL,
  amount bigint NOT NULL DEFAULT 0,
  parent_account_name text,
  sort_order int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),

  UNIQUE(company, fiscal_year, statement_type, account_name)
);

COMMENT ON TABLE financial_line_items IS '법인별 연도별 재무제표 계정과목 상세 (항목별 추이 분석용)';

CREATE INDEX idx_financial_summaries_company ON financial_summaries(company);
CREATE INDEX idx_financial_summaries_year ON financial_summaries(fiscal_year);
CREATE INDEX idx_financial_line_items_company_year ON financial_line_items(company, fiscal_year);
CREATE INDEX idx_financial_line_items_statement ON financial_line_items(statement_type);

ALTER TABLE financial_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON financial_summaries FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE financial_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON financial_line_items FOR ALL USING (auth.role() = 'service_role');
