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
  createdIncident?: { number: string; sys_id?: string };
  creationError?: string;
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
      // Ensure we're creating a NEW incident - don't include any existing identifiers
      body = JSON.stringify({
        short_description: params?.short_description,
        description: params?.description,
        urgency: params?.urgency || '2',
        impact: params?.impact || '2',
        category: params?.category,
        // Explicitly set state to New to ensure it's a new incident
        state: '1', // 1 = New
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
function parseUserIntent(message: string, conversationHistory: Array<{ role: string; content: string }> = []): { intents: string[], params: Record<string, unknown> } {
  const lowerMessage = message.toLowerCase();
  const intents: string[] = [];
  const params: Record<string, unknown> = {};

  // Build context from conversation history
  const conversationText = conversationHistory.map(m => m.content).join(' ').toLowerCase();
  const fullContext = (conversationText + ' ' + lowerMessage).toLowerCase();

  // Check for count/total queries (more flexible matching)
  const countKeywords = ['how many', 'how much', 'count', 'total', 'total number', 'number of'];
  const hasCountIntent = countKeywords.some(keyword => lowerMessage.includes(keyword));

  // Check for article-related queries - BE PROACTIVE
  const articleKeywords = ['article', 'articles', 'knowledge', 'kb', 'documentation', 'doc', 'guide', 'help', 'how to', 'recommendation', 'recommend', 'solution', 'fix', 'troubleshoot'];
  const hasArticleIntent = articleKeywords.some(keyword => lowerMessage.includes(keyword)) || 
                          (hasCountIntent && conversationText.includes('article'));

  // If user asks about ANY topic (like "spam", "password", etc.) without explicit article keyword, 
  // treat it as a search query for knowledge articles
  // This catches questions like "What is the first recommendation to reduce spam?"
  const isGeneralQuery = !lowerMessage.includes('incident') && 
                        !lowerMessage.includes('catalog') && 
                        !lowerMessage.includes('create') &&
                        !hasCountIntent && // Not asking for counts
                        (lowerMessage.includes('?') || 
                         lowerMessage.includes('what') || 
                         lowerMessage.includes('how') || 
                         lowerMessage.includes('recommendation') ||
                         lowerMessage.includes('recommend') ||
                         lowerMessage.includes('solution') ||
                         lowerMessage.includes('help') ||
                         lowerMessage.includes('fix') ||
                         lowerMessage.includes('troubleshoot') ||
                         (lowerMessage.length > 15 && !lowerMessage.match(/^(show|list|get|fetch)/i))); // Substantial query that's not a command

  if (hasArticleIntent || isGeneralQuery) {
    if (hasCountIntent || lowerMessage.includes('total') || lowerMessage.includes('how many') || lowerMessage.includes('how much')) {
      intents.push('getArticleCount');
    }
    
    // Check for explicit search
    const searchMatch = lowerMessage.match(/search\s+(?:for\s+)?['"]?([^'"]+)['"]?/i) ||
                        lowerMessage.match(/find\s+(?:articles?\s+(?:about|on|for)\s+)?['"]?([^'"]+)['"]?/i);
    
    if (searchMatch) {
      intents.push('searchArticles');
      params.searchQuery = searchMatch[1].trim();
    } else if (isGeneralQuery && !hasCountIntent) {
      // For general queries (like "What is the first recommendation action to reduce spam?"),
      // extract the main topic and search for it
      // Remove common question words and extract the topic
      const stopWords = /\b(what|is|the|first|recommendation|action|to|reduce|how|can|i|you|me|for|about|on|with|regarding|tell|show|give|provide|find|search|know|need|want|help|with|regarding|concerning)\b/gi;
      
      // Try to extract key phrases - look for patterns like "to reduce spam", "about password", etc.
      let topic = '';
      
      // Pattern 1: "to [verb] [noun]" -> extract verb + noun
      const toVerbMatch = lowerMessage.match(/to\s+(\w+)\s+([a-z\s]+?)(?:\?|$|,|\.)/i);
      if (toVerbMatch && toVerbMatch[2]) {
        topic = (toVerbMatch[1] + ' ' + toVerbMatch[2]).trim();
      }
      
      // Pattern 2: "about [topic]" or "regarding [topic]"
      const aboutMatch = lowerMessage.match(/(?:about|regarding|concerning|for)\s+([a-z\s]+?)(?:\?|$|,|\.)/i);
      if (aboutMatch && aboutMatch[1]) {
        topic = aboutMatch[1].trim();
      }
      
      // Pattern 3: Extract meaningful words after removing stop words
      if (!topic || topic.length < 3) {
        topic = lowerMessage
          .replace(stopWords, ' ')
          .replace(/[?.,!]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(word => word.length > 2) // Filter out short words
          .slice(0, 4) // Take first 4 meaningful words
          .join(' ');
      }
      
      // Clean up the topic
      topic = topic
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(word => word.length > 2)
        .slice(0, 3) // Max 3 words for search
        .join(' ');
      
      if (topic && topic.length > 2) {
        intents.push('searchArticles');
        params.searchQuery = topic;
        console.log(`🔍 Auto-detected search query: "${topic}" from message: "${message}"`);
      }
    }
  }

  // Check for incident-related queries
  const incidentKeywords = ['incident', 'incidents'];
  const hasIncidentIntent = incidentKeywords.some(keyword => lowerMessage.includes(keyword)) ||
                           (hasCountIntent && (conversationText.includes('incident') || lowerMessage.includes('incident')));

  if (hasIncidentIntent) {
    if (hasCountIntent || lowerMessage.includes('total') || lowerMessage.includes('how many') || lowerMessage.includes('how much')) {
      intents.push('getIncidentCount');
    }
    
    // Improved incident number parsing - handles variations like "I and C0010010", "INC0010010", "inc0010010"
    // Match patterns: INC + digits, I and C + digits, or just digits after "incident number"
    const incidentNumberPatterns = [
      /\binc\s*(\d{7,})\b/i,  // INC0010010 or inc 0010010 (word boundary)
      /\bi\s+and\s+c\s*(\d{7,})\b/i,  // I and C0010010 (word boundary)
      /incident\s+(?:number\s+)?(?:is\s+)?(?:i\s+and\s+c\s*)?(\d{7,})\b/i,  // incident number I and C0010010 or incident number 0010010
      /incident\s+(?:inc\s*)?(\d{7,})\b/i,  // incident INC0010010
      /(?:about|for|regarding|information\s+about)\s+(?:incident\s+)?(?:inc\s*)?(\d{7,})\b/i,  // information about INC0010010
    ];

    for (const pattern of incidentNumberPatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        const capturedNumber = match[1]; // Use captured group (digits only)
        if (capturedNumber) {
          // Normalize to INC format - always prefix with INC
          const normalizedNumber = `INC${capturedNumber}`;
          intents.push('getIncident');
          params.incidentNumber = normalizedNumber;
          console.log(`📋 Parsed incident number: "${message}" -> ${normalizedNumber}`);
          break;
        }
      }
    }

    // Check for incident creation
    if (lowerMessage.includes('create') || lowerMessage.includes('new') || lowerMessage.includes('open') || lowerMessage.includes('submit')) {
      intents.push('createIncident');
    }
  }

  // Check for catalog-related queries
  const catalogKeywords = ['catalog', 'service catalog', 'catalog item'];
  const hasCatalogIntent = catalogKeywords.some(keyword => lowerMessage.includes(keyword)) ||
                          (hasCountIntent && conversationText.includes('catalog'));

  if (hasCatalogIntent || (lowerMessage.includes('service') && lowerMessage.includes('item'))) {
    if (hasCountIntent || lowerMessage.includes('total') || lowerMessage.includes('how many') || lowerMessage.includes('items')) {
      intents.push('getCatalogItemCount');
    }
    if (lowerMessage.includes('list') || lowerMessage.includes('show') || lowerMessage.includes('what') || lowerMessage.includes('available')) {
      intents.push('getCatalogItems');
    }
  }

  // If user just says "total number of" or similar without context, check conversation history
  if (hasCountIntent && intents.length === 0) {
    if (conversationText.includes('article') || conversationText.includes('knowledge')) {
      intents.push('getArticleCount');
    } else if (conversationText.includes('incident')) {
      intents.push('getIncidentCount');
    } else if (conversationText.includes('catalog')) {
      intents.push('getCatalogItemCount');
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

// Function to learn from user corrections in conversation
async function learnFromConversation(
  userMessage: string,
  previousAssistantResponse: string | undefined,
  conversationContext: string
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 
                        Deno.env.get('VITE_SUPABASE_URL')?.replace('/rest/v1', '') || '';
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
                        Deno.env.get('SUPABASE_ANON_KEY') || '';
    
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return;
    }

    const functionUrl = `${SUPABASE_URL}/functions/v1/learning`;
    await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        action: 'learn_from_conversation',
        data: {
          userMessage,
          previousAssistantResponse,
          conversationContext,
        },
      }),
    });
  } catch (error) {
    console.error('Error learning from conversation:', error);
  }
}

// Function to get real-time adjustments from conversational learning
async function getConversationalAdjustments(): Promise<Array<{
  type: string;
  rule: string;
  priority: string;
  reason: string;
}>> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 
                        Deno.env.get('VITE_SUPABASE_URL')?.replace('/rest/v1', '') || '';
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
                        Deno.env.get('SUPABASE_ANON_KEY') || '';
    
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return [];
    }

    const functionUrl = `${SUPABASE_URL}/functions/v1/learning`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ action: 'get_adjustments' }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.adjustments || [];
    }
  } catch (error) {
    console.error('Error fetching conversational adjustments:', error);
  }
  return [];
}

// Base system prompt
const baseSystemPrompt = `You are a helpful ServiceNow voice assistant named NOVA (Now Operations Virtual Assistant). You help users with:

1. **Knowledge Articles**: Search, view, and summarize documentation
2. **Incidents**: View existing incidents, check status, and create new ones
3. **Service Catalog**: Browse available IT services and request items

## ✅ FULL PERMISSION TO FETCH SERVICENOW DATA:
You have FULL PERMISSION to fetch ANY data from ServiceNow when users ask about:
- Knowledge articles (articles, documentation, guides, solutions, recommendations, help topics)
- Incidents (counts, details, creation)
- Service catalog items
- ANY ServiceNow-related query

**IMPORTANT**: When a user asks a question (like "What is the first recommendation to reduce spam?"), 
the system will AUTOMATICALLY search ServiceNow knowledge articles for relevant information.
You should use the search results provided below to answer the user's question.

## ⚠️ CRITICAL DATA USAGE RULES:
1. **NEVER MAKE UP NUMBERS** - If you don't have real data provided below, you MUST say "I don't have that information right now" or "Let me fetch that for you"
2. **ALWAYS USE EXACT NUMBERS** - When real data is provided in the "REAL DATA FROM SERVICENOW" section, you MUST use those exact numbers
3. **NO ESTIMATES** - Never guess, estimate, or approximate numbers
4. **USE SEARCH RESULTS** - If search results are provided below, use them to answer the user's question. Don't say "I can't" - you CAN and SHOULD use the data provided
5. **BE PROACTIVE** - If search results are available, provide helpful information from them. Don't be overly cautious

## Conversation Rules:
- Be conversational, friendly, and concise like a human assistant
- Maintain context across the conversation
- After answering, always suggest a relevant follow-up action
- Never break character or discuss anything outside ServiceNow
- **CRITICAL**: Only provide numbers/data that are explicitly provided in the "REAL DATA FROM SERVICENOW" section below

## Response Format:
- Keep responses concise (2-4 sentences for simple queries)
- Use bullet points for lists
- Include relevant IDs/numbers when referencing items
- Always end with a helpful follow-up question
- If data is not available, be honest: "I don't have that information available right now. Would you like me to fetch it?"

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

// Build dynamic system prompt with conversational learning adjustments
async function buildSystemPrompt(): Promise<string> {
  const adjustments = await getConversationalAdjustments();
  let prompt = baseSystemPrompt;

  if (adjustments.length > 0) {
    prompt += `\n\n## 🎓 LEARNED FROM USER CORRECTIONS (Apply These Now):\n`;
    prompt += `The following instructions were learned from user corrections in conversation:\n\n`;
    
    adjustments.forEach((adj, index) => {
      prompt += `${index + 1}. **[${adj.priority.toUpperCase()} PRIORITY]**\n`;
      prompt += `   ${adj.rule}\n`;
      if (adj.reason) {
        prompt += `   (Learned from: ${adj.reason})\n`;
      }
      prompt += `\n`;
    });

    prompt += `**CRITICAL**: These are direct instructions from users. Apply them immediately in your responses.\n`;
    prompt += `When responding, follow the patterns and instructions learned from user corrections above.\n`;
  }

  return prompt;
}

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

    // Check if user is providing a correction/instruction (learning opportunity)
    const previousAssistantResponse = messages.length >= 2 && messages[messages.length - 2]?.role === 'assistant'
      ? messages[messages.length - 2].content
      : undefined;
    
    const conversationContext = messages
      .slice(-5)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // Learn from user corrections in real-time (non-blocking)
    learnFromConversation(userMessage, previousAssistantResponse, conversationContext).catch(err => {
      console.error('Learning error (non-blocking):', err);
    });

    // Parse user intent and fetch real data (pass full conversation history for context)
    const { intents, params } = parseUserIntent(userMessage, messages);
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

          console.log('🔄 Creating new incident in ServiceNow...');
          const result = await callServiceNow('createIncident', {
            short_description: incidentData.shortDescription,
            description: incidentData.description || incidentData.shortDescription,
            urgency: urgencyMap[incidentData.urgency || 'medium'] || '2',
            impact: impactMap[incidentData.impact || 'medium'] || '2',
          }) as { result: { number: string; sys_id: string; short_description: string } };

          // ServiceNow should return a NEW incident with a unique number
          const newIncidentNumber = result?.result?.number;
          const newSysId = result?.result?.sys_id;
          
          if (!newIncidentNumber) {
            throw new Error('ServiceNow did not return an incident number');
          }

          // Verify this is a new incident by checking the sys_id and number
          console.log('✅ ServiceNow response:', {
            number: newIncidentNumber,
            sys_id: newSysId,
            short_description: result?.result?.short_description
          });

          // Double-check: Verify the incident exists and is new
          // We can't easily check if it's truly new without querying, but we can verify it exists
          const verifyResult = await callServiceNow('getIncident', { number: newIncidentNumber }) as { result: unknown[] };
          
          if (verifyResult?.result && verifyResult.result.length > 0) {
            const verifiedIncident = verifyResult.result[0] as { sys_id: string; number: string };
            if (verifiedIncident.sys_id === newSysId) {
              // Confirmed: This is the newly created incident
          createdIncidentNumber = newIncidentNumber;
          incidentCreated = true;
          serviceNowData.createdIncident = { number: createdIncidentNumber, sys_id: newSysId };
          console.log('✅ Incident created successfully:', {
            number: createdIncidentNumber,
            sys_id: newSysId,
            verified: true
          });
            } else {
              throw new Error(`Incident number ${newIncidentNumber} already exists with different sys_id`);
            }
          } else {
            // Incident was created but verification failed - still use it but log warning
            console.warn('⚠️ Could not verify incident, but using returned number:', newIncidentNumber);
            createdIncidentNumber = newIncidentNumber;
            incidentCreated = true;
            serviceNowData.createdIncident = { number: createdIncidentNumber };
          }
        } catch (error) {
          console.error('❌ Error creating incident:', error);
          // Add error to context so AI can inform user
          serviceNowData.creationError = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    }

    // If no intents detected but user asked about counts, try to infer from conversation context
    if (intents.length === 0) {
      const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
      const lowerMessage = userMessage.toLowerCase();
      
      // Check if user is asking for a count/total
      const countKeywords = ['how many', 'how much', 'count', 'total', 'total number', 'number of'];
      const isAskingForCount = countKeywords.some(keyword => lowerMessage.includes(keyword));
      
      if (isAskingForCount) {
        // Check conversation history to infer what they're asking about
        if (conversationText.includes('article') || conversationText.includes('knowledge')) {
          intents.push('getArticleCount');
          console.log('📊 Inferred intent: getArticleCount from conversation context');
        } else if (conversationText.includes('incident')) {
          intents.push('getIncidentCount');
          console.log('📊 Inferred intent: getIncidentCount from conversation context');
        } else if (conversationText.includes('catalog')) {
          intents.push('getCatalogItemCount');
          console.log('📊 Inferred intent: getCatalogItemCount from conversation context');
        }
      }
    }

    // Fetch data based on detected intents - ALWAYS fetch real-time data
    for (const intent of intents) {
      try {
        switch (intent) {
          case 'getArticleCount':
            const articleResult = await callServiceNow('getArticleCount') as { result: { stats: { count: string } } };
            serviceNowData.articleCount = parseInt(articleResult?.result?.stats?.count || '0', 10);
            console.log('✅ Article count fetched:', serviceNowData.articleCount);
            break;

          case 'getIncidentCount':
            const incidentResult = await callServiceNow('getIncidentCount') as { result: { stats: { count: string } } };
            serviceNowData.incidentCount = parseInt(incidentResult?.result?.stats?.count || '0', 10);
            console.log('✅ Incident count fetched:', serviceNowData.incidentCount);
            break;

          case 'getCatalogItemCount':
            const catalogCountResult = await callServiceNow('getCatalogItemCount') as { result: { stats: { count: string } } };
            serviceNowData.catalogItemCount = parseInt(catalogCountResult?.result?.stats?.count || '0', 10);
            console.log('✅ Catalog item count fetched:', serviceNowData.catalogItemCount);
            break;

          case 'searchArticles':
            const searchResult = await callServiceNow('searchArticles', { query: params.searchQuery }) as { result: unknown[] };
            serviceNowData.searchResults = searchResult?.result || [];
            console.log('✅ Search results fetched:', serviceNowData.searchResults?.length);
            break;

          case 'getIncident':
            const incidentNumber = params.incidentNumber as string;
            console.log('🔍 Looking up incident:', incidentNumber);
            const incidentDetailResult = await callServiceNow('getIncident', { number: incidentNumber }) as { result: unknown[] };
            serviceNowData.incidentDetails = incidentDetailResult?.result?.[0];
            if (serviceNowData.incidentDetails) {
              console.log('✅ Incident details fetched:', JSON.stringify(serviceNowData.incidentDetails).substring(0, 200));
            } else {
              console.log('⚠️ Incident not found:', incidentNumber);
            }
            break;

          case 'getCatalogItems':
            const catalogResult = await callServiceNow('getCatalogItems') as { result: unknown[] };
            serviceNowData.searchResults = catalogResult?.result || [];
            serviceNowData.catalogItemCount = serviceNowData.searchResults.length;
            console.log('✅ Catalog items fetched:', serviceNowData.searchResults?.length);
            break;
        }
      } catch (error) {
        console.error(`❌ Error fetching ${intent}:`, error);
        // Don't throw - continue with other intents
      }
    }

    // Build context-aware system prompt with real data and feedback adjustments
    const dynamicSystemPrompt = await buildSystemPrompt();
    let contextualPrompt = dynamicSystemPrompt;

    // Add real ServiceNow data to the prompt - MAKE IT VERY EXPLICIT
    if (Object.keys(serviceNowData).length > 0) {
      contextualPrompt += `\n\n## ⚠️ REAL DATA FROM SERVICENOW - USE THESE EXACT NUMBERS ONLY ⚠️\n`;
      contextualPrompt += `**DO NOT MAKE UP NUMBERS. USE ONLY THE DATA BELOW:**\n\n`;
      
      if (serviceNowData.articleCount !== undefined) {
        contextualPrompt += `**Total Knowledge Articles: ${serviceNowData.articleCount}**\n`;
        contextualPrompt += `When user asks about article count, you MUST say: "${serviceNowData.articleCount} knowledge articles"\n\n`;
      }
      if (serviceNowData.incidentCount !== undefined) {
        contextualPrompt += `**Total Incidents: ${serviceNowData.incidentCount}**\n`;
        contextualPrompt += `When user asks about incident count, you MUST say: "${serviceNowData.incidentCount} incidents"\n\n`;
      }
      if (serviceNowData.catalogItemCount !== undefined) {
        contextualPrompt += `**Total Service Catalog Items: ${serviceNowData.catalogItemCount}**\n`;
        contextualPrompt += `When user asks about catalog count, you MUST say: "${serviceNowData.catalogItemCount} catalog items"\n\n`;
      }
      if (serviceNowData.searchResults && serviceNowData.searchResults.length > 0) {
        contextualPrompt += `**✅ SEARCH RESULTS FROM SERVICENOW (${serviceNowData.searchResults.length} found):**\n`;
        contextualPrompt += `${JSON.stringify(serviceNowData.searchResults, null, 2)}\n\n`;
        contextualPrompt += `**IMPORTANT**: These search results contain knowledge articles from ServiceNow that are relevant to the user's question.\n`;
        contextualPrompt += `You MUST use these results to answer the user's question. Provide helpful information from these articles.\n`;
        contextualPrompt += `If the user asked a question (like "What is the first recommendation to reduce spam?"), \n`;
        contextualPrompt += `use the article titles and descriptions above to provide recommendations and solutions.\n`;
        contextualPrompt += `DO NOT say "I can't" or "I don't have access" - you HAVE the data above and SHOULD use it!\n\n`;
      }
      if (serviceNowData.incidentDetails) {
        contextualPrompt += `**Incident Details Found:**\n${JSON.stringify(serviceNowData.incidentDetails, null, 2)}\n\n`;
        contextualPrompt += `Provide the user with all the details from the incident above.\n\n`;
      } else if (intents.includes('getIncident') && params.incidentNumber) {
        contextualPrompt += `**⚠️ INCIDENT NOT FOUND:** The incident number "${params.incidentNumber}" does not exist in ServiceNow.\n`;
        contextualPrompt += `Tell the user: "I'm sorry, but there is no incident with the number ${params.incidentNumber}."\n\n`;
      }
      if (incidentCreated && createdIncidentNumber) {
        const sysId = serviceNowData.createdIncident?.sys_id;
        contextualPrompt += `\n## ✅ INCIDENT CREATED SUCCESSFULLY!\n`;
        contextualPrompt += `**NEW INCIDENT CREATED:**\n`;
        contextualPrompt += `- Incident Number: ${createdIncidentNumber} (this is a UNIQUE, NEW incident number)\n`;
        if (sysId) {
          contextualPrompt += `- System ID: ${sysId} (unique identifier)\n`;
        }
        contextualPrompt += `\nTell the user: "Incident created successfully! The incident number is ${createdIncidentNumber}."\n`;
        contextualPrompt += `**IMPORTANT**: This is a NEW incident with a UNIQUE number. ServiceNow automatically generates unique incident numbers.\n\n`;
      } else if (serviceNowData.creationError) {
        contextualPrompt += `\n## ❌ INCIDENT CREATION FAILED\n`;
        contextualPrompt += `Error: ${serviceNowData.creationError}\n`;
        contextualPrompt += `Tell the user: "I'm sorry, but I encountered an error while creating the incident: ${serviceNowData.creationError}. Please try again or contact your ServiceNow administrator."\n\n`;
      }
      
      contextualPrompt += `\n**REMEMBER: If data is shown above, you MUST use it. Never make up different numbers!**\n`;
    } else {
      // If user asked for data but none was fetched, tell AI to acknowledge this
      const lowerMessage = userMessage.toLowerCase();
      if (lowerMessage.includes('how many') || lowerMessage.includes('count') || lowerMessage.includes('total')) {
        contextualPrompt += `\n\n⚠️ **IMPORTANT**: The user asked for a count/total, but no data was fetched from ServiceNow.\n`;
        contextualPrompt += `You MUST tell the user: "I don't have that information available right now. Would you like me to fetch it?"\n`;
        contextualPrompt += `DO NOT make up any numbers!\n`;
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
