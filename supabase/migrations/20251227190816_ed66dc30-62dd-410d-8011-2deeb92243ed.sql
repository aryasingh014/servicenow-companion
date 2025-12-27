-- Fix RAG SQL functions: ts_rank returns real, but our return types are double precision (FLOAT)

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
    ts_rank(
      to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
      plainto_tsquery('english', query_text)
    )::double precision AS keyword_rank
  FROM public.documents d
  WHERE
    (connector_filter IS NULL OR d.connector_id = connector_filter)
    AND (
      to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, ''))
      @@ plainto_tsquery('english', query_text)
    )
  ORDER BY keyword_rank DESC
  LIMIT match_count;
END;
$$;

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
      (1 - (d.embedding <=> query_embedding))::double precision AS sim_score,
      ts_rank(
        to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
        plainto_tsquery('english', query_text)
      )::double precision AS kw_rank
    FROM public.documents d
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
    vr.sim_score AS similarity,
    vr.kw_rank AS keyword_rank
  FROM vector_results vr
  ORDER BY (vr.sim_score * 0.7 + LEAST(vr.kw_rank, 1.0) * 0.3) DESC
  LIMIT match_count;
END;
$$;