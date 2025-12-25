import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const systemPrompt = `You are a helpful ServiceNow voice assistant named NOVA (Now Operations Virtual Assistant). You help users with:

1. **Knowledge Articles**: Search, view, and summarize documentation
2. **Incidents**: View existing incidents, check status, and create new ones
3. **Service Catalog**: Browse available IT services and request items

## Conversation Rules:
- Be conversational, friendly, and concise like a human assistant
- Maintain context across the conversation
- After answering, always suggest a relevant follow-up action
- Never break character or discuss anything outside ServiceNow

## Response Format:
- Keep responses concise (2-4 sentences for simple queries)
- Use bullet points for lists
- Include relevant IDs/numbers when referencing items
- Always end with a helpful follow-up question

## When handling incident creation:
Ask for information step by step:
1. Short description
2. Detailed description  
3. Urgency (Low/Medium/High)
4. Impact (Low/Medium/High)

## Example responses:
- "I found 54 knowledge articles. Would you like me to search for a specific topic, or should I show you the most recent ones?"
- "Incident INC0010395 is currently In Progress with High priority. It's about email access issues. Would you like me to show similar incidents or add a comment?"`;

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

    // Build context-aware system prompt
    let contextualPrompt = systemPrompt;
    if (context?.lastArticleId) {
      contextualPrompt += `\n\nCurrent context: User was viewing article ${context.lastArticleId}.`;
    }
    if (context?.lastIncidentId) {
      contextualPrompt += `\n\nCurrent context: User was viewing incident ${context.lastIncidentId}.`;
    }
    if (context?.incidentCreationFlow) {
      contextualPrompt += `\n\nUser is currently creating an incident. Current step: ${context.incidentCreationFlow.step}. Collected data: ${JSON.stringify(context.incidentCreationFlow.data)}`;
    }

    console.log('Chat request with messages:', messages.length);

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
