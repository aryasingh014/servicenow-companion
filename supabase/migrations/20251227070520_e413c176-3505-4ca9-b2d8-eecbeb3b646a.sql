-- Enable pgvector extension for free vector storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table for RAG
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'google-drive', 'file', 'confluence', etc.
  source_id TEXT, -- Original file/doc ID from source
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT, -- For deduplication
  metadata JSONB DEFAULT '{}',
  embedding vector(768), -- Gemini embedding dimension
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for keyword search (BM25-style)
CREATE INDEX documents_content_search_idx ON public.documents 
USING gin(to_tsvector('english', title || ' ' || content));

-- Create index for connector lookups
CREATE INDEX documents_connector_idx ON public.documents(connector_id);
CREATE INDEX documents_source_type_idx ON public.documents(source_type);

-- Create function for hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_embedding vector(768),
  query_text TEXT,
  match_count INT DEFAULT 10,
  connector_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  connector_id TEXT,
  source_type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  keyword_rank FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT 
      d.id,
      d.connector_id,
      d.source_type,
      d.title,
      d.content,
      d.metadata,
      1 - (d.embedding <=> query_embedding) as sim_score,
      ts_rank(to_tsvector('english', d.title || ' ' || d.content), plainto_tsquery('english', query_text)) as kw_rank
    FROM documents d
    WHERE 
      (connector_filter IS NULL OR d.connector_id = connector_filter)
      AND d.embedding IS NOT NULL
  )
  SELECT 
    vr.id,
    vr.connector_id,
    vr.source_type,
    vr.title,
    vr.content,
    vr.metadata,
    vr.sim_score as similarity,
    vr.kw_rank as keyword_rank
  FROM vector_results vr
  ORDER BY (vr.sim_score * 0.7 + LEAST(vr.kw_rank, 1.0) * 0.3) DESC
  LIMIT match_count;
END;
$$;

-- Create function for keyword-only search (fallback when no embeddings)
CREATE OR REPLACE FUNCTION public.keyword_search(
  query_text TEXT,
  match_count INT DEFAULT 10,
  connector_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  connector_id TEXT,
  source_type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  keyword_rank FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.connector_id,
    d.source_type,
    d.title,
    d.content,
    d.metadata,
    ts_rank(to_tsvector('english', d.title || ' ' || d.content), plainto_tsquery('english', query_text)) as kw_rank
  FROM documents d
  WHERE 
    (connector_filter IS NULL OR d.connector_id = connector_filter)
    AND to_tsvector('english', d.title || ' ' || d.content) @@ plainto_tsquery('english', query_text)
  ORDER BY kw_rank DESC
  LIMIT match_count;
END;
$$;

-- Allow public access for the edge functions
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage documents
CREATE POLICY "Service role can manage documents"
ON public.documents
FOR ALL
USING (true)
WITH CHECK (true);