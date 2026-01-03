import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RAGRequest {
  action: 'index' | 'search' | 'delete';
  connectorId?: string | null;
  sourceType?: string | null;
  documents?: Array<{
    sourceId?: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  query?: string;
  limit?: number;
}

// NOTE:
// Lovable's AI gateway currently doesn't expose a stable embeddings endpoint in this project.
// We still index and search via keyword (full-text) so the File connector works reliably.
// Embeddings can be re-enabled later without changing the frontend API.

// Sanitize content to remove null characters and other problematic Unicode
function sanitizeContent(content: string): string {
  // Remove null characters (\u0000) that PostgreSQL can't handle
  // Also remove other control characters except newline, tab, carriage return
  return content
    .replace(/\u0000/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Remove control chars except \t, \n, \r
    .trim();
}

// Hash content for deduplication
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const request: RAGRequest = await req.json();
    const { action, connectorId = null, sourceType = null, documents, query, limit = 10 } = request;

    console.log(`RAG Service: ${action} for ${connectorId}/${sourceType}`);

    switch (action) {
      case 'index': {
        if (!connectorId) throw new Error('connectorId is required for indexing');
        if (!sourceType) throw new Error('sourceType is required for indexing');

        if (!documents || documents.length === 0) {
          throw new Error('No documents provided for indexing');
        }

        const results = [];
        for (const doc of documents) {
          // Sanitize content before processing
          const sanitizedContent = sanitizeContent(doc.content);
          const contentHash = hashContent(sanitizedContent);
          
          // Check for existing document with same hash
          const { data: existing } = await supabase
            .from('documents')
            .select('id')
            .eq('connector_id', connectorId)
            .eq('content_hash', contentHash)
            .maybeSingle();

          if (existing) {
            console.log(`Skipping duplicate: ${doc.title}`);
            results.push({ title: doc.title, status: 'skipped', reason: 'duplicate' });
            continue;
          }


          // Insert document (keyword-only indexing; embedding omitted)
          const { data, error } = await supabase
            .from('documents')
            .insert({
              connector_id: connectorId,
              source_type: sourceType,
              source_id: doc.sourceId,
              title: sanitizeContent(doc.title),
              content: sanitizedContent.substring(0, 50000), // Limit content size
              content_hash: contentHash,
              metadata: doc.metadata || {},
            })
            .select('id')
            .single();

          if (error) {
            console.error(`Failed to index ${doc.title}:`, error);
            results.push({ title: doc.title, status: 'error', error: error.message });
          } else {
            console.log(`✅ Indexed: ${doc.title}`);
            results.push({ title: doc.title, status: 'indexed', id: data.id });
          }

        }

        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'search': {
        if (!query) {
          throw new Error('No search query provided');
        }

        console.log(`Searching for: "${query}" in ${connectorId || 'all connectors'}`);

        // Keyword-only search (full-text)
        const { data, error } = await supabase.rpc('keyword_search', {
          query_text: query,
          match_count: limit,
          connector_filter: connectorId || null,
        });

        const results = error ? [] : (data || []);
        if (error) console.error('Keyword search failed:', error);

        console.log(`Found ${results.length} results`);
        console.log(`Sample results: ${JSON.stringify(results.slice(0, 2)).substring(0, 500)}`);

        return new Response(
          JSON.stringify({
            success: true,
            results,
            searchType: 'keyword',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'delete': {
        const { error } = await supabase
          .from('documents')
          .delete()
          .eq('connector_id', connectorId);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, message: `Deleted all documents for ${connectorId}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('RAG Service error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});