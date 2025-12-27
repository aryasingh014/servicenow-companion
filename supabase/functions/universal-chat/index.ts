import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

// Define available tools for function calling
const AVAILABLE_TOOLS = [
  // ServiceNow tools
  {
    type: "function",
    function: {
      name: "servicenow_search_articles",
      description: "Search ServiceNow knowledge base articles. Use this when user asks about documentation, how-to guides, or knowledge articles.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for knowledge articles" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_get_incident",
      description: "Get details of a specific ServiceNow incident by number (e.g., INC0012345)",
      parameters: {
        type: "object",
        properties: {
          incident_number: { type: "string", description: "Incident number like INC0012345" }
        },
        required: ["incident_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_list_incidents",
      description: "List recent ServiceNow incidents, optionally filtered by status or priority",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["new", "in_progress", "resolved", "closed"], description: "Filter by incident status" },
          priority: { type: "string", enum: ["1", "2", "3", "4", "5"], description: "Filter by priority (1=Critical, 5=Planning)" },
          limit: { type: "number", description: "Max results to return (default 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_create_incident",
      description: "Create a new ServiceNow incident",
      parameters: {
        type: "object",
        properties: {
          short_description: { type: "string", description: "Brief description of the incident" },
          description: { type: "string", description: "Detailed description" },
          urgency: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" },
          impact: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" }
        },
        required: ["short_description"]
      }
    }
  },
  // Jira tools
  {
    type: "function",
    function: {
      name: "jira_search_issues",
      description: "Search Jira issues using text or JQL. Use for finding tickets, bugs, stories.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text or JQL query" },
          project: { type: "string", description: "Project key to filter (optional)" },
          status: { type: "string", description: "Status filter like 'Open', 'In Progress', 'Done'" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "jira_get_issue",
      description: "Get details of a specific Jira issue by key (e.g., PROJ-123)",
      parameters: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key like PROJ-123" }
        },
        required: ["issue_key"]
      }
    }
  },
  // RAG search for documents (Google Drive, files, Confluence, etc.)
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Search indexed documents from Google Drive, uploaded files, Confluence, and other document sources. Use this for finding information in documents, files, wikis, or knowledge bases.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          source_type: { type: "string", description: "Filter by source: 'google-drive', 'file', 'confluence', or leave empty for all" }
        },
        required: ["query"]
      }
    }
  }
];

// Execute ServiceNow function
async function executeServiceNow(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<unknown> {
  const instance = config.instanceUrl || Deno.env.get('SERVICENOW_INSTANCE') || '';
  const username = config.username || Deno.env.get('SERVICENOW_USERNAME') || '';
  const password = config.password || Deno.env.get('SERVICENOW_PASSWORD') || '';

  if (!instance || !username || !password) {
    return { error: "ServiceNow not configured. Please add credentials in Settings." };
  }

  const baseUrl = instance.startsWith('http') ? instance : `https://${instance}`;
  const authHeader = 'Basic ' + btoa(`${username}:${password}`);

  try {
    let endpoint = '';
    let method = 'GET';
    let body: string | undefined;

    switch (functionName) {
      case 'servicenow_search_articles':
        const searchQuery = args.query as string;
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(searchQuery)}^ORtextLIKE${encodeURIComponent(searchQuery)}&sysparm_fields=sys_id,number,short_description,text,category&sysparm_limit=10`;
        break;

      case 'servicenow_get_incident':
        const incNum = args.incident_number as string;
        endpoint = `/api/now/table/incident?sysparm_query=number=${incNum}&sysparm_fields=sys_id,number,short_description,description,state,priority,urgency,impact,assignment_group,opened_at,caller_id&sysparm_limit=1`;
        break;

      case 'servicenow_list_incidents':
        let query = 'ORDERBYDESCopened_at';
        if (args.status) {
          const stateMap: Record<string, string> = { new: '1', in_progress: '2', resolved: '6', closed: '7' };
          query = `state=${stateMap[args.status as string] || '1'}^${query}`;
        }
        if (args.priority) query = `priority=${args.priority}^${query}`;
        endpoint = `/api/now/table/incident?sysparm_query=${query}&sysparm_fields=sys_id,number,short_description,state,priority,opened_at&sysparm_limit=${args.limit || 10}`;
        break;

      case 'servicenow_create_incident':
        endpoint = '/api/now/table/incident';
        method = 'POST';
        body = JSON.stringify({
          short_description: args.short_description,
          description: args.description || '',
          urgency: args.urgency || '2',
          impact: args.impact || '2',
          state: '1',
        });
        break;

      default:
        return { error: `Unknown function: ${functionName}` };
    }

    console.log(`ServiceNow API: ${method} ${baseUrl}${endpoint}`);
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ServiceNow error: ${response.status}`, errorText);
      return { error: `ServiceNow API error: ${response.status}` };
    }

    const data = await response.json();
    return data.result || data;
  } catch (error) {
    console.error('ServiceNow execution error:', error);
    return { error: error instanceof Error ? error.message : 'ServiceNow request failed' };
  }
}

// Execute Jira function
async function executeJira(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<unknown> {
  const { url, email, apiToken } = config;

  if (!url || !email || !apiToken) {
    return { error: "Jira not configured. Please add credentials in Settings." };
  }

  const baseUrl = url.replace(/\/$/, '');
  const authHeader = 'Basic ' + btoa(`${email}:${apiToken}`);

  try {
    switch (functionName) {
      case 'jira_search_issues': {
        let jql = '';
        const query = args.query as string;
        
        // Build JQL
        if (query.includes('=') || query.includes('~')) {
          jql = query; // Already JQL
        } else {
          jql = `text ~ "${query}"`;
        }
        if (args.project) jql = `project = "${args.project}" AND ${jql}`;
        if (args.status) jql = `status = "${args.status}" AND ${jql}`;

        const response = await fetch(
          `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=10&fields=key,summary,status,priority,assignee,created`,
          { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
        );

        if (!response.ok) return { error: `Jira error: ${response.status}` };
        return response.json();
      }

      case 'jira_get_issue': {
        const issueKey = args.issue_key as string;
        const response = await fetch(
          `${baseUrl}/rest/api/3/issue/${issueKey}?fields=key,summary,description,status,priority,assignee,reporter,created,updated`,
          { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
        );

        if (!response.ok) return { error: `Jira error: ${response.status}` };
        return response.json();
      }

      default:
        return { error: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    console.error('Jira execution error:', error);
    return { error: error instanceof Error ? error.message : 'Jira request failed' };
  }
}

// Execute RAG search
async function executeRAGSearch(
  args: Record<string, unknown>,
  supabaseUrl: string,
  supabaseKey: string
): Promise<unknown> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/rag-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'search',
        connectorId: args.source_type || null,
        sourceType: args.source_type || null,
        query: args.query,
        limit: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RAG search error:', errorText);
      return { error: 'Document search failed' };
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('RAG search error:', error);
    return { error: error instanceof Error ? error.message : 'Search failed' };
  }
}

// Execute tool call
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  connectedSources: ConnectedSource[],
  supabaseUrl: string,
  supabaseKey: string
): Promise<unknown> {
  console.log(`Executing tool: ${toolName}`, args);

  if (toolName.startsWith('servicenow_')) {
    const source = connectedSources.find(s => s.type === 'servicenow' || s.id === 'servicenow');
    return executeServiceNow(toolName, args, source?.config || {});
  }

  if (toolName.startsWith('jira_')) {
    const source = connectedSources.find(s => s.type === 'jira' || s.id === 'jira');
    if (!source?.config) {
      return { error: "Jira not connected. Please connect Jira in Settings." };
    }
    return executeJira(toolName, args, source.config);
  }

  if (toolName === 'search_documents') {
    return executeRAGSearch(args, supabaseUrl, supabaseKey);
  }

  return { error: `Unknown tool: ${toolName}` };
}

// Build system prompt
function buildSystemPrompt(connectedSources: ConnectedSource[]): string {
  const sourceNames = connectedSources.map(s => s.name).join(', ');
  
  return `You are NOVA, an intelligent universal AI assistant with access to multiple data sources through function calling.

## Connected Data Sources:
${connectedSources.length > 0 ? sourceNames : 'No sources connected yet'}

## Your Capabilities:
- **ServiceNow**: Search knowledge articles, get/create incidents (use function calling)
- **Jira**: Search and retrieve issues (use function calling)  
- **Documents**: Search indexed documents from Google Drive, uploaded files, Confluence (use search_documents)

## How to Help Users:
1. **Understand the query**: Identify what information the user needs
2. **Use the right tool**: Call the appropriate function to fetch real data
3. **Synthesize results**: Combine and present information clearly
4. **Be proactive**: Suggest relevant follow-up actions

## Important Rules:
- ALWAYS use function calling to fetch real data - never make up information
- If a source isn't connected, politely suggest connecting it in Settings
- Keep responses concise but informative (2-4 sentences for simple queries)
- Cite which source the information came from
- If no results found, suggest alternative searches or actions

## Response Style:
- Be conversational and helpful
- Use bullet points for lists
- Include relevant links or IDs when available
- Offer follow-up actions

${connectedSources.length === 0 ? `
## Getting Started:
No data sources connected yet. Guide the user to:
1. Click Settings (gear icon)
2. Connect their tools (ServiceNow, Jira, Google Drive, etc.)
3. Upload files for document search
4. Return to chat and ask questions!
` : ''}`;
}

// Filter tools based on connected sources
function getAvailableTools(connectedSources: ConnectedSource[]): typeof AVAILABLE_TOOLS {
  const connectedTypes = new Set(connectedSources.map(s => s.type || s.id));
  
  return AVAILABLE_TOOLS.filter(tool => {
    const name = tool.function.name;
    
    // ServiceNow tools - check both config and env vars
    if (name.startsWith('servicenow_')) {
      const hasEnvConfig = Deno.env.get('SERVICENOW_INSTANCE') && Deno.env.get('SERVICENOW_USERNAME');
      return connectedTypes.has('servicenow') || hasEnvConfig;
    }
    
    // Jira tools
    if (name.startsWith('jira_')) {
      return connectedTypes.has('jira');
    }
    
    // Document search - always available if any document source connected
    if (name === 'search_documents') {
      const docSources = ['google-drive', 'file', 'confluence', 'notion', 'sharepoint'];
      return docSources.some(s => connectedTypes.has(s)) || connectedSources.length > 0;
    }
    
    return true;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, connectedSources = [] }: ChatRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Universal chat:', { messageCount: messages.length, sources: connectedSources.map(s => s.id) });

    const systemPrompt = buildSystemPrompt(connectedSources);
    const availableTools = getAvailableTools(connectedSources);

    console.log('Available tools:', availableTools.map(t => t.function.name));

    // First API call - may request tool use
    let response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        tools: availableTools.length > 0 ? availableTools : undefined,
        tool_choice: availableTools.length > 0 ? 'auto' : undefined,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Usage limit reached.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Processing tool calls:', assistantMessage.tool_calls.length);
      
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        
        const toolResult = await executeTool(
          functionName,
          args,
          connectedSources,
          SUPABASE_URL,
          SUPABASE_KEY
        );

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });

        console.log(`Tool ${functionName} result:`, JSON.stringify(toolResult).substring(0, 500));
      }

      // Second API call with tool results - now streaming
      const streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            assistantMessage,
            ...toolResults,
          ],
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        throw new Error(`AI gateway error: ${streamResponse.status}`);
      }

      return new Response(streamResponse.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    // No tool calls - stream the response
    const streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

    if (!streamResponse.ok) {
      throw new Error(`AI gateway error: ${streamResponse.status}`);
    }

    return new Response(streamResponse.body, {
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