CREATE TABLE IF NOT EXISTS knowledge_distill_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  entities_created INTEGER DEFAULT 0,
  relations_created INTEGER DEFAULT 0,
  insights_created INTEGER DEFAULT 0,
  distilled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_distill_log_source ON knowledge_distill_log(source_type, source_id);
