-- Willow Dashboard Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS willow_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_willow_users_email ON willow_users(email);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION willow_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_willow_users_updated_at ON willow_users;
CREATE TRIGGER update_willow_users_updated_at
    BEFORE UPDATE ON willow_users
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- Projects table
CREATE TABLE IF NOT EXISTS willow_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
    owner_id UUID REFERENCES willow_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger for projects table
DROP TRIGGER IF EXISTS update_willow_projects_updated_at ON willow_projects;
CREATE TRIGGER update_willow_projects_updated_at
    BEFORE UPDATE ON willow_projects
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- Row Level Security Policies
ALTER TABLE willow_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE willow_projects ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Email Analysis & Vector Embedding Tables
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Email Metadata (stores analysis results)
CREATE TABLE IF NOT EXISTS email_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  gmail_message_id VARCHAR(255) NOT NULL,
  gmail_thread_id VARCHAR(255),

  -- Basic info
  subject TEXT,
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  to_email VARCHAR(255),
  date TIMESTAMP WITH TIME ZONE,
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  gmail_labels TEXT[],

  -- Analysis results
  category VARCHAR(50),
  sub_category VARCHAR(50),
  sentiment VARCHAR(20),
  sentiment_score FLOAT,
  urgency_score INT CHECK (urgency_score BETWEEN 1 AND 5),
  intent VARCHAR(50),
  requires_reply BOOLEAN DEFAULT false,

  -- Extracted data
  keywords TEXT[],
  entities JSONB,
  topics TEXT[],
  action_items JSONB,
  summary TEXT,

  -- Additional attributes
  product_type VARCHAR(50),
  counterparty_type VARCHAR(50),
  priority VARCHAR(20),

  -- Metadata
  is_analyzed BOOLEAN DEFAULT false,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_user_message UNIQUE (user_id, gmail_message_id)
);

-- Email Embeddings (vector storage)
CREATE TABLE IF NOT EXISTS email_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  gmail_message_id VARCHAR(255) NOT NULL,
  gmail_thread_id VARCHAR(255),
  embedding vector(768),
  embedding_text TEXT,
  embedding_model VARCHAR(50) DEFAULT 'text-embedding-004',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_embedding UNIQUE (user_id, gmail_message_id)
);

-- Email Clusters (related email groups)
CREATE TABLE IF NOT EXISTS email_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  cluster_name VARCHAR(255),
  cluster_type VARCHAR(50) CHECK (cluster_type IN ('thread', 'topic', 'entity', 'similarity', 'auto')),
  description TEXT,
  email_ids TEXT[],
  centroid vector(768),
  context_summary TEXT,
  insights JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_metadata_user ON email_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_email_metadata_date ON email_metadata(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_email_metadata_category ON email_metadata(user_id, category);
CREATE INDEX IF NOT EXISTS idx_email_metadata_thread ON email_metadata(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_metadata_keywords ON email_metadata USING gin(keywords);

-- HNSW vector index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_email_embeddings_vector ON email_embeddings
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_email_embeddings_user ON email_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_email_clusters_user ON email_clusters(user_id);

-- Similar emails search function
CREATE OR REPLACE FUNCTION match_similar_emails(
  query_embedding vector(768),
  user_id_filter VARCHAR(255),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  gmail_message_id VARCHAR(255),
  gmail_thread_id VARCHAR(255),
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.gmail_message_id,
    e.gmail_thread_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM email_embeddings e
  WHERE e.user_id = user_id_filter
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- ============================================
-- Invoice Management Tables
-- ============================================

-- Invoices table
CREATE TABLE IF NOT EXISTS willow_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES willow_users(id) ON DELETE SET NULL,

    -- Invoice basic info
    invoice_no VARCHAR(50) NOT NULL UNIQUE,  -- #26-ETC-1
    invoice_date DATE NOT NULL,

    -- Recipient info (ETC fixed but extensible)
    bill_to_company VARCHAR(255) DEFAULT 'Exchange Traded Concepts, LLC',
    attention VARCHAR(255) DEFAULT 'Garrett Stevens',

    -- Line items (JSONB array for multiple items)
    line_items JSONB NOT NULL,
    -- Example: [{"description": "Monthly Fee - December 2025", "qty": null, "unitPrice": null, "amount": 2083.33}]

    -- Total
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status management
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    sent_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,

    -- Sending info
    sent_to_email VARCHAR(255),
    gmail_message_id VARCHAR(255),  -- Sent email ID
    sent_to_etc_at TIMESTAMP WITH TIME ZONE,  -- ETC 발송 시간
    sent_to_bank_at TIMESTAMP WITH TIME ZONE,  -- 은행 발송 시간

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user ON willow_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON willow_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON willow_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_no ON willow_invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_sent_etc ON willow_invoices(sent_to_etc_at) WHERE sent_to_etc_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_sent_bank ON willow_invoices(sent_to_bank_at) WHERE sent_to_bank_at IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_willow_invoices_updated_at ON willow_invoices;
CREATE TRIGGER update_willow_invoices_updated_at
    BEFORE UPDATE ON willow_invoices
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- ============================================
-- Work Wiki Table (업무 위키)
-- ============================================

CREATE TABLE IF NOT EXISTS work_wiki (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    section VARCHAR(50) NOT NULL DEFAULT 'etf-etc',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    is_pinned BOOLEAN DEFAULT false,
    attachments JSONB,  -- 첨부파일 메타데이터 [{name, url, size, type}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_wiki_user ON work_wiki(user_id);
CREATE INDEX IF NOT EXISTS idx_work_wiki_section ON work_wiki(section);
CREATE INDEX IF NOT EXISTS idx_work_wiki_pinned ON work_wiki(is_pinned DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_work_wiki_updated_at ON work_wiki;
CREATE TRIGGER update_work_wiki_updated_at
    BEFORE UPDATE ON work_wiki
    FOR EACH ROW
    EXECUTE FUNCTION willow_update_updated_at_column();

-- Add attachments column if table already exists
-- ALTER TABLE work_wiki ADD COLUMN IF NOT EXISTS attachments JSONB;
