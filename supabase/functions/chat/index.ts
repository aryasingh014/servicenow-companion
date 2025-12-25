import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceNowData {
  articleCount?: number;
  incidentCount?: number;
  catalogItemCount?: number;
  searchResults?: unknown[];
  incidentDetails?: unknown;
  createdIncident?: { number: string };
}

// Helper to call ServiceNow API
async function callServiceNow(action: string, params?: Record<string, unknown>): Promise<unknown> {
  const SERVICENOW_INSTANCE = Deno.env.get('SERVICENOW_INSTANCE');
  const SERVICENOW_USERNAME = Deno.env.get('SERVICENOW_USERNAME');
  const SERVICENOW_PASSWORD = Deno.env.get('SERVICENOW_PASSWORD');

  if (!SERVICENOW_INSTANCE || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
    throw new Error('ServiceNow credentials not configured');
  }

  const baseUrl = `https://${SERVICENOW_INSTANCE}`;
  const authHeader = 'Basic ' + btoa(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`);

  let endpoint = '';
  let method = 'GET';
  let body: string | undefined;

  switch (action) {
    case 'getArticleCount':
      endpoint = '/api/now/stats/kb_knowledge?sysparm_count=true';
      break;
    case 'getIncidentCount':
      endpoint = '/api/now/stats/incident?sysparm_count=true';
      break;
    case 'getCatalogItemCount':
      endpoint = '/api/now/stats/sc_cat_item?sysparm_count=true';
      break;
    case 'searchArticles':
      const searchQuery = params?.query as string;
      endpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(searchQuery)}^ORtextLIKE${encodeURIComponent(searchQuery)}&sysparm_fields=sys_id,number,short_description,category&sysparm_limit=10`;
      break;
    case 'getIncident':
      const incidentNumber = params?.number as string;
      endpoint = `/api/now/table/incident?sysparm_query=number=${incidentNumber}&sysparm_fields=sys_id,number,short_description,description,state,priority,assignment_group,opened_at,caller_id&sysparm_limit=1`;
      break;
    case 'createIncident':
      endpoint = '/api/now/table/incident';
      method = 'POST';
      body = JSON.stringify({
        short_description: params?.short_description,
        description: params?.description,
        urgency: params?.urgency || '2',
        impact: params?.impact || '2',
        category: params?.category,
      });
      break;
    case 'getCatalogItems':
      endpoint = '/api/now/table/sc_cat_item?sysparm_fields=sys_id,name,short_description,category&sysparm_limit=50';
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  console.log(`Calling ServiceNow: ${method} ${baseUrl}${endpoint}`);

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
    throw new Error(`ServiceNow API error: ${response.status}`);
  }

  return response.json();
}

// Parse user intent and determine what ServiceNow data to fetch
function parseUserIntent(message: string): { intents: string[], params: Record<string, unknown> } {
  const lowerMessage = message.toLowerCase();
  const intents: string[] = [];
  const params: Record<string, unknown> = {};

  // Check for article-related queries
  if (lowerMessage.includes('article') || lowerMessage.includes('knowledge')) {
    if (lowerMessage.includes('how many') || lowerMessage.includes('count') || lowerMessage.includes('total')) {
      intents.push('getArticleCount');
    }
    // Check for search
    const searchMatch = lowerMessage.match(/search\s+(?:for\s+)?['"]?([^'"]+)['"]?/i) ||
                        lowerMessage.match(/find\s+(?:articles?\s+(?:about|on|for)\s+)?['"]?([^'"]+)['"]?/i);
    if (searchMatch) {
      intents.push('searchArticles');
      params.searchQuery = searchMatch[1].trim();
    }
  }

  // Check for incident-related queries
  if (lowerMessage.includes('incident')) {
    if (lowerMessage.includes('how many') || lowerMessage.includes('count') || lowerMessage.includes('total')) {
      intents.push('getIncidentCount');
    }
    // Check for specific incident lookup
    const incidentMatch = lowerMessage.match(/inc\d{7}/i);
    if (incidentMatch) {
      intents.push('getIncident');
      params.incidentNumber = incidentMatch[0].toUpperCase();
    }
    // Check for incident creation
    if (lowerMessage.includes('create') || lowerMessage.includes('new') || lowerMessage.includes('open') || lowerMessage.includes('submit')) {
      intents.push('createIncident');
    }
  }

  // Check for catalog-related queries
  if (lowerMessage.includes('catalog') || lowerMessage.includes('service')) {
    if (lowerMessage.includes('how many') || lowerMessage.includes('count') || lowerMessage.includes('total') || lowerMessage.includes('items')) {
      intents.push('getCatalogItemCount');
    }
    if (lowerMessage.includes('list') || lowerMessage.includes('show') || lowerMessage.includes('what') || lowerMessage.includes('available')) {
      intents.push('getCatalogItems');
    }
  }

  return { intents, params };
}

// Extract incident data from conversation
function extractIncidentData(messages: Array<{ role: string; content: string }>): {
  shortDescription?: string;
  description?: string;
  urgency?: string;
  impact?: string;
} | null {
  const conversationText = messages.map(m => m.content).join('\n');
  
  // Look for patterns indicating incident creation with data
  const shortDescPatterns = [
    /short description[:\s]+["']?([^"'\n]+)["']?/i,
    /title[:\s]+["']?([^"'\n]+)["']?/i,
    /summary[:\s]+["']?([^"'\n]+)["']?/i,
    /issue[:\s]+["']?([^"'\n]+)["']?/i,
    /problem[:\s]+["']?([^"'\n]+)["']?/i,
  ];

  const descPatterns = [
    /description[:\s]+["']?([^"'\n]+)["']?/i,
    /details[:\s]+["']?([^"'\n]+)["']?/i,
  ];

  const urgencyPatterns = [
    /urgency[:\s]+["']?(low|medium|high)["']?/i,
  ];

  const impactPatterns = [
    /impact[:\s]+["']?(low|medium|high)["']?/i,
  ];

  let shortDescription: string | undefined;
  let description: string | undefined;
  let urgency: string | undefined;
  let impact: string | undefined;

  for (const pattern of shortDescPatterns) {
    const match = conversationText.match(pattern);
    if (match) {
      shortDescription = match[1].trim();
      break;
    }
  }

  for (const pattern of descPatterns) {
    const match = conversationText.match(pattern);
    if (match) {
      description = match[1].trim();
      break;
    }
  }

  for (const pattern of urgencyPatterns) {
    const match = conversationText.match(pattern);
    if (match) {
      urgency = match[1].toLowerCase();
      break;
    }
  }

  for (const pattern of impactPatterns) {
    const match = conversationText.match(pattern);
    if (match) {
      impact = match[1].toLowerCase();
      break;
    }
  }

  if (shortDescription) {
    return { shortDescription, description, urgency, impact };
  }

  return null;
}

const systemPrompt = `You are a helpful ServiceNow voice assistant named NOVA (Now Operations Virtual Assistant). You help users with:

1. **Knowledge Articles**: Search, view, and summarize documentation
2. **Incidents**: View existing incidents, check status, and create new ones
3. **Service Catalog**: Browse available IT services and request items

## CRITICAL: Use Real Data
You will be provided with REAL DATA from the ServiceNow instance in the system context. 
ALWAYS use this real data in your responses. Never make up numbers or IDs.

## Conversation Rules:
- Be conversational, friendly, and concise like a human assistant
- Maintain context across the conversation
- After answering, always suggest a relevant follow-up action
- Never break character or discuss anything outside ServiceNow
- ALWAYS use the actual numbers and data provided to you

## Response Format:
- Keep responses concise (2-4 sentences for simple queries)
- Use bullet points for lists
- Include relevant IDs/numbers when referencing items
- Always end with a helpful follow-up question

## When handling incident creation:
If the user wants to create an incident, ask for:
1. Short description/title of the issue
2. Detailed description
3. Urgency (Low/Medium/High)
4. Impact (Low/Medium/High)

Once you have all the information, confirm with the user before creating.
Format your confirmation like this:
"I'll create an incident with:
- Title: [short_description]
- Description: [description]
- Urgency: [urgency]
- Impact: [impact]

Should I proceed with creating this incident?"

When the user confirms (says yes, proceed, create it, etc.), respond with:
"Creating incident now... [CONFIRM_CREATE_INCIDENT]"

This will trigger the actual incident creation in ServiceNow.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Chat request with messages:', messages.length);

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    const userMessage = latestMessage?.content || '';

    // Parse user intent and fetch real data
    const { intents, params } = parseUserIntent(userMessage);
    console.log('Detected intents:', intents, 'params:', params);

    // Collect real ServiceNow data
    const serviceNowData: ServiceNowData = {};
    let incidentCreated = false;
    let createdIncidentNumber = '';

    // Check if user is confirming incident creation
    const lowerMessage = userMessage.toLowerCase();
    const isConfirmingCreation = (
      lowerMessage.includes('yes') || 
      lowerMessage.includes('proceed') || 
      lowerMessage.includes('create it') ||
      lowerMessage.includes('go ahead') ||
      lowerMessage.includes('confirm')
    ) && messages.some((m: { content: string }) => 
      m.content.includes('Should I proceed') || 
      m.content.includes('create an incident with') ||
      m.content.includes('create this incident')
    );

    if (isConfirmingCreation) {
      console.log('User is confirming incident creation');
      // Extract incident data from conversation
      const incidentData = extractIncidentData(messages);
      console.log('Extracted incident data:', incidentData);

      if (incidentData?.shortDescription) {
        try {
          const urgencyMap: Record<string, string> = { low: '3', medium: '2', high: '1' };
          const impactMap: Record<string, string> = { low: '3', medium: '2', high: '1' };

          const result = await callServiceNow('createIncident', {
            short_description: incidentData.shortDescription,
            description: incidentData.description || incidentData.shortDescription,
            urgency: urgencyMap[incidentData.urgency || 'medium'] || '2',
            impact: impactMap[incidentData.impact || 'medium'] || '2',
          }) as { result: { number: string } };

          createdIncidentNumber = result?.result?.number || '';
          incidentCreated = true;
          serviceNowData.createdIncident = { number: createdIncidentNumber };
          console.log('Created incident:', createdIncidentNumber);
        } catch (error) {
          console.error('Error creating incident:', error);
        }
      }
    }

    // Fetch data based on detected intents
    for (const intent of intents) {
      try {
        switch (intent) {
          case 'getArticleCount':
            const articleResult = await callServiceNow('getArticleCount') as { result: { stats: { count: string } } };
            serviceNowData.articleCount = parseInt(articleResult?.result?.stats?.count || '0', 10);
            console.log('Article count:', serviceNowData.articleCount);
            break;

          case 'getIncidentCount':
            const incidentResult = await callServiceNow('getIncidentCount') as { result: { stats: { count: string } } };
            serviceNowData.incidentCount = parseInt(incidentResult?.result?.stats?.count || '0', 10);
            console.log('Incident count:', serviceNowData.incidentCount);
            break;

          case 'getCatalogItemCount':
            const catalogCountResult = await callServiceNow('getCatalogItemCount') as { result: { stats: { count: string } } };
            serviceNowData.catalogItemCount = parseInt(catalogCountResult?.result?.stats?.count || '0', 10);
            console.log('Catalog item count:', serviceNowData.catalogItemCount);
            break;

          case 'searchArticles':
            const searchResult = await callServiceNow('searchArticles', { query: params.searchQuery }) as { result: unknown[] };
            serviceNowData.searchResults = searchResult?.result || [];
            console.log('Search results:', serviceNowData.searchResults?.length);
            break;

          case 'getIncident':
            const incidentDetailResult = await callServiceNow('getIncident', { number: params.incidentNumber }) as { result: unknown[] };
            serviceNowData.incidentDetails = incidentDetailResult?.result?.[0];
            console.log('Incident details:', serviceNowData.incidentDetails);
            break;

          case 'getCatalogItems':
            const catalogResult = await callServiceNow('getCatalogItems') as { result: unknown[] };
            serviceNowData.searchResults = catalogResult?.result || [];
            serviceNowData.catalogItemCount = serviceNowData.searchResults.length;
            console.log('Catalog items:', serviceNowData.searchResults?.length);
            break;
        }
      } catch (error) {
        console.error(`Error fetching ${intent}:`, error);
      }
    }

    // Build context-aware system prompt with real data
    let contextualPrompt = systemPrompt;

    // Add real ServiceNow data to the prompt
    if (Object.keys(serviceNowData).length > 0) {
      contextualPrompt += `\n\n## REAL DATA FROM SERVICENOW (Use these exact numbers!):\n`;
      
      if (serviceNowData.articleCount !== undefined) {
        contextualPrompt += `- Total Knowledge Articles: ${serviceNowData.articleCount}\n`;
      }
      if (serviceNowData.incidentCount !== undefined) {
        contextualPrompt += `- Total Incidents: ${serviceNowData.incidentCount}\n`;
      }
      if (serviceNowData.catalogItemCount !== undefined) {
        contextualPrompt += `- Total Service Catalog Items: ${serviceNowData.catalogItemCount}\n`;
      }
      if (serviceNowData.searchResults && serviceNowData.searchResults.length > 0) {
        contextualPrompt += `- Search Results: ${JSON.stringify(serviceNowData.searchResults, null, 2)}\n`;
      }
      if (serviceNowData.incidentDetails) {
        contextualPrompt += `- Incident Details: ${JSON.stringify(serviceNowData.incidentDetails, null, 2)}\n`;
      }
      if (incidentCreated && createdIncidentNumber) {
        contextualPrompt += `\n## INCIDENT CREATED SUCCESSFULLY!\nThe incident has been created with number: ${createdIncidentNumber}\nConfirm this to the user and provide the incident number.`;
      }
    }

    // Add conversation context
    if (context?.lastArticleId) {
      contextualPrompt += `\n\nCurrent context: User was viewing article ${context.lastArticleId}.`;
    }
    if (context?.lastIncidentId) {
      contextualPrompt += `\n\nCurrent context: User was viewing incident ${context.lastIncidentId}.`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: contextualPrompt },
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
    console.error('Chat function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
