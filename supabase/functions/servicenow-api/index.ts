import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceNowRequest {
  action: 'getArticleCount' | 'getIncidentCount' | 'getCatalogItemCount' | 'getArticle' | 'getIncident' | 'createIncident' | 'updateIncident' | 'searchArticles' | 'getCatalogItems' | 'testKnowledgeArticles';
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
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=number=${articleNumber}^workflow_state=published&sysparm_fields=sys_id,number,short_description,text,category,kb_category&sysparm_limit=1`;
        console.log(`Fetching article by number: ${articleNumber}, endpoint: ${endpoint}`);
        break;

      case 'searchArticles':
        const searchQuery = params?.query as string;
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(searchQuery)}^ORtextLIKE${encodeURIComponent(searchQuery)}^workflow_state=published&sysparm_fields=sys_id,number,short_description,category&sysparm_limit=10`;
        console.log(`Searching articles with query: "${searchQuery}", encoded endpoint: ${endpoint}`);
        break;

      case 'getIncident':
        const incidentNumber = params?.number as string;
        endpoint = `/api/now/table/incident?sysparm_query=number=${incidentNumber}&sysparm_fields=sys_id,number,short_description,description,state,priority,assignment_group,opened_at,caller_id&sysparm_limit=1`;
        break;

      case 'createIncident':
        endpoint = '/api/now/table/incident';
        method = 'POST';
        // Create a NEW incident - ServiceNow will auto-generate a unique number
        // DO NOT include number, sys_id, or any existing identifiers - let ServiceNow generate them
        body = JSON.stringify({
          short_description: params?.short_description,
          description: params?.description,
          urgency: params?.urgency || '2',
          impact: params?.impact || '2',
          category: params?.category,
          state: '1', // Explicitly set to New (1) to ensure it's a new incident
        });
        console.log('📝 Creating incident with data:', {
          short_description: typeof params?.short_description === 'string' ? params.short_description.substring(0, 50) : params?.short_description,
          urgency: params?.urgency,
          impact: params?.impact,
          state: '1 (New)'
        });
        break;

      case 'getCatalogItems':
        endpoint = '/api/now/table/sc_cat_item?sysparm_fields=sys_id,name,short_description,category&sysparm_limit=20';
        break;

      case 'updateIncident':
        const incidentSysId = params?.sys_id as string;
        const incidentNumberToUpdate = params?.number as string;
        
        // If we have a number but no sys_id, first fetch the sys_id
        if (!incidentSysId && incidentNumberToUpdate) {
          console.log(`🔍 Looking up sys_id for incident: ${incidentNumberToUpdate}`);
          const lookupEndpoint = `/api/now/table/incident?sysparm_query=number=${incidentNumberToUpdate}&sysparm_fields=sys_id&sysparm_limit=1`;
          
          const lookupResponse = await fetch(`${baseUrl}${lookupEndpoint}`, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          });
          
          if (!lookupResponse.ok) {
            throw new Error(`Failed to look up incident ${incidentNumberToUpdate}`);
          }
          
          const lookupData = await lookupResponse.json();
          const foundSysId = lookupData.result?.[0]?.sys_id;
          
          if (!foundSysId) {
            throw new Error(`Incident ${incidentNumberToUpdate} not found`);
          }
          
          endpoint = `/api/now/table/incident/${foundSysId}`;
        } else if (incidentSysId) {
          endpoint = `/api/now/table/incident/${incidentSysId}`;
        } else {
          throw new Error('Either sys_id or number is required to update an incident');
        }
        
        method = 'PATCH';
        
        // Build update payload - only include fields that are provided
        const updatePayload: Record<string, unknown> = {};
        if (params?.short_description) updatePayload.short_description = params.short_description;
        if (params?.description) updatePayload.description = params.description;
        if (params?.state) updatePayload.state = params.state;
        if (params?.urgency) updatePayload.urgency = params.urgency;
        if (params?.impact) updatePayload.impact = params.impact;
        if (params?.priority) updatePayload.priority = params.priority;
        if (params?.category) updatePayload.category = params.category;
        if (params?.assignment_group) updatePayload.assignment_group = params.assignment_group;
        if (params?.assigned_to) updatePayload.assigned_to = params.assigned_to;
        if (params?.close_code) updatePayload.close_code = params.close_code;
        if (params?.close_notes) updatePayload.close_notes = params.close_notes;
        if (params?.work_notes) updatePayload.work_notes = params.work_notes;
        if (params?.comments) updatePayload.comments = params.comments;
        
        body = JSON.stringify(updatePayload);
        console.log('📝 Updating incident with data:', updatePayload);
        break;

      case 'testKnowledgeArticles':
        // Test function to verify knowledge article fetching
        console.log('🧪 Testing knowledge article fetching...');

        // Test 1: Fetch article by ID
        const testArticleNumber = 'KB0000001';
        const articleEndpoint = `/api/now/table/kb_knowledge?sysparm_query=number=${testArticleNumber}^workflow_state=published&sysparm_fields=sys_id,number,short_description,text,category,kb_category&sysparm_limit=1`;
        console.log(`Testing fetch by ID: ${testArticleNumber}`);

        const articleResponse = await fetch(`${baseUrl}${articleEndpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });

        let articleResult = null;
        if (articleResponse.ok) {
          const articleData = await articleResponse.json();
          articleResult = articleData.result?.[0] || null;
          console.log(`✅ Article fetch result: ${articleResult ? 'Found' : 'Not found'}`);
          if (articleResult) {
            console.log(`   Number: ${articleResult.number}, Title: ${articleResult.short_description}`);
          }
        } else {
          console.error(`❌ Article fetch failed: ${articleResponse.status}`);
        }

        // Test 2: Search articles
        const testQuery = 'password';
        const searchEndpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(testQuery)}^ORtextLIKE${encodeURIComponent(testQuery)}^workflow_state=published&sysparm_fields=sys_id,number,short_description,category&sysparm_limit=10`;
        console.log(`Testing search query: "${testQuery}"`);

        const searchResponse = await fetch(`${baseUrl}${searchEndpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });

        let searchResults = [];
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          searchResults = searchData.result || [];
          console.log(`✅ Search results: ${searchResults.length} articles found`);
          searchResults.forEach((article: any, index: number) => {
            console.log(`   ${index + 1}. ${article.number}: ${article.short_description}`);
          });
        } else {
          console.error(`❌ Search failed: ${searchResponse.status}`);
        }

        // Return test results
        return new Response(JSON.stringify({
          success: true,
          testResults: {
            articleById: {
              requested: testArticleNumber,
              found: !!articleResult,
              article: articleResult
            },
            searchQuery: {
              query: testQuery,
              count: searchResults.length,
              articles: searchResults
            }
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

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
    
    // Enhanced logging for incident creation and update
    if (action === 'createIncident' || action === 'updateIncident') {
      console.log('✅ Incident creation response:', {
        number: data?.result?.number,
        sys_id: data?.result?.sys_id,
        short_description: data?.result?.short_description,
        state: data?.result?.state,
        opened_at: data?.result?.opened_at,
        full_response: JSON.stringify(data).substring(0, 1000)
      });
      
      // Verify we got a proper response
      if (!data?.result?.number) {
        console.error('❌ ServiceNow did not return an incident number in response:', data);
        throw new Error('ServiceNow API did not return an incident number');
      }
      
      if (!data?.result?.sys_id) {
        console.error('❌ ServiceNow did not return a sys_id in response:', data);
        throw new Error('ServiceNow API did not return a sys_id');
      }
    } else {
      console.log('ServiceNow response:', JSON.stringify(data).substring(0, 500));
    }

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
