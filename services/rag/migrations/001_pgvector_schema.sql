-- RAG Service — pgvector schema migration
-- Run automatically by the RAG service on startup

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge vectors table (one row per text chunk)
CREATE TABLE IF NOT EXISTS knowledge_vectors (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    chunk_text TEXT NOT NULL,
    source VARCHAR(512) NOT NULL DEFAULT '',
    metadata JSONB DEFAULT '{}',
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant lookup index
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_tenant
    ON knowledge_vectors (tenant_id);

-- IVFFlat index for approximate nearest neighbor search
-- (100 lists is reasonable for up to ~1M vectors)
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_embedding
    ON knowledge_vectors
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Created_at index for time-based queries
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_created
    ON knowledge_vectors (created_at DESC);

-- Composite index for tenant-scoped searches
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_tenant_source
    ON knowledge_vectors (tenant_id, source);
