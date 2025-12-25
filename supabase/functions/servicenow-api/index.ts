import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceNowRequest {
  action: 'getArticleCount' | 'getIncidentCount' | 'getCatalogItemCount' | 'getArticle' | 'getIncident' | 'createIncident' | 'searchArticles' | 'getCatalogItems';
  params?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SERVICENOW_INSTANCE = Deno.env.get('SERVICENOW_INSTANCE');
    const SERVICENOW_USERNAME = Deno.env.get('SERVICENOW_USERNAME');
    const SERVICENOW_PASSWORD = Deno.env.get('SERVICENOW_PASSWORD');

    if (!SERVICENOW_INSTANCE || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
      throw new Error('ServiceNow credentials not configured');
    }

    const baseUrl = `https://${SERVICENOW_INSTANCE}`;
    const authHeader = 'Basic ' + btoa(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`);

    const { action, params } = await req.json() as ServiceNowRequest;
    console.log(`ServiceNow API: ${action}`, params);

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

      case 'getArticle':
        const articleNumber = params?.number as string;
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=number=${articleNumber}&sysparm_fields=sys_id,number,short_description,text,category,kb_category&sysparm_limit=1`;
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
        endpoint = '/api/now/table/sc_cat_item?sysparm_fields=sys_id,name,short_description,category&sysparm_limit=20';
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
      throw new Error(`ServiceNow API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('ServiceNow response:', JSON.stringify(data).substring(0, 500));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in servicenow-api function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
