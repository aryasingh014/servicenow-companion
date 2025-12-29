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
      name: "servicenow_get_article_count",
      description: "Get the total number of knowledge articles in ServiceNow. ALWAYS use this when user asks 'how many articles', 'total articles', 'article count', 'number of articles'.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_get_incident_count",
      description: "Get the total number of incidents in ServiceNow. ALWAYS use this when user asks 'how many incidents', 'total incidents', 'incident count', 'number of incidents'.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_get_article_by_number",
      description: "Get a specific knowledge article by its number (e.g., KB0000001, KB0010002). Use this when user provides a KB article number.",
      parameters: {
        type: "object",
        properties: {
          article_number: { type: "string", description: "Article number like KB0000001" }
        },
        required: ["article_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "servicenow_search_articles",
      description: "Search ServiceNow knowledge base articles by keywords. Use for finding articles about topics, not for specific article numbers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" }
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
      description: "List recent ServiceNow incidents. Use when user wants to see incidents list.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["new", "in_progress", "resolved", "closed"], description: "Filter by status" },
          priority: { type: "string", enum: ["1", "2", "3", "4", "5"], description: "Filter by priority" },
          limit: { type: "number", description: "Max results (default 10)" }
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
          short_description: { type: "string", description: "Brief description" },
          description: { type: "string", description: "Detailed description" },
          urgency: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" },
          impact: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" }
        },
        required: ["short_description"]
      }
    }
  },
  // Google Drive tools
  {
    type: "function",
    function: {
      name: "google_drive_list_files",
      description: "List files in Google Drive. Use when user asks to list, show, or see files.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional filter" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "google_drive_search_files",
      description: "Search Google Drive files by name or content.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "google_drive_read_file",
      description: "Read the text content of a Google Drive file so you can summarize or analyze it. Use this when user asks to summarize, read, or analyze a Drive file.",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "The Google Drive file ID" },
          file_name: { type: "string", description: "Optional file name for context" }
        },
        required: ["file_id"]
      }
    }
  },
  // Jira tools
  {
    type: "function",
    function: {
      name: "jira_search_issues",
      description: "Search Jira issues",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text or JQL" },
          project: { type: "string", description: "Project key" },
          status: { type: "string", description: "Status filter" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "jira_get_issue",
      description: "Get Jira issue details by key (e.g., PROJ-123)",
      parameters: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key" }
        },
        required: ["issue_key"]
      }
    }
  },
  // RAG search
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Search indexed documents from uploaded files, Confluence, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          source_type: { type: "string", description: "Filter by source" }
        },
        required: ["query"]
      }
    }
  },
  // WhatsApp tools
  {
    type: "function",
    function: {
      name: "whatsapp_send_message",
      description: "Send a WhatsApp message to a phone number. Use when user wants to send a message via WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number with country code (e.g., +1234567890)" },
          message: { type: "string", description: "Message text to send" }
        },
        required: ["to", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "whatsapp_get_conversations",
      description: "Get WhatsApp Business conversation analytics and counts.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  // GitHub tools
  {
    type: "function",
    function: {
      name: "github_list_repos",
      description: "List GitHub repositories. Use when user asks to list, show, or see their repos/repositories.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["all", "owner", "public", "private", "member"], description: "Type of repos to list" },
          sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"], description: "Sort order" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_get_repo",
      description: "Get details of a specific GitHub repository by owner and repo name.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (username or org)" },
          repo: { type: "string", description: "Repository name" }
        },
        required: ["owner", "repo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_search_repos",
      description: "Search GitHub repositories by query. Use when user asks to search or find repos.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          language: { type: "string", description: "Filter by programming language" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_search_code",
      description: "Search code in GitHub repositories. Use when user asks to find code or search in files.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          repo: { type: "string", description: "Filter by repo (owner/repo format)" },
          language: { type: "string", description: "Filter by programming language" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_get_file",
      description: "Get the contents of a file from a GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path in the repository" },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        required: ["owner", "repo", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_list_issues",
      description: "List issues in a GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state filter" }
        },
        required: ["owner", "repo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_list_pulls",
      description: "List pull requests in a GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "PR state filter" }
        },
        required: ["owner", "repo"]
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
      case 'servicenow_get_article_by_number': {
        const articleNumber = args.article_number as string;
        if (!articleNumber) {
          return { error: "Article number is required" };
        }
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=number=${encodeURIComponent(articleNumber)}&sysparm_fields=sys_id,number,short_description,text,category,workflow_state&sysparm_limit=1`;
        break;
      }

      case 'servicenow_search_articles': {
        const searchQuery = args.query as string;
        if (!searchQuery) {
          return { error: "Search query is required" };
        }
        endpoint = `/api/now/table/kb_knowledge?sysparm_query=short_descriptionLIKE${encodeURIComponent(searchQuery)}^ORtextLIKE${encodeURIComponent(searchQuery)}&sysparm_fields=sys_id,number,short_description,text,category,workflow_state&sysparm_limit=20`;
        break;
      }

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

      case 'servicenow_get_article_count': {
        // Try stats API first
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
            return { count, message: `Total knowledge articles: ${count}` };
          }
        } catch (error) {
          console.warn('Stats API failed, using fallback:', error);
        }
        
        // Fallback: use table query with X-Total-Count header
        try {
          const tableResponse = await fetch(`${baseUrl}/api/now/table/kb_knowledge?sysparm_limit=1`, {
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json',
            },
          });
          
          if (tableResponse.ok) {
            const totalCountHeader = tableResponse.headers.get('X-Total-Count');
            if (totalCountHeader) {
              const count = parseInt(totalCountHeader, 10);
              console.log(`Article count from X-Total-Count: ${count}`);
              return { count, message: `Total knowledge articles: ${count}` };
            }
          }
        } catch (error) {
          console.error('Table query fallback failed:', error);
        }
        
        return { error: 'Unable to retrieve article count' };
      }

      case 'servicenow_get_incident_count': {
        // Try stats API first
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
            return { count, message: `Total incidents: ${count}` };
          }
        } catch (error) {
          console.warn('Stats API failed, using fallback:', error);
        }
        
        // Fallback: use table query with X-Total-Count header
        try {
          const tableResponse = await fetch(`${baseUrl}/api/now/table/incident?sysparm_limit=1`, {
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json',
            },
          });
          
          if (tableResponse.ok) {
            const totalCountHeader = tableResponse.headers.get('X-Total-Count');
            if (totalCountHeader) {
              const count = parseInt(totalCountHeader, 10);
              console.log(`Incident count from X-Total-Count: ${count}`);
              return { count, message: `Total incidents: ${count}` };
            }
          }
        } catch (error) {
          console.error('Table query fallback failed:', error);
        }
        
        return { error: 'Unable to retrieve incident count' };
      }

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

    // Count queries are handled above and return early, so we only get here for other queries
    const data = await response.json();
    
    // Format response for better AI understanding
    if (functionName === 'servicenow_get_article_by_number' && data?.result) {
      const articles = Array.isArray(data.result) ? data.result : [];
      if (articles.length > 0) {
        const article = articles[0];
        return {
          number: article.number,
          title: article.short_description || '',
          content: article.text || '',
          category: article.category?.display_value || article.category || 'General',
          status: article.workflow_state?.display_value || article.workflow_state || 'Published',
        };
      }
      return { error: `Knowledge article ${args.article_number} not found` };
    }
    
    if (functionName === 'servicenow_search_articles' && data?.result) {
      const articles = Array.isArray(data.result) ? data.result : [];
      return articles.map((article: any) => ({
        number: article.number,
        title: article.short_description || '',
        content: article.text || '',
        category: article.category?.display_value || article.category || 'General',
        status: article.workflow_state?.display_value || article.workflow_state || 'Published',
      }));
    }
    
    if (functionName === 'servicenow_get_incident' && data?.result) {
      const incidents = Array.isArray(data.result) ? data.result : [];
      if (incidents.length > 0) {
        const incident = incidents[0];
        return {
          number: incident.number,
          title: incident.short_description || '',
          description: incident.description || '',
          state: incident.state?.display_value || incident.state || 'Unknown',
          priority: incident.priority?.display_value || incident.priority || 'Unknown',
          urgency: incident.urgency?.display_value || incident.urgency || 'Unknown',
          impact: incident.impact?.display_value || incident.impact || 'Unknown',
          assignment_group: incident.assignment_group?.display_value || incident.assignment_group || 'Unassigned',
          opened_at: incident.opened_at || '',
        };
      }
      return { error: 'Incident not found' };
    }
    
    if (functionName === 'servicenow_list_incidents' && data?.result) {
      const incidents = Array.isArray(data.result) ? data.result : [];
      return {
        incidents: incidents.map((incident: any) => ({
          number: incident.number,
          title: incident.short_description || '',
          state: incident.state?.display_value || incident.state || 'Unknown',
          priority: incident.priority?.display_value || incident.priority || 'Unknown',
          opened_at: incident.opened_at || '',
        })),
        count: incidents.length,
        message: `Found ${incidents.length} incident(s). Note: This is a limited list, not the total count.`,
      };
    }
    
    if (functionName === 'servicenow_create_incident' && data?.result) {
      const incident = Array.isArray(data.result) ? data.result[0] : data.result;
      return {
        success: true,
        number: incident.number,
        sys_id: incident.sys_id,
        message: `Incident ${incident.number} created successfully`,
      };
    }
    
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

// Execute Google Drive function
async function executeGoogleDrive(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<unknown> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  try {
    console.log(`Executing Google Drive: ${functionName}`, args);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/connector-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        connector: 'google-drive',
        action: functionName === 'google_drive_list_files' 
          ? 'listFiles' 
          : functionName === 'google_drive_read_file' 
            ? 'getFileContent' 
            : 'searchFiles',
        config: config,
        params: functionName === 'google_drive_read_file' 
          ? { fileId: args.file_id } 
          : args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Drive API error:', response.status, errorText);
      return { error: 'Google Drive request failed', details: errorText };
    }

    const result = await response.json();
    console.log('Google Drive API result:', JSON.stringify(result).substring(0, 500));
    
    if (!result.success) {
      return { error: result.error || 'Google Drive request failed' };
    }

    const data = result.data;
    
    // Handle file content response (from google_drive_read_file)
    if (data?.content !== undefined) {
      return {
        file_id: data.id,
        file_name: data.name || args.file_name || 'Unknown',
        mime_type: data.mimeType || 'unknown',
        content: data.content,
        content_length: data.content?.length || 0,
        message: `Successfully retrieved content from "${data.name || 'file'}" (${data.content?.length || 0} characters)`,
      };
    }
    
    // Format response for better AI understanding
    if (data?.files && Array.isArray(data.files)) {
      if (data.files.length === 0) {
        return {
          files: [],
          total: 0,
          message: `No files found${args.query ? ` matching "${args.query}"` : ''} in Google Drive. Try a different search term or check if files exist.`,
        };
      }
      
      return {
        files: data.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          type: file.mimeType || 'unknown',
          description: file.description || '',
          link: file.webViewLink || '',
          modified: file.modifiedTime || '',
        })),
        total: data.total || data.files.length,
        message: `Found ${data.files.length} file(s)${args.query ? ` matching "${args.query}"` : ''} in Google Drive`,
      };
    }
    
    // If no files array, return the data as-is
    return data;
  } catch (error) {
    console.error('Google Drive execution error:', error);
    return { error: error instanceof Error ? error.message : 'Google Drive request failed' };
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

// Execute WhatsApp function
async function executeWhatsApp(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>,
  supabaseUrl: string,
  supabaseKey: string
): Promise<unknown> {
  try {
    console.log(`Executing WhatsApp: ${functionName}`, args);
    
    let action = 'testConnection';
    if (functionName === 'whatsapp_send_message') {
      action = 'sendMessage';
    } else if (functionName === 'whatsapp_get_conversations') {
      action = 'getMessages';
    }
    
    const response = await fetch(`${supabaseUrl}/functions/v1/connector-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        connector: 'whatsapp',
        action,
        config,
        params: args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('WhatsApp API error:', response.status, errorText);
      return { error: 'WhatsApp request failed', details: errorText };
    }

    const result = await response.json();
    
    if (!result.success) {
      return { error: result.error || 'WhatsApp request failed' };
    }

    return result.data;
  } catch (error) {
    console.error('WhatsApp execution error:', error);
    return { error: error instanceof Error ? error.message : 'WhatsApp request failed' };
  }
}

// Execute GitHub function
async function executeGitHub(
  functionName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const GITHUB_TOKEN = Deno.env.get('GITHUB_ACCESS_TOKEN') || '';

  if (!GITHUB_TOKEN) {
    return { error: "GitHub not configured. Please add your GitHub access token in Settings." };
  }

  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    switch (functionName) {
      case 'github_list_repos': {
        const type = (args.type as string) || 'all';
        const sort = (args.sort as string) || 'updated';
        const response = await fetch(
          `https://api.github.com/user/repos?type=${type}&sort=${sort}&per_page=20`,
          { headers }
        );
        if (!response.ok) {
          const error = await response.text();
          console.error('GitHub list repos error:', error);
          return { error: `GitHub API error: ${response.status}` };
        }
        const repos = await response.json();
        return {
          repos: repos.map((r: any) => ({
            name: r.full_name,
            description: r.description || 'No description',
            language: r.language || 'Unknown',
            stars: r.stargazers_count,
            forks: r.forks_count,
            url: r.html_url,
            updated: r.updated_at,
            private: r.private,
          })),
          total: repos.length,
          message: `Found ${repos.length} repositories`,
        };
      }

      case 'github_get_repo': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          { headers }
        );
        if (!response.ok) {
          return { error: `Repository ${owner}/${repo} not found` };
        }
        const r = await response.json();
        return {
          name: r.full_name,
          description: r.description || 'No description',
          language: r.language,
          stars: r.stargazers_count,
          forks: r.forks_count,
          watchers: r.watchers_count,
          open_issues: r.open_issues_count,
          default_branch: r.default_branch,
          url: r.html_url,
          created: r.created_at,
          updated: r.updated_at,
          private: r.private,
        };
      }

      case 'github_search_repos': {
        const query = args.query as string;
        const language = args.language as string;
        let searchQuery = query;
        if (language) searchQuery += ` language:${language}`;
        
        const response = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=10`,
          { headers }
        );
        if (!response.ok) {
          return { error: `Search failed: ${response.status}` };
        }
        const data = await response.json();
        return {
          repos: data.items?.map((r: any) => ({
            name: r.full_name,
            description: r.description || 'No description',
            language: r.language || 'Unknown',
            stars: r.stargazers_count,
            url: r.html_url,
          })) || [],
          total: data.total_count,
          message: `Found ${data.total_count} repositories matching "${query}"`,
        };
      }

      case 'github_search_code': {
        const query = args.query as string;
        const repo = args.repo as string;
        const language = args.language as string;
        
        let searchQuery = query;
        if (repo) searchQuery += ` repo:${repo}`;
        if (language) searchQuery += ` language:${language}`;
        
        const response = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(searchQuery)}&per_page=10`,
          { headers }
        );
        if (!response.ok) {
          const error = await response.text();
          console.error('GitHub search code error:', error);
          return { error: `Code search failed: ${response.status}` };
        }
        const data = await response.json();
        return {
          results: data.items?.map((item: any) => ({
            file: item.name,
            path: item.path,
            repo: item.repository?.full_name,
            url: item.html_url,
          })) || [],
          total: data.total_count,
          message: `Found ${data.total_count} code matches for "${query}"`,
        };
      }

      case 'github_get_file': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const path = args.path as string;
        const branch = (args.branch as string) || 'main';
        
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
          { headers }
        );
        if (!response.ok) {
          return { error: `File not found: ${path}` };
        }
        const data = await response.json();
        
        if (data.type !== 'file') {
          return { error: `${path} is not a file` };
        }
        
        // Decode base64 content
        const content = atob(data.content.replace(/\n/g, ''));
        return {
          path: data.path,
          name: data.name,
          size: data.size,
          content: content.substring(0, 5000), // Limit content size
          truncated: content.length > 5000,
          url: data.html_url,
          message: `Retrieved file ${data.name} (${data.size} bytes)`,
        };
      }

      case 'github_list_issues': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const state = (args.state as string) || 'open';
        
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=15`,
          { headers }
        );
        if (!response.ok) {
          return { error: `Could not fetch issues for ${owner}/${repo}` };
        }
        const issues = await response.json();
        return {
          issues: issues.filter((i: any) => !i.pull_request).map((i: any) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            author: i.user?.login,
            labels: i.labels?.map((l: any) => l.name),
            created: i.created_at,
            url: i.html_url,
          })),
          total: issues.filter((i: any) => !i.pull_request).length,
          message: `Found ${issues.filter((i: any) => !i.pull_request).length} ${state} issues`,
        };
      }

      case 'github_list_pulls': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const state = (args.state as string) || 'open';
        
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=15`,
          { headers }
        );
        if (!response.ok) {
          return { error: `Could not fetch PRs for ${owner}/${repo}` };
        }
        const prs = await response.json();
        return {
          pull_requests: prs.map((p: any) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            author: p.user?.login,
            branch: p.head?.ref,
            target: p.base?.ref,
            created: p.created_at,
            url: p.html_url,
          })),
          total: prs.length,
          message: `Found ${prs.length} ${state} pull requests`,
        };
      }

      default:
        return { error: `Unknown GitHub function: ${functionName}` };
    }
  } catch (error) {
    console.error('GitHub execution error:', error);
    return { error: error instanceof Error ? error.message : 'GitHub request failed' };
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

  if (toolName.startsWith('google_drive_')) {
    const source = connectedSources.find(s => s.type === 'google-drive' || s.id === 'google-drive');
    if (!source?.config) {
      return { error: "Google Drive not connected. Please connect Google Drive in Settings." };
    }
    if (!source.config.accessToken) {
      return { error: "Google Drive needs to be reconnected. Please disconnect and connect again to grant access." };
    }
    return executeGoogleDrive(toolName, args, source.config);
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

  if (toolName.startsWith('whatsapp_')) {
    const source = connectedSources.find(s => s.type === 'whatsapp' || s.id === 'whatsapp');
    if (!source?.config) {
      return { error: "WhatsApp not connected. Please connect WhatsApp Business API in Settings." };
    }
    return executeWhatsApp(toolName, args, source.config, supabaseUrl, supabaseKey);
  }

  if (toolName.startsWith('github_')) {
    return executeGitHub(toolName, args);
  }

  return { error: `Unknown tool: ${toolName}` };
}

// Helper to shorten IDs - show only last 4 digits
function shortenId(id: string): string {
  if (!id || id.length <= 4) return id;
  // For IDs like INC0010017, KB0000001 - keep prefix + last 4
  const match = id.match(/^([A-Z]+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const digits = match[2];
    return `${prefix}...${digits.slice(-4)}`;
  }
  return `...${id.slice(-4)}`;
}

// Build system prompt
function buildSystemPrompt(connectedSources: ConnectedSource[]): string {
  const sourceNames = connectedSources.map(s => s.name).join(', ');
  const hasServiceNow = connectedSources.some(s => s.type === 'servicenow' || s.id === 'servicenow') || Deno.env.get('SERVICENOW_INSTANCE');
  const hasGoogleDrive = connectedSources.some(s => s.type === 'google-drive' || s.id === 'google-drive');
  const hasGitHub = !!Deno.env.get('GITHUB_ACCESS_TOKEN') || connectedSources.some(s => s.type === 'github' || s.id === 'github');
  
  return `You are NOVA, a friendly and intelligent AI assistant. You communicate naturally like a helpful colleague, not a robot.

## Your Personality:
- Be warm, conversational, and human-like
- Use casual language (contractions like "I'll", "you're", "that's")
- Show empathy and understanding
- Be concise but friendly
- Use natural phrases like "Let me check that for you", "Here's what I found", "Looks like..."
- NEVER sound robotic or overly formal

## ID Display Rules - CRITICAL:
When mentioning incident or article IDs, ALWAYS shorten them to make them readable:
- INC0010017 → show as "INC...0017" or just "incident ending in 0017"
- KB0000001 → show as "KB...0001" or just "article ending in 0001"
- NEVER show the full long ID unless user specifically asks for it
- When listing multiple items, just show the short version

## Connected Data Sources:
${connectedSources.length > 0 ? sourceNames : 'None connected yet'}
${hasGitHub ? '+ GitHub (connected via token)' : ''}

## Your Capabilities:
- **ServiceNow**: Search articles, get counts, manage incidents
- **Google Drive**: List and search files
- **Jira**: Search and retrieve issues
- **WhatsApp**: Send messages via WhatsApp Business API
- **GitHub**: List repos, search code, view files, list issues and PRs
- **Documents**: Search uploaded files and knowledge bases

## CRITICAL: You MUST call functions when available. Never say "I can't" if a function exists.

## Response Style Examples:
❌ BAD (robotic): "The incident INC0010017 has been created successfully with priority 1."
✅ GOOD (human): "Done! Created incident ...0017 with high priority. Anything else you need?"

❌ BAD: "There are 4793 incidents in the ServiceNow system."
✅ GOOD: "You've got 4,793 incidents in ServiceNow. That's quite a few! Want me to filter by status or priority?"

❌ BAD: "I have retrieved the following knowledge articles matching your query."
✅ GOOD: "Found a few articles for you! Here's what looks relevant:"

❌ BAD: "The knowledge article KB0000001 contains the following information."
✅ GOOD: "Here's article ...0001 - looks like it covers exactly what you're asking about:"

## Behavior Rules:
1. ALWAYS call functions - never refuse if a function exists
2. Keep responses short and friendly (2-3 sentences for simple queries)
3. Offer helpful follow-ups naturally
4. Shorten all IDs when displaying them
5. If no results found, be helpful: "Hmm, couldn't find that one. Maybe try a different search term?"

${hasServiceNow ? `
## ServiceNow Connected - Use These:
- "how many articles" → servicenow_get_article_count
- "how many incidents" → servicenow_get_incident_count
- Article number (KB...) → servicenow_get_article_by_number
- Incident number (INC...) → servicenow_get_incident
` : ''}

${hasGoogleDrive ? `
## Google Drive Connected - Use These:
- "list files" → google_drive_list_files
- "search for X" → google_drive_search_files
` : ''}

${hasGitHub ? `
## GitHub Connected - Use These:
- "list my repos" → github_list_repos
- "show repo X" → github_get_repo
- "search repos for X" → github_search_repos
- "search code for X" → github_search_code
- "get file X from repo Y" → github_get_file
- "list issues in repo X" → github_list_issues
- "list PRs in repo X" → github_list_pulls
` : ''}

${connectedSources.length === 0 && !hasGitHub ? `
## No Sources Yet:
Friendly guide them: "Hey! To get started, head to Settings and connect your tools - ServiceNow, Jira, Google Drive, whatever you use. Then come back and I can help you search and manage everything!"
` : ''}`
}

// Filter tools based on connected sources
function getAvailableTools(connectedSources: ConnectedSource[]): typeof AVAILABLE_TOOLS {
  const connectedTypes = new Set(connectedSources.map(s => s.type || s.id));
  const hasGitHubToken = !!Deno.env.get('GITHUB_ACCESS_TOKEN');
  
  return AVAILABLE_TOOLS.filter(tool => {
    const name = tool.function.name;
    
    // ServiceNow tools - check both config and env vars
    if (name.startsWith('servicenow_')) {
      const hasEnvConfig = Deno.env.get('SERVICENOW_INSTANCE') && Deno.env.get('SERVICENOW_USERNAME');
      return connectedTypes.has('servicenow') || hasEnvConfig;
    }
    
    // Google Drive tools
    if (name.startsWith('google_drive_')) {
      return connectedTypes.has('google-drive');
    }
    
    // Jira tools
    if (name.startsWith('jira_')) {
      return connectedTypes.has('jira');
    }
    
    // GitHub tools - check env var
    if (name.startsWith('github_')) {
      return connectedTypes.has('github') || hasGitHubToken;
    }
    
    // WhatsApp tools
    if (name.startsWith('whatsapp_')) {
      return connectedTypes.has('whatsapp');
    }
    
    // Document search - available if any document source connected
    if (name === 'search_documents') {
      const docSources = ['file', 'confluence', 'notion', 'sharepoint'];
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
    
    // Detect if user is asking for counts or lists and add explicit instruction
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const isCountQuery = /how many|total|count|number of/.test(lastMessage);
    const isListQuery = /list|show|display/.test(lastMessage) && /file|document/.test(lastMessage);
    
    // Enhance system prompt with explicit instruction if needed
    let enhancedSystemPrompt = systemPrompt;
    if (isCountQuery && lastMessage.includes('article')) {
      enhancedSystemPrompt += '\n\n⚠️ USER IS ASKING FOR ARTICLE COUNT - YOU MUST CALL servicenow_get_article_count NOW!';
    } else if (isCountQuery && lastMessage.includes('incident')) {
      enhancedSystemPrompt += '\n\n⚠️ USER IS ASKING FOR INCIDENT COUNT - YOU MUST CALL servicenow_get_incident_count NOW!';
    } else if (isListQuery && lastMessage.includes('drive')) {
      enhancedSystemPrompt += '\n\n⚠️ USER IS ASKING TO LIST FILES - YOU MUST CALL google_drive_list_files NOW!';
    }

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
          { role: 'system', content: enhancedSystemPrompt },
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