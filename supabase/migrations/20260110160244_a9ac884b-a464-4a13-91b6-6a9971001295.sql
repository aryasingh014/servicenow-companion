-- Phase 1: Multi-Tenant Architecture for NOVA

-- 1. Create user_connectors table to store connector configs per user
CREATE TABLE public.user_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  oauth_tokens JSONB, -- For OAuth connectors (access_token, refresh_token, expires_at)
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, connector_id)
);

-- 2. Add user_id column to documents table for user-scoped RAG
ALTER TABLE public.documents 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create indexes for performance
CREATE INDEX idx_user_connectors_user_id ON public.user_connectors(user_id);
CREATE INDEX idx_user_connectors_connector_id ON public.user_connectors(connector_id);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_user_connector ON public.documents(user_id, connector_id);

-- 4. Enable RLS on user_connectors
ALTER TABLE public.user_connectors ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for user_connectors - users can only access their own connectors
CREATE POLICY "Users can view their own connectors"
ON public.user_connectors
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connectors"
ON public.user_connectors
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connectors"
ON public.user_connectors
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connectors"
ON public.user_connectors
FOR DELETE
USING (auth.uid() = user_id);

-- 6. Update documents RLS to be user-scoped
-- First drop the existing policy
DROP POLICY IF EXISTS "Service role can manage documents" ON public.documents;

-- Create new user-scoped policies for documents
CREATE POLICY "Users can view their own documents"
ON public.documents
FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create their own documents"
ON public.documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON public.documents
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.documents
FOR DELETE
USING (auth.uid() = user_id);

-- 7. Service role policy for edge functions (needs to manage documents on behalf of users)
CREATE POLICY "Service role full access to documents"
ON public.documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to user_connectors"
ON public.user_connectors
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. Add trigger for updated_at on user_connectors
CREATE TRIGGER update_user_connectors_updated_at
BEFORE UPDATE ON public.user_connectors
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 9. Update keyword_search function to filter by user_id
CREATE OR REPLACE FUNCTION public.keyword_search(
  query_text text, 
  match_count integer DEFAULT 10, 
  connector_filter text DEFAULT NULL::text,
  user_id_filter uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, 
  connector_id text, 
  source_type text, 
  title text, 
  content text, 
  metadata jsonb, 
  keyword_rank double precision
)
LANGUAGE plpgsql
SET search_path TO 'public'
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
    ts_rank(
      to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
      plainto_tsquery('english', query_text)
    )::double precision AS keyword_rank
  FROM public.documents d
  WHERE
    (connector_filter IS NULL OR d.connector_id = connector_filter)
    AND (user_id_filter IS NULL OR d.user_id = user_id_filter)
    AND (
      to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, ''))
      @@ plainto_tsquery('english', query_text)
    )
  ORDER BY keyword_rank DESC
  LIMIT match_count;
END;
$$;

-- 10. Update hybrid_search function to filter by user_id
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_embedding extensions.vector, 
  query_text text, 
  match_count integer DEFAULT 10, 
  connector_filter text DEFAULT NULL::text,
  user_id_filter uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, 
  connector_id text, 
  source_type text, 
  title text, 
  content text, 
  metadata jsonb, 
  similarity double precision, 
  keyword_rank double precision
)
LANGUAGE plpgsql
SET search_path TO 'public'
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
      (1 - (d.embedding <=> query_embedding))::double precision AS sim_score,
      ts_rank(
        to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
        plainto_tsquery('english', query_text)
      )::double precision AS kw_rank
    FROM public.documents d
    WHERE
      (connector_filter IS NULL OR d.connector_id = connector_filter)
      AND (user_id_filter IS NULL OR d.user_id = user_id_filter)
      AND d.embedding IS NOT NULL
  )
  SELECT
    vr.id,
    vr.connector_id,
    vr.source_type,
    vr.title,
    vr.content,
    vr.metadata,
    vr.sim_score AS similarity,
    vr.kw_rank AS keyword_rank
  FROM vector_results vr
  ORDER BY (vr.sim_score * 0.7 + LEAST(vr.kw_rank, 1.0) * 0.3) DESC
  LIMIT match_count;
END;
$$;