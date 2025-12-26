import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConnectedSource {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  connectedSources: ConnectedSource[];
  context?: Record<string, unknown>;
}

// Call connector API
async function callConnector(
  connector: string,
  action: string,
  config: Record<string, string>,
  params?: Record<string, unknown>
): Promise<unknown> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/connector-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ connector, action, config, params }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Connector error: ${error}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Connector request failed');
  }

  return result.data;
}

// Parse user intent and determine what data to fetch
function parseIntent(message: string, connectedSources: ConnectedSource[]): {
  intents: Array<{ connector: string; action: string; params?: Record<string, unknown> }>;
  searchQuery?: string;
} {
  const lowerMessage = message.toLowerCase();
  const intents: Array<{ connector: string; action: string; params?: Record<string, unknown> }> = [];
  let searchQuery: string | undefined;

  // Extract search query from message
  const searchPatterns = [
    /search\s+(?:for\s+)?["']?([^"']+?)["']?(?:\s+in|\s+on|\s*$)/i,
    /find\s+(?:information\s+(?:about|on)\s+)?["']?([^"']+?)["']?/i,
    /look\s+(?:up|for)\s+["']?([^"']+?)["']?/i,
    /what\s+(?:is|are)\s+(?:the\s+)?["']?([^"'?]+?)["']?\??/i,
    /how\s+(?:to|do\s+I)\s+["']?([^"'?]+?)["']?\??/i,
  ];

  for (const pattern of searchPatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      searchQuery = match[1].trim();
      break;
    }
  }

  // If no explicit search pattern, extract topic from question
  if (!searchQuery && (lowerMessage.includes('?') || lowerMessage.length > 15)) {
    const stopWords = /\b(what|is|the|a|an|how|can|i|you|me|for|about|on|with|do|does|tell|show|give|find|search|know|need|want|help|please|thanks|thank|hi|hello)\b/gi;
    searchQuery = lowerMessage
      .replace(stopWords, ' ')
      .replace(/[?.,!]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 5)
      .join(' ');
  }

  // Check for count/stats queries
  const isCountQuery = /how many|count|total|number of|stats|statistics/i.test(lowerMessage);

  // Route to appropriate connectors based on intent and available sources
  for (const source of connectedSources) {
    const connectorType = source.type || source.id;

    switch (connectorType) {
      case 'servicenow':
        if (lowerMessage.includes('article') || lowerMessage.includes('knowledge') || lowerMessage.includes('kb')) {
          if (isCountQuery) {
            intents.push({ connector: 'servicenow', action: 'getArticleCount', params: {} });
          }
          if (searchQuery) {
            intents.push({ connector: 'servicenow', action: 'searchArticles', params: { query: searchQuery } });
          }
        }
        if (lowerMessage.includes('incident')) {
          if (isCountQuery) {
            intents.push({ connector: 'servicenow', action: 'getIncidentCount', params: {} });
          }
          // Check for incident number
          const incidentMatch = lowerMessage.match(/inc\s*(\d{7,})/i);
          if (incidentMatch) {
            intents.push({ connector: 'servicenow', action: 'getIncident', params: { number: `INC${incidentMatch[1]}` } });
          }
        }
        if (lowerMessage.includes('catalog')) {
          if (isCountQuery) {
            intents.push({ connector: 'servicenow', action: 'getCatalogItemCount', params: {} });
          }
          intents.push({ connector: 'servicenow', action: 'getCatalogItems', params: {} });
        }
        // Default: search articles for general questions
        if (intents.length === 0 && searchQuery) {
          intents.push({ connector: 'servicenow', action: 'searchArticles', params: { query: searchQuery } });
        }
        break;

      case 'google-drive':
        if (searchQuery || lowerMessage.includes('file') || lowerMessage.includes('document') || lowerMessage.includes('drive')) {
          intents.push({ connector: 'google-drive', action: 'searchFiles', params: { query: searchQuery || '' } });
        }
        break;

      case 'confluence':
        if (searchQuery || lowerMessage.includes('wiki') || lowerMessage.includes('page') || lowerMessage.includes('confluence')) {
          intents.push({ connector: 'confluence', action: 'searchContent', params: { query: searchQuery || '' } });
        }
        break;

      case 'jira':
        if (searchQuery || lowerMessage.includes('issue') || lowerMessage.includes('ticket') || lowerMessage.includes('jira')) {
          intents.push({ connector: 'jira', action: 'searchIssues', params: { query: searchQuery || '' } });
        }
        break;

      case 'notion':
        if (searchQuery || lowerMessage.includes('page') || lowerMessage.includes('note') || lowerMessage.includes('notion')) {
          intents.push({ connector: 'notion', action: 'search', params: { query: searchQuery || '' } });
        }
        break;

      case 'github':
        if (searchQuery || lowerMessage.includes('code') || lowerMessage.includes('repo') || lowerMessage.includes('github')) {
          intents.push({ connector: 'github', action: 'searchCode', params: { query: searchQuery || '' } });
        }
        break;

      case 'slack':
        if (searchQuery || lowerMessage.includes('message') || lowerMessage.includes('channel') || lowerMessage.includes('slack')) {
          intents.push({ connector: 'slack', action: 'searchMessages', params: { query: searchQuery || '' } });
        }
        break;
    }
  }

  return { intents, searchQuery };
}

// Build dynamic system prompt based on connected sources
function buildSystemPrompt(connectedSources: ConnectedSource[]): string {
  const sourceNames = connectedSources.map(s => s.name).join(', ');
  
  return `You are NOVA, a helpful universal AI assistant that can access data from multiple connected sources.

## Connected Data Sources:
${connectedSources.length > 0 ? sourceNames : 'No sources connected yet'}

## Your Capabilities:
- Search and retrieve information from all connected data sources
- Answer questions using data from the connected sources
- Help users find documents, articles, issues, and other content
- Provide summaries and recommendations based on the data

## Important Rules:
1. **USE REAL DATA**: When data is provided below, use it to answer questions. Never make up information.
2. **BE HELPFUL**: Proactively search connected sources to answer user questions.
3. **CITE SOURCES**: When providing information, mention which source it came from.
4. **SUGGEST CONNECTIONS**: If the user asks about a source that's not connected, suggest they connect it in Settings.
5. **STAY FOCUSED**: Only discuss topics related to the connected data sources and helping users find information.

## Response Style:
- Be conversational and friendly
- Keep responses concise (2-4 sentences for simple queries)
- Use bullet points for lists
- Always offer relevant follow-up actions

${connectedSources.length === 0 ? `
## Getting Started:
The user hasn't connected any data sources yet. Encourage them to:
1. Go to Settings (gear icon)
2. Connect their favorite tools (Google Drive, Confluence, ServiceNow, etc.)
3. Come back and ask questions about their data
` : ''}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, connectedSources = [], context }: ChatRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Universal chat request:', { messageCount: messages.length, sources: connectedSources.map(s => s.id) });

    const latestMessage = messages[messages.length - 1];
    const userMessage = latestMessage?.content || '';

    // Parse intent and fetch data from connected sources
    const { intents, searchQuery } = parseIntent(userMessage, connectedSources);
    console.log('Detected intents:', intents, 'searchQuery:', searchQuery);

    // Collect data from all relevant sources
    const fetchedData: Record<string, unknown> = {};

    for (const intent of intents) {
      try {
        const source = connectedSources.find(s => s.id === intent.connector || s.type === intent.connector);
        if (source) {
          const key = `${intent.connector}_${intent.action}`;
          fetchedData[key] = await callConnector(intent.connector, intent.action, source.config, intent.params);
          console.log(`✅ Fetched ${key}:`, JSON.stringify(fetchedData[key]).substring(0, 200));
        }
      } catch (error) {
        console.error(`❌ Error fetching ${intent.connector}/${intent.action}:`, error);
      }
    }

    // Build contextual system prompt
    let systemPrompt = buildSystemPrompt(connectedSources);

    // Add fetched data to prompt
    if (Object.keys(fetchedData).length > 0) {
      systemPrompt += `\n\n## REAL DATA FROM CONNECTED SOURCES:\n`;
      systemPrompt += `**Use this data to answer the user's question:**\n\n`;

      for (const [key, data] of Object.entries(fetchedData)) {
        systemPrompt += `### ${key}:\n`;
        systemPrompt += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n`;
      }

      systemPrompt += `\n**IMPORTANT**: Use the data above to provide accurate, helpful responses. Don't say you can't access the data - it's right here!\n`;
    }

    // Call AI with context
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Usage limit reached. Please check your account.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error('Universal chat error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
