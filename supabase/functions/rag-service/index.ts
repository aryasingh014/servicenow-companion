import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IndexRequest {
  action: 'index' | 'search' | 'delete';
  connectorId: string;
  sourceType: string;
  documents?: Array<{
    sourceId?: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  query?: string;
  limit?: number;
}

// Generate embeddings using Lovable AI (Gemini)
async function generateEmbedding(text: string): Promise<number[] | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return null;
  }

  try {
    // Use text-embedding model via Lovable gateway
    const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/text-embedding-004',
        input: text.substring(0, 8000), // Limit text length
      }),
    });

    if (!response.ok) {
      console.error('Embedding error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
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

    const request: IndexRequest = await req.json();
    const { action, connectorId, sourceType, documents, query, limit = 10 } = request;

    console.log(`RAG Service: ${action} for ${connectorId}/${sourceType}`);

    switch (action) {
      case 'index': {
        if (!documents || documents.length === 0) {
          throw new Error('No documents provided for indexing');
        }

        const results = [];
        for (const doc of documents) {
          const contentHash = hashContent(doc.content);
          
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

          // Generate embedding
          const embedding = await generateEmbedding(`${doc.title}\n\n${doc.content}`);

          // Insert document
          const { data, error } = await supabase
            .from('documents')
            .insert({
              connector_id: connectorId,
              source_type: sourceType,
              source_id: doc.sourceId,
              title: doc.title,
              content: doc.content.substring(0, 50000), // Limit content size
              content_hash: contentHash,
              metadata: doc.metadata || {},
              embedding: embedding,
            })
            .select('id')
            .single();

          if (error) {
            console.error(`Failed to index ${doc.title}:`, error);
            results.push({ title: doc.title, status: 'error', error: error.message });
          } else {
            console.log(`✅ Indexed: ${doc.title} (embedding: ${embedding ? 'yes' : 'no'})`);
            results.push({ title: doc.title, status: 'indexed', id: data.id, hasEmbedding: !!embedding });
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

        // Generate query embedding for semantic search
        const queryEmbedding = await generateEmbedding(query);
        console.log(`Query embedding generated: ${!!queryEmbedding}`);

        let results;
        if (queryEmbedding) {
          // Hybrid search with vector + keyword
          const { data, error } = await supabase.rpc('hybrid_search', {
            query_embedding: queryEmbedding,
            query_text: query,
            match_count: limit,
            connector_filter: connectorId || null,
          });

          if (error) {
            console.error('Hybrid search failed:', error);
            // Fall back to keyword search
            const { data: kwData } = await supabase.rpc('keyword_search', {
              query_text: query,
              match_count: limit,
              connector_filter: connectorId || null,
            });
            results = kwData || [];
          } else {
            results = data || [];
          }
        } else {
          // Keyword-only search
          const { data, error } = await supabase.rpc('keyword_search', {
            query_text: query,
            match_count: limit,
            connector_filter: connectorId || null,
          });

          if (error) {
            console.error('Keyword search failed:', error);
            results = [];
          } else {
            results = data || [];
          }
        }

        console.log(`Found ${results.length} results`);
        console.log(`Sample results: ${JSON.stringify(results.slice(0, 2)).substring(0, 500)}`);

        return new Response(JSON.stringify({
          success: true,
          results,
          searchType: queryEmbedding ? 'hybrid' : 'keyword',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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