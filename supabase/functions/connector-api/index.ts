import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConnectorRequest {
  connector: string;
  action: string;
  config: Record<string, string>;
  params?: Record<string, unknown>;
}

// Google Drive API helper
async function callGoogleDrive(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  // Note: This is a simplified implementation. Real Google Drive integration requires OAuth2 flow
  const { accessToken } = config;
  
  if (!accessToken) {
    throw new Error('Google Drive access token not configured. Please reconnect Google Drive with OAuth.');
  }

  const baseUrl = 'https://www.googleapis.com/drive/v3';
  
  switch (action) {
    case 'listFiles':
      const query = params?.query as string || '';
      const searchQuery = query ? `&q=name contains '${encodeURIComponent(query)}'` : '';
      const response = await fetch(`${baseUrl}/files?pageSize=20${searchQuery}&fields=files(id,name,mimeType,description,webViewLink)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Google Drive error: ${response.status}`);
      return response.json();
      
    case 'getFileCount':
      const countResponse = await fetch(`${baseUrl}/files?pageSize=1&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!countResponse.ok) throw new Error(`Google Drive error: ${countResponse.status}`);
      // Note: Google Drive doesn't provide exact count easily, this is approximate
      return { count: 'many' };
      
    case 'searchFiles':
      const searchTerm = params?.query as string || '';
      const searchResp = await fetch(`${baseUrl}/files?q=fullText contains '${encodeURIComponent(searchTerm)}'&pageSize=10&fields=files(id,name,mimeType,description,webViewLink)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!searchResp.ok) throw new Error(`Google Drive error: ${searchResp.status}`);
      return searchResp.json();
      
    default:
      throw new Error(`Unknown Google Drive action: ${action}`);
  }
}

// Confluence API helper
async function callConfluence(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { url, email, apiToken } = config;
  
  if (!url || !email || !apiToken) {
    throw new Error('Confluence credentials not configured');
  }

  const baseUrl = url.replace(/\/$/, '');
  const authHeader = 'Basic ' + btoa(`${email}:${apiToken}`);

  switch (action) {
    case 'searchContent':
      const query = params?.query as string || '';
      const cql = encodeURIComponent(`text ~ "${query}" OR title ~ "${query}"`);
      const response = await fetch(`${baseUrl}/wiki/rest/api/content/search?cql=${cql}&limit=10`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Confluence error: ${response.status}`);
      return response.json();
      
    case 'getSpaces':
      const spacesResponse = await fetch(`${baseUrl}/wiki/rest/api/space?limit=50`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!spacesResponse.ok) throw new Error(`Confluence error: ${spacesResponse.status}`);
      return spacesResponse.json();
      
    default:
      throw new Error(`Unknown Confluence action: ${action}`);
  }
}

// Jira API helper
async function callJira(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { url, email, apiToken } = config;
  
  if (!url || !email || !apiToken) {
    throw new Error('Jira credentials not configured');
  }

  const baseUrl = url.replace(/\/$/, '');
  const authHeader = 'Basic ' + btoa(`${email}:${apiToken}`);

  switch (action) {
    case 'searchIssues':
      const query = params?.query as string || '';
      const jql = encodeURIComponent(`text ~ "${query}" OR summary ~ "${query}"`);
      const response = await fetch(`${baseUrl}/rest/api/3/search?jql=${jql}&maxResults=10`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Jira error: ${response.status}`);
      return response.json();
      
    case 'getProjects':
      const projectsResponse = await fetch(`${baseUrl}/rest/api/3/project`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!projectsResponse.ok) throw new Error(`Jira error: ${projectsResponse.status}`);
      return projectsResponse.json();
      
    default:
      throw new Error(`Unknown Jira action: ${action}`);
  }
}

// Notion API helper
async function callNotion(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { integrationToken } = config;
  
  if (!integrationToken) {
    throw new Error('Notion integration token not configured');
  }

  const headers = {
    'Authorization': `Bearer ${integrationToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  switch (action) {
    case 'search':
      const query = params?.query as string || '';
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, page_size: 10 }),
      });
      if (!response.ok) throw new Error(`Notion error: ${response.status}`);
      return response.json();
      
    case 'getDatabases':
      const dbResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { property: 'object', value: 'database' }, page_size: 20 }),
      });
      if (!dbResponse.ok) throw new Error(`Notion error: ${dbResponse.status}`);
      return dbResponse.json();
      
    default:
      throw new Error(`Unknown Notion action: ${action}`);
  }
}

// GitHub API helper
async function callGitHub(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { accessToken, organization } = config;
  
  if (!accessToken) {
    throw new Error('GitHub access token not configured');
  }

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/vnd.github.v3+json',
  };

  switch (action) {
    case 'searchCode':
      const query = params?.query as string || '';
      const org = organization ? `+org:${organization}` : '';
      const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}${org}&per_page=10`, {
        headers,
      });
      if (!response.ok) throw new Error(`GitHub error: ${response.status}`);
      return response.json();
      
    case 'searchRepos':
      const repoQuery = params?.query as string || '';
      const repoOrg = organization ? `+org:${organization}` : '';
      const repoResponse = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(repoQuery)}${repoOrg}&per_page=10`, {
        headers,
      });
      if (!repoResponse.ok) throw new Error(`GitHub error: ${repoResponse.status}`);
      return repoResponse.json();
      
    case 'getRepos':
      const endpoint = organization 
        ? `https://api.github.com/orgs/${organization}/repos`
        : 'https://api.github.com/user/repos';
      const reposResponse = await fetch(`${endpoint}?per_page=20`, { headers });
      if (!reposResponse.ok) throw new Error(`GitHub error: ${reposResponse.status}`);
      return reposResponse.json();
      
    default:
      throw new Error(`Unknown GitHub action: ${action}`);
  }
}

// Slack API helper
async function callSlack(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { botToken } = config;
  
  if (!botToken) {
    throw new Error('Slack bot token not configured');
  }

  const headers = {
    'Authorization': `Bearer ${botToken}`,
    'Content-Type': 'application/json',
  };

  switch (action) {
    case 'searchMessages':
      const query = params?.query as string || '';
      const response = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=10`, {
        headers,
      });
      if (!response.ok) throw new Error(`Slack error: ${response.status}`);
      return response.json();
      
    case 'getChannels':
      const channelsResponse = await fetch('https://slack.com/api/conversations.list?limit=50', {
        headers,
      });
      if (!channelsResponse.ok) throw new Error(`Slack error: ${channelsResponse.status}`);
      return channelsResponse.json();
      
    default:
      throw new Error(`Unknown Slack action: ${action}`);
  }
}

// ServiceNow API helper (existing implementation)
async function callServiceNow(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { instanceUrl, username, password } = config;
  
  // Also check environment variables as fallback
  const instance = instanceUrl || Deno.env.get('SERVICENOW_INSTANCE');
  const user = username || Deno.env.get('SERVICENOW_USERNAME');
  const pass = password || Deno.env.get('SERVICENOW_PASSWORD');

  if (!instance || !user || !pass) {
    throw new Error('ServiceNow credentials not configured');
  }

  const baseUrl = instance.startsWith('http') ? instance : `https://${instance}`;
  const authHeader = 'Basic ' + btoa(`${user}:${pass}`);

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
        state: '1',
      });
      break;
    case 'getCatalogItems':
      endpoint = '/api/now/table/sc_cat_item?sysparm_fields=sys_id,name,short_description,category&sysparm_limit=50';
      break;
    default:
      throw new Error(`Unknown ServiceNow action: ${action}`);
  }

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

// Main router function
async function routeConnectorRequest(request: ConnectorRequest): Promise<unknown> {
  const { connector, action, config, params } = request;

  console.log(`Routing request: ${connector} -> ${action}`);

  switch (connector) {
    case 'google-drive':
      return callGoogleDrive(config, action, params);
    case 'confluence':
      return callConfluence(config, action, params);
    case 'jira':
      return callJira(config, action, params);
    case 'notion':
      return callNotion(config, action, params);
    case 'github':
      return callGitHub(config, action, params);
    case 'slack':
      return callSlack(config, action, params);
    case 'servicenow':
      return callServiceNow(config, action, params);
    default:
      throw new Error(`Unsupported connector: ${connector}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ConnectorRequest = await req.json();
    
    if (!request.connector || !request.action) {
      throw new Error('Missing connector or action');
    }

    const result = await routeConnectorRequest(request);

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Connector API error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
