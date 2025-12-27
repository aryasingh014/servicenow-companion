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
  const { accessToken } = config;
  
  if (!accessToken) {
    throw new Error('Google Drive access token not configured. Please reconnect Google Drive with OAuth.');
  }

  const baseUrl = 'https://www.googleapis.com/drive/v3';
  
  try {
    switch (action) {
      case 'listFiles': {
        const query = params?.query as string || '';
        const searchQuery = query ? `&q=name contains '${encodeURIComponent(query)}'` : '';
        const response = await fetch(`${baseUrl}/files?pageSize=20${searchQuery}&fields=files(id,name,mimeType,description,webViewLink,modifiedTime)`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Google Drive listFiles error: ${response.status}`, errorText);
          throw new Error(`Google Drive error: ${response.status} - ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        return {
          files: data.files || [],
          total: data.files?.length || 0,
        };
      }
      
      case 'getFileCount': {
        const countResponse = await fetch(`${baseUrl}/files?pageSize=1&fields=files(id)`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (!countResponse.ok) {
          const errorText = await countResponse.text();
          console.error(`Google Drive getFileCount error: ${countResponse.status}`, errorText);
          throw new Error(`Google Drive error: ${countResponse.status}`);
        }
        
        // Note: Google Drive doesn't provide exact count easily, this is approximate
        return { count: 'many', message: 'Google Drive does not provide exact file counts' };
      }
      
    case 'searchFiles': {
      const searchTerm = params?.query as string || '';
      if (!searchTerm) {
        return { files: [], total: 0, message: 'No search query provided' };
      }
      
      console.log(`Google Drive search: "${searchTerm}"`);
      
      // Try multiple search strategies
      const searchQueries = [
        `fullText contains '${searchTerm}'`,  // Full text search
        `name contains '${searchTerm}'`,        // Name search
        `name contains '${searchTerm}' or fullText contains '${searchTerm}'`, // Combined
      ];
      
      let allFiles: any[] = [];
      const seenIds = new Set<string>();
      
      for (const query of searchQueries) {
        try {
          const searchResp = await fetch(`${baseUrl}/files?q=${encodeURIComponent(query)}&pageSize=50&fields=files(id,name,mimeType,description,webViewLink,modifiedTime)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.files && Array.isArray(searchData.files)) {
              // Deduplicate by file ID
              for (const file of searchData.files) {
                if (!seenIds.has(file.id)) {
                  seenIds.add(file.id);
                  allFiles.push(file);
                }
              }
            }
            // If we got results, break early
            if (allFiles.length > 0) break;
          } else if (searchResp.status === 401) {
            throw new Error('Google Drive authentication failed. Please reconnect Google Drive.');
          } else if (searchResp.status === 403) {
            throw new Error('Google Drive access denied. Please check permissions.');
          }
        } catch (error) {
          if (error instanceof Error && (error.message.includes('authentication') || error.message.includes('access denied'))) {
            throw error;
          }
          console.warn(`Search query "${query}" failed:`, error);
        }
      }
      
      // If no results from fullText, try name-only search
      if (allFiles.length === 0) {
        try {
          const nameSearchResp = await fetch(`${baseUrl}/files?q=name contains '${encodeURIComponent(searchTerm)}'&pageSize=50&fields=files(id,name,mimeType,description,webViewLink,modifiedTime)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          
          if (nameSearchResp.ok) {
            const nameSearchData = await nameSearchResp.json();
            if (nameSearchData.files && Array.isArray(nameSearchData.files)) {
              allFiles = nameSearchData.files;
            }
          }
        } catch (error) {
          console.warn('Name-only search failed:', error);
        }
      }
      
      console.log(`Google Drive search found ${allFiles.length} files`);
      
      return {
        files: allFiles,
        total: allFiles.length,
        query: searchTerm,
      };
    }
      
      default:
        throw new Error(`Unknown Google Drive action: ${action}`);
    }
  } catch (error) {
    console.error('Google Drive API error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Google Drive request failed');
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
    case 'getArticleCount': {
      // Try stats API first, fallback to table query
      try {
        const statsResponse = await fetch(`${baseUrl}/api/now/stats/kb_knowledge?sysparm_count=true`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          const count = parseInt(statsData?.result?.stats?.count || '0', 10);
          console.log(`Article count from stats API: ${count}`);
          return { count };
        }
      } catch (error) {
        console.warn('Stats API failed, using fallback:', error);
      }
      
      // Fallback: use table query with X-Total-Count header
      endpoint = '/api/now/table/kb_knowledge?sysparm_limit=1';
      break;
    }
    
    case 'getIncidentCount': {
      try {
        const statsResponse = await fetch(`${baseUrl}/api/now/stats/incident?sysparm_count=true`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          const count = parseInt(statsData?.result?.stats?.count || '0', 10);
          console.log(`Incident count from stats API: ${count}`);
          return { count };
        }
      } catch (error) {
        console.warn('Stats API failed, using fallback:', error);
      }
      
      endpoint = '/api/now/table/incident?sysparm_limit=1';
      break;
    }
    
    case 'getCatalogItemCount': {
      try {
        const statsResponse = await fetch(`${baseUrl}/api/now/stats/sc_cat_item?sysparm_count=true`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          const count = parseInt(statsData?.result?.stats?.count || '0', 10);
          console.log(`Catalog item count from stats API: ${count}`);
          return { count };
        }
      } catch (error) {
        console.warn('Stats API failed, using fallback:', error);
      }
      
      endpoint = '/api/now/table/sc_cat_item?sysparm_limit=1';
      break;
    }
    
    case 'searchArticles': {
      const searchQuery = params?.query as string || '';
      // Include text field for full article content and filter for published articles
      endpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(searchQuery)}^ORtextLIKE${encodeURIComponent(searchQuery)}^workflow_state=published&sysparm_fields=sys_id,number,short_description,text,category,workflow_state&sysparm_limit=20`;
      break;
    }
    
    case 'getIncident': {
      const incidentNumber = params?.number as string;
      if (!incidentNumber) {
        throw new Error('Incident number is required');
      }
      endpoint = `/api/now/table/incident?sysparm_query=number=${incidentNumber}&sysparm_fields=sys_id,number,short_description,description,state,priority,urgency,impact,assignment_group,opened_at,caller_id&sysparm_limit=1`;
      break;
    }
    
    case 'createIncident': {
      endpoint = '/api/now/table/incident';
      method = 'POST';
      body = JSON.stringify({
        short_description: params?.short_description,
        description: params?.description || '',
        urgency: params?.urgency || '2',
        impact: params?.impact || '2',
        category: params?.category || '',
        state: '1', // New
      });
      break;
    }
    
    case 'getCatalogItems': {
      endpoint = '/api/now/table/sc_cat_item?sysparm_fields=sys_id,name,short_description,category,price&sysparm_limit=50';
      break;
    }
    
    default:
      throw new Error(`Unknown ServiceNow action: ${action}`);
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
    throw new Error(`ServiceNow API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  
  // Handle count queries with X-Total-Count header fallback
  if (action === 'getArticleCount' || action === 'getIncidentCount' || action === 'getCatalogItemCount') {
    const totalCountHeader = response.headers.get('X-Total-Count');
    if (totalCountHeader) {
      const count = parseInt(totalCountHeader, 10);
      console.log(`Count from X-Total-Count header: ${count}`);
      return { count };
    }
    
    // Try to parse from response
    if (data?.result?.stats?.count) {
      return { count: parseInt(data.result.stats.count, 10) };
    }
    
    // Last resort: return 0
    console.warn('Could not determine count, returning 0');
    return { count: 0 };
  }
  
  // Format searchArticles response for better AI understanding
  if (action === 'searchArticles' && data?.result) {
    const articles = Array.isArray(data.result) ? data.result : [];
    return {
      result: articles.map((article: any) => ({
        sys_id: article.sys_id,
        number: article.number,
        short_description: article.short_description || '',
        text: article.text || '',
        category: article.category?.display_value || article.category || 'General',
        workflow_state: article.workflow_state?.display_value || article.workflow_state || 'Published',
      })),
      total: articles.length,
    };
  }
  
  // Format getIncident response
  if (action === 'getIncident' && data?.result) {
    const incidents = Array.isArray(data.result) ? data.result : [];
    if (incidents.length > 0) {
      const incident = incidents[0];
      return {
        result: [{
          sys_id: incident.sys_id,
          number: incident.number,
          short_description: incident.short_description || '',
          description: incident.description || '',
          state: incident.state?.display_value || incident.state || 'Unknown',
          priority: incident.priority?.display_value || incident.priority || 'Unknown',
          urgency: incident.urgency?.display_value || incident.urgency || 'Unknown',
          impact: incident.impact?.display_value || incident.impact || 'Unknown',
          assignment_group: incident.assignment_group?.display_value || incident.assignment_group || 'Unassigned',
          opened_at: incident.opened_at || '',
          caller_id: incident.caller_id?.display_value || incident.caller_id || 'Unknown',
        }],
      };
    }
    return { result: [], message: 'Incident not found' };
  }
  
  // Format createIncident response
  if (action === 'createIncident' && data?.result) {
    const incident = Array.isArray(data.result) ? data.result[0] : data.result;
    return {
      result: [{
        sys_id: incident.sys_id,
        number: incident.number,
        short_description: incident.short_description,
        state: incident.state?.display_value || incident.state || 'New',
        message: `Incident ${incident.number} created successfully`,
      }],
    };
  }
  
  // Return data as-is for other actions
  return data;
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
