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

// Extract user ID from authorization header
async function getUserIdFromAuth(req: Request, supabaseUrl: string, supabaseKey: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// Cache for refreshed access tokens (in-memory, per request)
const tokenCache: Record<string, { accessToken: string; expiresAt: number }> = {};

// Helper to refresh Google OAuth token from refresh token
async function getGoogleAccessToken(refreshToken: string, service: 'drive' | 'gmail'): Promise<string> {
  const cacheKey = `${service}_${refreshToken.substring(0, 10)}`;
  const cached = tokenCache[cacheKey];
  
  // Return cached token if still valid (with 60s buffer)
  if (cached && cached.expiresAt > Date.now() + 60000) {
    console.log(`[OAuth] Using cached ${service} access token`);
    return cached.accessToken;
  }
  
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error(`Google OAuth credentials not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.`);
  }
  
  console.log(`[OAuth] Refreshing ${service} access token...`);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OAuth] Token refresh failed:`, response.status, errorText);
    throw new Error(`Failed to refresh ${service} token: ${response.status}`);
  }
  
  const data = await response.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  
  // Cache the token
  tokenCache[cacheKey] = {
    accessToken,
    expiresAt: Date.now() + (expiresIn * 1000),
  };
  
  console.log(`[OAuth] Successfully refreshed ${service} access token, expires in ${expiresIn}s`);
  return accessToken;
}

// Helper to detect if a token is a refresh token (starts with "1//")
function isRefreshToken(token: string): boolean {
  return token.startsWith('1//');
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
  {
    type: "function",
    function: {
      name: "servicenow_update_incident",
      description: "Update an existing ServiceNow incident. Use when user wants to update, modify, change status, resolve, close, or add notes to an incident.",
      parameters: {
        type: "object",
        properties: {
          incident_number: { type: "string", description: "Incident number like INC0012345" },
          short_description: { type: "string", description: "Updated brief description" },
          description: { type: "string", description: "Updated detailed description" },
          state: { type: "string", enum: ["1", "2", "3", "6", "7", "8"], description: "1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed, 8=Canceled" },
          urgency: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" },
          impact: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" },
          work_notes: { type: "string", description: "Internal work notes to add" },
          comments: { type: "string", description: "Customer-visible comments to add" },
          close_notes: { type: "string", description: "Resolution notes (required when resolving/closing)" }
        },
        required: ["incident_number"]
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
      name: "jira_list_projects",
      description: "List all Jira projects the user has access to. Use when user asks to list projects, show projects, or wants to know available projects.",
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
      name: "jira_search_issues",
      description: "Search Jira issues. Use when user asks to find issues, search tickets, or list issues.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text or JQL query" },
          project: { type: "string", description: "Project key to filter by" },
          status: { type: "string", description: "Status filter" }
        }
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
  {
    type: "function",
    function: {
      name: "jira_create_issue",
      description: "Create a new Jira issue/ticket. Use when user asks to create, add, or make a new issue, ticket, task, bug, or story in Jira.",
      parameters: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "Project key (e.g., KAN, PROJ)" },
          summary: { type: "string", description: "Issue title/summary" },
          description: { type: "string", description: "Detailed description of the issue" },
          issue_type: { type: "string", enum: ["Task", "Bug", "Story", "Epic"], description: "Type of issue (default: Task)" },
          priority: { type: "string", enum: ["Highest", "High", "Medium", "Low", "Lowest"], description: "Priority level" },
          assignee: { type: "string", description: "Assignee account ID or email (optional)" }
        },
        required: ["project_key", "summary"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "jira_update_issue",
      description: "Update an existing Jira issue. Use when user asks to update, modify, change, edit, or set properties on a Jira issue.",
      parameters: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (e.g., KAN-1, PROJ-123)" },
          summary: { type: "string", description: "New issue title/summary" },
          description: { type: "string", description: "New detailed description" },
          status: { type: "string", description: "New status (e.g., 'To Do', 'In Progress', 'Done')" },
          priority: { type: "string", enum: ["Highest", "High", "Medium", "Low", "Lowest"], description: "New priority level" },
          assignee: { type: "string", description: "New assignee account ID or email" },
          comment: { type: "string", description: "Add a comment to the issue" }
        },
        required: ["issue_key"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "jira_add_comment",
      description: "Add a comment to an existing Jira issue. Use when user asks to comment on, add notes to, or reply to a Jira issue.",
      parameters: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (e.g., KAN-1)" },
          comment: { type: "string", description: "The comment text to add" }
        },
        required: ["issue_key", "comment"]
      }
    }
  },
  // File connector tools
  {
    type: "function",
    function: {
      name: "file_search_documents",
      description: "Search through uploaded files and documents for ANY information including employee data, IDs, names, departments, etc. ALWAYS use this tool when: 1) User mentions employee IDs like EMP0000001, 2) User asks about employees, staff, departments, salaries, 3) User references any uploaded file or spreadsheet data, 4) User asks to find/search/look for any data that could be in files.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords - can be employee ID, name, department, or any text to find in documents" },
          file_type: { type: "string", description: "Filter by file type (xlsx, pdf, doc, txt)" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "file_list_documents",
      description: "List all uploaded and indexed documents including Excel spreadsheets, PDFs, etc. Use when user asks about what files are uploaded, wants to see available documents, or asks about employee data files.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of files to return (default 20)" }
        }
      }
    }
  },
  // Employee data CRUD tools
  {
    type: "function",
    function: {
      name: "employee_get",
      description: "Get details of a specific employee by Employee ID (e.g., EMP0000001). Use when user asks about a specific employee's details, role, department, salary, or any attribute.",
      parameters: {
        type: "object",
        properties: {
          employee_id: { type: "string", description: "Employee ID like EMP0000001, EMP0000002" }
        },
        required: ["employee_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "employee_search",
      description: "Search for employees by name, department, role, location, or other attributes. Use when user asks to find employees matching certain criteria.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query - name, department, role, location, etc." },
          department: { type: "string", description: "Filter by department" },
          role: { type: "string", description: "Filter by job title/role" },
          location: { type: "string", description: "Filter by location" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "employee_update",
      description: "Update an employee's attributes such as role, department, location, status, etc. ALWAYS use this when user asks to change, update, modify, or set any employee attribute. Example: 'Change John's role to Software Engineer' or 'Update EMP0000001's department to Engineering'.",
      parameters: {
        type: "object",
        properties: {
          employee_id: { type: "string", description: "Employee ID to update (e.g., EMP0000001)" },
          field: { type: "string", description: "Field to update: Job_Title, Department, Location, Employment_Status, etc." },
          new_value: { type: "string", description: "New value for the field" }
        },
        required: ["employee_id", "field", "new_value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "employee_list",
      description: "List all employees or filter by department, location, status. Use when user asks to show all employees or list employees in a specific department.",
      parameters: {
        type: "object",
        properties: {
          department: { type: "string", description: "Filter by department" },
          location: { type: "string", description: "Filter by location" },
          status: { type: "string", description: "Filter by employment status (Active, Inactive)" },
          limit: { type: "number", description: "Max number to return (default 20)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "employee_create",
      description: "Create a new employee record. Use when user asks to add, create, register, or hire a new employee.",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Employee's full name" },
          email: { type: "string", description: "Employee's email address" },
          department: { type: "string", description: "Department (e.g., Engineering, Sales, HR)" },
          job_title: { type: "string", description: "Job title/role" },
          location: { type: "string", description: "Work location" },
          salary: { type: "number", description: "Annual salary (optional)" },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" }
        },
        required: ["full_name", "department", "job_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "employee_delete",
      description: "Delete/remove an employee record. Use when user asks to delete, remove, terminate, or fire an employee.",
      parameters: {
        type: "object",
        properties: {
          employee_id: { type: "string", description: "Employee ID to delete (e.g., EMP0000001)" },
          reason: { type: "string", description: "Reason for deletion (optional)" }
        },
        required: ["employee_id"]
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
  },
  // Gmail tools
  {
    type: "function",
    function: {
      name: "gmail_list_emails",
      description: "List recent emails from Gmail. Use when user asks to list, show, or see their emails.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max emails to return (default 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gmail_search_emails",
      description: "Search Gmail emails by query. Use when user asks to search or find emails.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g., 'from:john', 'subject:meeting', 'is:unread')" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gmail_get_email",
      description: "Get the full content of a specific email by ID.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The Gmail message ID" }
        },
        required: ["email_id"]
      }
    }
  },
  // Notion tools
  {
    type: "function",
    function: {
      name: "notion_search",
      description: "Search Notion pages and databases. Use when user asks to find, search, or look for content in Notion.",
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
      name: "notion_list_databases",
      description: "List all Notion databases the user has access to. Use when user asks to list, show, or see their databases.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "notion_get_page",
      description: "Get the content of a specific Notion page by its ID.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "The Notion page ID" }
        },
        required: ["page_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "notion_create_page",
      description: "Create a new page in Notion. Use when user asks to create, add, or make a new page or note in Notion.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the page" },
          content: { type: "string", description: "Text content of the page" },
          parent_page_id: { type: "string", description: "Parent page ID (optional, creates in workspace root if not specified)" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "notion_update_page",
      description: "Update an existing Notion page. Use when user asks to update, edit, modify, or change a Notion page.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "The page ID to update" },
          title: { type: "string", description: "New title (optional)" },
          content: { type: "string", description: "New content to append (optional)" },
          archived: { type: "boolean", description: "Set to true to archive/delete the page" }
        },
        required: ["page_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "notion_query_database",
      description: "Query a Notion database to list its items. Use when user asks to see items in a database or list database contents.",
      parameters: {
        type: "object",
        properties: {
          database_id: { type: "string", description: "The database ID to query" },
          filter_property: { type: "string", description: "Property name to filter by (optional)" },
          filter_value: { type: "string", description: "Value to filter for (optional)" }
        },
        required: ["database_id"]
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

      case 'servicenow_update_incident': {
        const incidentNum = args.incident_number as string;
        // First lookup the sys_id
        const lookupUrl = `${baseUrl}/api/now/table/incident?sysparm_query=number=${incidentNum}&sysparm_fields=sys_id&sysparm_limit=1`;
        const lookupHeaders = {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        const lookupResp = await fetch(lookupUrl, { method: 'GET', headers: lookupHeaders });
        if (!lookupResp.ok) {
          return { error: `Failed to find incident ${incidentNum}` };
        }
        const lookupData = await lookupResp.json();
        const sysId = lookupData.result?.[0]?.sys_id;
        if (!sysId) {
          return { error: `Incident ${incidentNum} not found` };
        }
        
        endpoint = `/api/now/table/incident/${sysId}`;
        method = 'PATCH';
        const updatePayload: Record<string, unknown> = {};
        if (args.short_description) updatePayload.short_description = args.short_description;
        if (args.description) updatePayload.description = args.description;
        if (args.state) updatePayload.state = args.state;
        if (args.urgency) updatePayload.urgency = args.urgency;
        if (args.impact) updatePayload.impact = args.impact;
        if (args.work_notes) updatePayload.work_notes = args.work_notes;
        if (args.comments) updatePayload.comments = args.comments;
        if (args.close_notes) updatePayload.close_notes = args.close_notes;
        body = JSON.stringify(updatePayload);
        console.log(`Updating incident ${incidentNum} (${sysId}):`, updatePayload);
        break;
      }

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

    if (functionName === 'servicenow_update_incident' && data?.result) {
      const incident = Array.isArray(data.result) ? data.result[0] : data.result;
      const stateMap: Record<string, string> = { '1': 'New', '2': 'In Progress', '3': 'On Hold', '6': 'Resolved', '7': 'Closed', '8': 'Canceled' };
      return {
        success: true,
        number: incident.number,
        sys_id: incident.sys_id,
        state: stateMap[incident.state] || incident.state,
        message: `Incident ${incident.number} updated successfully. Current state: ${stateMap[incident.state] || incident.state}`,
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
  // Read from config first, then fall back to env vars
  const url = config.url || Deno.env.get('JIRA_URL') || '';
  const email = config.email || Deno.env.get('JIRA_EMAIL') || '';
  const apiToken = config.apiToken || Deno.env.get('JIRA_API_TOKEN') || '';

  if (!url || !email || !apiToken) {
    return { error: "Jira not configured. Please add Jira URL, email, and API token in Settings or as secrets (JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN)." };
  }

  console.log(`[Jira] Executing ${functionName} with URL: ${url}`);
  
  const baseUrl = url.replace(/\/$/, '');
  const authHeader = 'Basic ' + btoa(`${email}:${apiToken}`);

  try {
    switch (functionName) {
      case 'jira_list_projects': {
        const response = await fetch(
          `${baseUrl}/rest/api/3/project?maxResults=50`,
          { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Jira list projects error:', response.status, errorText);
          return { error: `Jira error: ${response.status}` };
        }
        
        const projects = await response.json();
        return {
          projects: projects.map((p: any) => ({
            key: p.key,
            name: p.name,
            projectType: p.projectTypeKey,
            lead: p.lead?.displayName || 'Unknown',
            url: `${baseUrl}/browse/${p.key}`,
          })),
          total: projects.length,
          message: `Found ${projects.length} project(s) in Jira`,
        };
      }

      case 'jira_search_issues': {
        let jql = 'ORDER BY created DESC';
        const query = args.query as string;
        
        // Build JQL
        if (query) {
          if (query.includes('=') || query.includes('~')) {
            jql = query; // Already JQL
          } else {
            jql = `text ~ "${query}" ORDER BY created DESC`;
          }
        }
        if (args.project) jql = `project = "${args.project}" AND ${jql}`;
        if (args.status) jql = `status = "${args.status}" AND ${jql}`;

        const response = await fetch(
          `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=20&fields=key,summary,status,priority,assignee,created`,
          { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Jira search error:', response.status, errorText);
          return { error: `Jira error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          issues: data.issues?.map((issue: any) => ({
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            priority: issue.fields?.priority?.name,
            assignee: issue.fields?.assignee?.displayName || 'Unassigned',
            created: issue.fields?.created,
            url: `${baseUrl}/browse/${issue.key}`,
          })) || [],
          total: data.total,
          message: `Found ${data.total} issue(s)${query ? ` matching "${query}"` : ''}`,
        };
      }

      case 'jira_get_issue': {
        const issueKey = args.issue_key as string;
        const response = await fetch(
          `${baseUrl}/rest/api/3/issue/${issueKey}?fields=key,summary,description,status,priority,assignee,reporter,created,updated`,
          { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
        );

        if (!response.ok) return { error: `Jira error: ${response.status}` };
        
        const issue = await response.json();
        return {
          key: issue.key,
          summary: issue.fields?.summary,
          description: issue.fields?.description?.content?.[0]?.content?.[0]?.text || 'No description',
          status: issue.fields?.status?.name,
          priority: issue.fields?.priority?.name,
          assignee: issue.fields?.assignee?.displayName || 'Unassigned',
          reporter: issue.fields?.reporter?.displayName || 'Unknown',
          created: issue.fields?.created,
          updated: issue.fields?.updated,
          url: `${baseUrl}/browse/${issue.key}`,
        };
      }

      case 'jira_create_issue': {
        const projectKey = args.project_key as string;
        const summary = args.summary as string;
        const description = args.description as string;
        const issueType = (args.issue_type as string) || 'Task';
        const priority = args.priority as string;
        const assignee = args.assignee as string;

        if (!projectKey || !summary) {
          return { error: 'Project key and summary are required' };
        }

        // Build the issue payload
        const issuePayload: any = {
          fields: {
            project: { key: projectKey },
            summary: summary,
            issuetype: { name: issueType },
          }
        };

        // Add description in Atlassian Document Format (ADF)
        if (description) {
          issuePayload.fields.description = {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }]
              }
            ]
          };
        }

        // Add priority if specified
        if (priority) {
          issuePayload.fields.priority = { name: priority };
        }

        // Add assignee if specified
        if (assignee) {
          issuePayload.fields.assignee = { accountId: assignee };
        }

        console.log('Creating Jira issue:', JSON.stringify(issuePayload));

        const response = await fetch(
          `${baseUrl}/rest/api/3/issue`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(issuePayload),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Jira create issue error:', response.status, errorText);
          return { error: `Failed to create issue: ${response.status} - ${errorText}` };
        }

        const createdIssue = await response.json();
        return {
          success: true,
          key: createdIssue.key,
          id: createdIssue.id,
          url: `${baseUrl}/browse/${createdIssue.key}`,
          message: `Successfully created issue ${createdIssue.key}: "${summary}"`,
        };
      }

      case 'jira_update_issue': {
        const issueKey = args.issue_key as string;
        const summary = args.summary as string;
        const description = args.description as string;
        const status = args.status as string;
        const priority = args.priority as string;
        const assignee = args.assignee as string;
        const comment = args.comment as string;

        if (!issueKey) {
          return { error: 'Issue key is required' };
        }

        const updatePayload: any = { fields: {} };

        if (summary) {
          updatePayload.fields.summary = summary;
        }

        if (description) {
          updatePayload.fields.description = {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }]
              }
            ]
          };
        }

        if (priority) {
          updatePayload.fields.priority = { name: priority };
        }

        if (assignee) {
          updatePayload.fields.assignee = { accountId: assignee };
        }

        // Update fields if any were specified
        if (Object.keys(updatePayload.fields).length > 0) {
          console.log('Updating Jira issue:', issueKey, JSON.stringify(updatePayload));

          const response = await fetch(
            `${baseUrl}/rest/api/3/issue/${issueKey}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatePayload),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Jira update error:', response.status, errorText);
            return { error: `Failed to update issue: ${response.status}` };
          }
        }

        // Handle status transition if specified
        if (status) {
          // First, get available transitions
          const transitionsResp = await fetch(
            `${baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
            { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
          );

          if (transitionsResp.ok) {
            const transitionsData = await transitionsResp.json();
            const transition = transitionsData.transitions?.find(
              (t: any) => t.name.toLowerCase() === status.toLowerCase() || t.to?.name?.toLowerCase() === status.toLowerCase()
            );

            if (transition) {
              await fetch(
                `${baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ transition: { id: transition.id } }),
                }
              );
            } else {
              console.warn(`Transition to "${status}" not found for issue ${issueKey}`);
            }
          }
        }

        // Add comment if specified
        if (comment) {
          await fetch(
            `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
            {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                body: {
                  type: 'doc',
                  version: 1,
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: comment }]
                    }
                  ]
                }
              }),
            }
          );
        }

        return {
          success: true,
          key: issueKey,
          url: `${baseUrl}/browse/${issueKey}`,
          message: `Successfully updated issue ${issueKey}`,
        };
      }

      case 'jira_add_comment': {
        const issueKey = args.issue_key as string;
        const comment = args.comment as string;

        if (!issueKey || !comment) {
          return { error: 'Issue key and comment are required' };
        }

        const response = await fetch(
          `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: comment }]
                  }
                ]
              }
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Jira add comment error:', response.status, errorText);
          return { error: `Failed to add comment: ${response.status}` };
        }

        const commentData = await response.json();
        return {
          success: true,
          key: issueKey,
          commentId: commentData.id,
          url: `${baseUrl}/browse/${issueKey}`,
          message: `Successfully added comment to ${issueKey}`,
        };
      }

      default:
        return { error: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    console.error('Jira execution error:', error);
    return { error: error instanceof Error ? error.message : 'Jira request failed' };
  }
}

// Execute Notion function
async function executeNotion(
  functionName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const integrationToken = Deno.env.get('NOTION_INTEGRATION_TOKEN') || '';
  
  if (!integrationToken) {
    return { error: "Notion not configured. Please add NOTION_INTEGRATION_TOKEN in secrets." };
  }

  console.log(`[Notion] Executing ${functionName}`);
  
  const headers = {
    'Authorization': `Bearer ${integrationToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  try {
    switch (functionName) {
      case 'notion_search': {
        const query = args.query as string || '';
        
        const response = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            query, 
            page_size: 20,
            sort: { direction: 'descending', timestamp: 'last_edited_time' }
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Notion search error:', response.status, errorText);
          if (response.status === 401) {
            return { error: 'Notion authentication failed. Please check your integration token.' };
          }
          return { error: `Notion API error: ${response.status}` };
        }

        const data = await response.json();
        const results = data.results || [];
        
        return {
          results: results.map((item: any) => ({
            id: item.id,
            type: item.object,
            title: item.properties?.title?.title?.[0]?.plain_text || 
                   item.properties?.Name?.title?.[0]?.plain_text ||
                   item.title?.[0]?.plain_text ||
                   'Untitled',
            url: item.url,
            lastEdited: item.last_edited_time,
          })),
          total: results.length,
          message: `Found ${results.length} result(s) in Notion`,
        };
      }

      case 'notion_list_databases': {
        const response = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            filter: { property: 'object', value: 'database' },
            page_size: 50 
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Notion list databases error:', response.status, errorText);
          return { error: `Notion API error: ${response.status}` };
        }

        const data = await response.json();
        const databases = data.results || [];
        
        return {
          databases: databases.map((db: any) => ({
            id: db.id,
            title: db.title?.[0]?.plain_text || 'Untitled Database',
            url: db.url,
            properties: Object.keys(db.properties || {}),
          })),
          total: databases.length,
          message: `Found ${databases.length} database(s) in Notion`,
        };
      }

      case 'notion_get_page': {
        const pageId = args.page_id as string;
        if (!pageId) return { error: 'Page ID is required' };

        // Get page metadata
        const pageResp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          headers,
        });

        if (!pageResp.ok) {
          return { error: `Could not fetch page: ${pageResp.status}` };
        }

        const page = await pageResp.json();

        // Get page content (blocks)
        const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
          headers,
        });

        let content = '';
        if (blocksResp.ok) {
          const blocksData = await blocksResp.json();
          content = (blocksData.results || []).map((block: any) => {
            const type = block.type;
            const textContent = block[type]?.rich_text?.map((t: any) => t.plain_text).join('') || '';
            return textContent;
          }).filter(Boolean).join('\n');
        }

        const title = page.properties?.title?.title?.[0]?.plain_text ||
                     page.properties?.Name?.title?.[0]?.plain_text ||
                     'Untitled';

        return {
          id: page.id,
          title,
          url: page.url,
          content: content || 'No text content found',
          lastEdited: page.last_edited_time,
        };
      }

      case 'notion_create_page': {
        const title = args.title as string;
        const content = args.content as string;
        const parentPageId = args.parent_page_id as string;

        if (!title) return { error: 'Title is required' };

        // Build the page payload
        const pagePayload: any = {
          properties: {
            title: {
              title: [{ type: 'text', text: { content: title } }]
            }
          }
        };

        // Set parent - if parentPageId provided, use it; otherwise we need a parent
        if (parentPageId) {
          pagePayload.parent = { page_id: parentPageId };
        } else {
          // Search for a page to use as parent (first available page)
          const searchResp = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              filter: { property: 'object', value: 'page' },
              page_size: 1 
            }),
          });
          
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.results?.length > 0) {
              pagePayload.parent = { page_id: searchData.results[0].id };
            } else {
              return { error: 'No parent page found. Please specify a parent_page_id or create a page in Notion first.' };
            }
          }
        }

        // Add content as blocks if provided
        if (content) {
          pagePayload.children = [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content } }]
              }
            }
          ];
        }

        console.log('Creating Notion page:', JSON.stringify(pagePayload));

        const response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify(pagePayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Notion create page error:', response.status, errorText);
          return { error: `Failed to create page: ${response.status} - ${errorText}` };
        }

        const createdPage = await response.json();
        return {
          success: true,
          id: createdPage.id,
          url: createdPage.url,
          message: `Successfully created page "${title}" in Notion`,
        };
      }

      case 'notion_update_page': {
        const pageId = args.page_id as string;
        const title = args.title as string;
        const content = args.content as string;
        const archived = args.archived as boolean;

        if (!pageId) return { error: 'Page ID is required' };

        // Update page properties if title or archived specified
        if (title || archived !== undefined) {
          const updatePayload: any = {};
          
          if (title) {
            updatePayload.properties = {
              title: {
                title: [{ type: 'text', text: { content: title } }]
              }
            };
          }
          
          if (archived !== undefined) {
            updatePayload.archived = archived;
          }

          const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updatePayload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Notion update page error:', response.status, errorText);
            return { error: `Failed to update page: ${response.status}` };
          }
        }

        // Append content as new block if provided
        if (content) {
          const blockPayload = {
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ type: 'text', text: { content } }]
                }
              }
            ]
          };

          await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(blockPayload),
          });
        }

        return {
          success: true,
          id: pageId,
          message: `Successfully updated page${archived ? ' (archived)' : ''}`,
        };
      }

      case 'notion_query_database': {
        const databaseId = args.database_id as string;
        const filterProperty = args.filter_property as string;
        const filterValue = args.filter_value as string;

        if (!databaseId) return { error: 'Database ID is required' };

        const queryPayload: any = { page_size: 50 };
        
        // Add filter if specified
        if (filterProperty && filterValue) {
          queryPayload.filter = {
            property: filterProperty,
            rich_text: { contains: filterValue }
          };
        }

        const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify(queryPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Notion query database error:', response.status, errorText);
          return { error: `Failed to query database: ${response.status}` };
        }

        const data = await response.json();
        const items = data.results || [];

        return {
          items: items.map((item: any) => {
            const props: Record<string, any> = {};
            for (const [key, value] of Object.entries(item.properties || {})) {
              const prop = value as any;
              if (prop.title) {
                props[key] = prop.title?.[0]?.plain_text || '';
              } else if (prop.rich_text) {
                props[key] = prop.rich_text?.[0]?.plain_text || '';
              } else if (prop.number !== undefined) {
                props[key] = prop.number;
              } else if (prop.select) {
                props[key] = prop.select?.name || '';
              } else if (prop.multi_select) {
                props[key] = prop.multi_select?.map((s: any) => s.name).join(', ') || '';
              } else if (prop.date) {
                props[key] = prop.date?.start || '';
              } else if (prop.checkbox !== undefined) {
                props[key] = prop.checkbox;
              }
            }
            return {
              id: item.id,
              properties: props,
              url: item.url,
            };
          }),
          total: items.length,
          message: `Found ${items.length} item(s) in database`,
        };
      }

      default:
        return { error: `Unknown Notion function: ${functionName}` };
    }
  } catch (error) {
    console.error('Notion execution error:', error);
    return { error: error instanceof Error ? error.message : 'Notion request failed' };
  }
}

// Execute File connector function
async function executeFileConnector(
  functionName: string,
  args: Record<string, unknown>,
  supabaseUrl: string,
  supabaseKey: string,
  userId?: string | null
): Promise<unknown> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    switch (functionName) {
      case 'file_list_documents': {
        const limit = (args.limit as number) || 20;
        
        let query = supabase
          .from('documents')
          .select('id, title, source_type, connector_id, created_at, metadata')
          .eq('connector_id', 'file')
          .order('created_at', { ascending: false })
          .limit(limit);

        // Filter by user_id for multi-tenant isolation
        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('File list error:', error);
          return { error: 'Failed to list documents' };
        }

        return {
          documents: data?.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            type: doc.source_type,
            uploadedAt: doc.created_at,
            metadata: doc.metadata,
          })) || [],
          total: data?.length || 0,
          message: `Found ${data?.length || 0} uploaded document(s)`,
        };
      }

      case 'file_search_documents': {
        const query = args.query as string;
        const fileType = args.file_type as string;

        if (!query) {
          return { error: 'Search query is required' };
        }

        console.log(`[File Search] Searching for "${query}" in file documents for user ${userId || 'anonymous'}`);

        // Try keyword search function first for better results
        try {
          const rpcParams: Record<string, unknown> = {
            query_text: query,
            match_count: 10,
            connector_filter: 'file',
          };
          
          // Add user_id filter for multi-tenant isolation
          if (userId) {
            rpcParams.user_id_filter = userId;
          }
          
          const { data: keywordData, error: keywordError } = await supabase.rpc('keyword_search', rpcParams);

          if (!keywordError && keywordData && keywordData.length > 0) {
            console.log(`[File Search] Found ${keywordData.length} results via keyword search`);
            return {
              results: keywordData.map((doc: any) => ({
                id: doc.id,
                title: doc.title,
                snippet: doc.content?.substring(0, 500) + (doc.content?.length > 500 ? '...' : ''),
                fullContent: doc.content,
                type: doc.source_type,
                metadata: doc.metadata,
                relevanceScore: doc.keyword_rank,
              })),
              total: keywordData.length,
              message: `Found ${keywordData.length} document(s) matching "${query}"`,
            };
          }
        } catch (rpcError) {
          console.log('[File Search] Keyword search RPC failed, falling back to basic search');
        }

        // Fallback to basic ilike search
        let searchQuery = supabase
          .from('documents')
          .select('id, title, content, source_type, connector_id, metadata')
          .eq('connector_id', 'file')
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .limit(10);

        // Filter by user_id for multi-tenant isolation
        if (userId) {
          searchQuery = searchQuery.eq('user_id', userId);
        }

        if (fileType) {
          searchQuery = searchQuery.eq('source_type', fileType);
        }

        const { data, error } = await searchQuery;

        if (error) {
          console.error('File search error:', error);
          return { error: 'Failed to search documents' };
        }

        console.log(`[File Search] Found ${data?.length || 0} results via basic search`);

        return {
          results: data?.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            snippet: doc.content?.substring(0, 500) + (doc.content?.length > 500 ? '...' : ''),
            fullContent: doc.content,
            type: doc.source_type,
            metadata: doc.metadata,
          })) || [],
          total: data?.length || 0,
          message: `Found ${data?.length || 0} document(s) matching "${query}"`,
        };
      }

      default:
        return { error: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    console.error('File connector error:', error);
    return { error: error instanceof Error ? error.message : 'File search failed' };
  }
}

// Parse employee data from document content
function parseEmployeeData(content: string): Array<Record<string, string>> {
  const employees: Array<Record<string, string>> = [];
  const lines = content.split('\n');
  
  // Find header line
  let headers: string[] = [];
  let dataStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('Employee_ID') || line.includes('Full_Name') || line.includes('Department')) {
      headers = line.split(',').map(h => h.trim());
      dataStartIndex = i + 1;
      break;
    }
  }
  
  if (headers.length === 0) {
    // Try first line as header
    if (lines.length > 0) {
      headers = lines[0].split(',').map(h => h.trim());
      dataStartIndex = 1;
    }
  }
  
  // Parse data rows
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    const employee: Record<string, string> = {};
    
    headers.forEach((header, index) => {
      if (values[index] !== undefined) {
        employee[header] = values[index];
      }
    });
    
    if (employee['Employee_ID'] || employee['Full_Name']) {
      employees.push(employee);
    }
  }
  
  return employees;
}

// Execute Employee data function
async function executeEmployeeFunction(
  functionName: string,
  args: Record<string, unknown>,
  supabaseUrl: string,
  supabaseKey: string,
  userId?: string | null
): Promise<unknown> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First, get all employee documents (filtered by user if available)
    let query = supabase
      .from('documents')
      .select('id, title, content, metadata')
      .eq('connector_id', 'file')
      .order('created_at', { ascending: false });

    // Filter by user_id for multi-tenant isolation
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: docs, error: docsError } = await query;

    if (docsError) {
      console.error('Error fetching employee documents:', docsError);
      return { error: 'Failed to access employee data' };
    }

    // Parse all employees from all documents
    let allEmployees: Array<Record<string, string> & { _docId: string; _docTitle: string }> = [];
    for (const doc of (docs || [])) {
      if (doc.content) {
        const employees = parseEmployeeData(doc.content);
        employees.forEach(emp => {
          allEmployees.push({ ...emp, _docId: doc.id, _docTitle: doc.title });
        });
      }
    }

    console.log(`[Employee] Found ${allEmployees.length} employees in ${docs?.length || 0} documents for user ${userId || 'anonymous'}`);

    switch (functionName) {
      case 'employee_get': {
        const employeeId = (args.employee_id as string)?.toUpperCase();
        if (!employeeId) {
          return { error: 'Employee ID is required' };
        }

        const employee = allEmployees.find(e => 
          e.Employee_ID?.toUpperCase() === employeeId || 
          e['Employee ID']?.toUpperCase() === employeeId
        );

        if (!employee) {
          return { error: `Employee ${employeeId} not found in uploaded data` };
        }

        const { _docId, _docTitle, ...employeeData } = employee;
        return {
          employee: employeeData,
          source: _docTitle,
          message: `Found employee ${employeeId}`,
        };
      }

      case 'employee_search': {
        const query = (args.query as string)?.toLowerCase() || '';
        const department = (args.department as string)?.toLowerCase();
        const role = (args.role as string)?.toLowerCase();
        const location = (args.location as string)?.toLowerCase();

        let results = allEmployees.filter(emp => {
          // Search across all fields
          const searchableText = Object.values(emp).join(' ').toLowerCase();
          const matchesQuery = !query || searchableText.includes(query);
          
          // Apply filters
          const matchesDept = !department || 
            emp.Department?.toLowerCase().includes(department);
          const matchesRole = !role || 
            emp.Job_Title?.toLowerCase().includes(role) ||
            emp['Job Title']?.toLowerCase().includes(role);
          const matchesLocation = !location || 
            emp.Location?.toLowerCase().includes(location);

          return matchesQuery && matchesDept && matchesRole && matchesLocation;
        });

        return {
          employees: results.slice(0, 20).map(({ _docId, _docTitle, ...e }) => e),
          total: results.length,
          message: `Found ${results.length} employee(s) matching criteria`,
        };
      }

      case 'employee_list': {
        const department = (args.department as string)?.toLowerCase();
        const location = (args.location as string)?.toLowerCase();
        const status = (args.status as string)?.toLowerCase();
        const limit = (args.limit as number) || 20;

        let results = allEmployees.filter(emp => {
          const matchesDept = !department || 
            emp.Department?.toLowerCase().includes(department);
          const matchesLocation = !location || 
            emp.Location?.toLowerCase().includes(location);
          const matchesStatus = !status || 
            emp.Employment_Status?.toLowerCase().includes(status) ||
            emp['Employment Status']?.toLowerCase().includes(status);

          return matchesDept && matchesLocation && matchesStatus;
        });

        return {
          employees: results.slice(0, limit).map(({ _docId, _docTitle, ...e }) => e),
          total: results.length,
          message: `Found ${results.length} employee(s)`,
        };
      }

      case 'employee_update': {
        const employeeId = (args.employee_id as string)?.toUpperCase();
        const field = args.field as string;
        const newValue = args.new_value as string;

        if (!employeeId || !field || !newValue) {
          return { error: 'employee_id, field, and new_value are required' };
        }

        // Find the employee and their document
        const employee = allEmployees.find(e => 
          e.Employee_ID?.toUpperCase() === employeeId || 
          e['Employee ID']?.toUpperCase() === employeeId
        );

        if (!employee) {
          return { error: `Employee ${employeeId} not found` };
        }

        const docId = employee._docId;
        
        // Get the full document content
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('content')
          .eq('id', docId)
          .single();

        if (docError || !docData) {
          return { error: 'Failed to retrieve document for update' };
        }

        // Parse and update the content
        let content = docData.content;
        const lines = content.split('\n');
        
        // Find header line to get field index
        let headers: string[] = [];
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Employee_ID') || lines[i].includes('Full_Name')) {
            headers = lines[i].split(',').map((h: string) => h.trim());
            headerIndex = i;
            break;
          }
        }

        // Normalize field name (handle variations)
        const normalizedField = field.replace(/[_ ]/g, '_');
        let fieldIndex = headers.findIndex(h => 
          h.replace(/[_ ]/g, '_').toLowerCase() === normalizedField.toLowerCase()
        );

        if (fieldIndex === -1) {
          return { error: `Field "${field}" not found in data. Available fields: ${headers.join(', ')}` };
        }

        // Find and update the employee's row
        let updated = false;
        let oldValue = '';
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const empIdValue = values[headers.indexOf('Employee_ID')] || values[headers.indexOf('Employee ID')];
          
          if (empIdValue?.trim().toUpperCase() === employeeId) {
            oldValue = values[fieldIndex]?.trim() || '';
            values[fieldIndex] = newValue;
            lines[i] = values.join(',');
            updated = true;
            break;
          }
        }

        if (!updated) {
          return { error: `Could not locate ${employeeId} in document for update` };
        }

        // Save updated content back to database
        const newContent = lines.join('\n');
        const { error: updateError } = await supabase
          .from('documents')
          .update({ content: newContent, updated_at: new Date().toISOString() })
          .eq('id', docId);

        if (updateError) {
          console.error('Document update error:', updateError);
          return { error: 'Failed to save updated employee data' };
        }

        console.log(`[Employee] Updated ${employeeId}: ${field} from "${oldValue}" to "${newValue}"`);

        return {
          success: true,
          employee_id: employeeId,
          field: field,
          old_value: oldValue,
          new_value: newValue,
          message: `Successfully updated ${employeeId}'s ${field} from "${oldValue}" to "${newValue}"`,
        };
      }

      case 'employee_create': {
        const fullName = args.full_name as string;
        const email = args.email as string || '';
        const department = args.department as string;
        const jobTitle = args.job_title as string;
        const location = args.location as string || 'Remote';
        const salary = args.salary as number || 0;
        const startDate = args.start_date as string || new Date().toISOString().split('T')[0];

        if (!fullName || !department || !jobTitle) {
          return { error: 'full_name, department, and job_title are required' };
        }

        // Find the most recent document to add the employee to
        const targetDoc = docs?.[0];
        if (!targetDoc) {
          return { error: 'No employee document found. Please upload an employee file first.' };
        }

        // Generate new employee ID
        const existingIds = allEmployees
          .map(e => e.Employee_ID || e['Employee ID'] || '')
          .filter(id => id.match(/^EMP\d+$/))
          .map(id => parseInt(id.replace('EMP', '')));
        const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        const newId = `EMP${String(maxId + 1).padStart(7, '0')}`;

        // Get the document content
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('content')
          .eq('id', targetDoc.id)
          .single();

        if (docError || !docData) {
          return { error: 'Failed to access employee document' };
        }

        // Parse headers from the document
        const lines = docData.content.split('\n');
        let headers: string[] = [];
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Employee_ID') || lines[i].includes('Full_Name')) {
            headers = lines[i].split(',').map((h: string) => h.trim());
            headerIndex = i;
            break;
          }
        }

        if (headerIndex === -1) {
          return { error: 'Could not find header row in employee document' };
        }

        // Build new row based on headers
        const newRow = headers.map(header => {
          const normalizedHeader = header.replace(/[_ ]/g, '_').toLowerCase();
          switch (normalizedHeader) {
            case 'employee_id': return newId;
            case 'full_name': return fullName;
            case 'email': return email || `${fullName.toLowerCase().replace(/\s+/g, '.')}@company.com`;
            case 'department': return department;
            case 'job_title': return jobTitle;
            case 'location': return location;
            case 'salary': case 'annual_salary': return salary.toString();
            case 'start_date': case 'hire_date': return startDate;
            case 'employment_status': return 'Active';
            default: return '';
          }
        });

        // Add new row to content
        lines.push(newRow.join(','));
        const newContent = lines.join('\n');

        // Save updated content
        const { error: updateError } = await supabase
          .from('documents')
          .update({ content: newContent, updated_at: new Date().toISOString() })
          .eq('id', targetDoc.id);

        if (updateError) {
          console.error('Failed to save new employee:', updateError);
          return { error: 'Failed to save new employee' };
        }

        console.log(`[Employee] Created new employee: ${newId} - ${fullName}`);

        return {
          success: true,
          employee_id: newId,
          full_name: fullName,
          department,
          job_title: jobTitle,
          location,
          message: `Successfully created employee ${newId}: ${fullName} as ${jobTitle} in ${department}`,
        };
      }

      case 'employee_delete': {
        const employeeId = (args.employee_id as string)?.toUpperCase();
        const reason = args.reason as string || 'Not specified';

        if (!employeeId) {
          return { error: 'employee_id is required' };
        }

        // Find the employee
        const employee = allEmployees.find(e => 
          e.Employee_ID?.toUpperCase() === employeeId || 
          e['Employee ID']?.toUpperCase() === employeeId
        );

        if (!employee) {
          return { error: `Employee ${employeeId} not found` };
        }

        const docId = employee._docId;
        const employeeName = employee.Full_Name || employee['Full Name'] || employeeId;

        // Get the document content
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('content')
          .eq('id', docId)
          .single();

        if (docError || !docData) {
          return { error: 'Failed to access employee document' };
        }

        // Parse and remove the employee's row
        const lines = docData.content.split('\n');
        let headers: string[] = [];
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Employee_ID') || lines[i].includes('Full_Name')) {
            headers = lines[i].split(',').map((h: string) => h.trim());
            headerIndex = i;
            break;
          }
        }

        const employeeIdColIndex = headers.indexOf('Employee_ID') !== -1 
          ? headers.indexOf('Employee_ID') 
          : headers.indexOf('Employee ID');

        // Filter out the employee's row
        let deleted = false;
        const newLines = lines.filter((line: string, idx: number) => {
          if (idx <= headerIndex) return true; // Keep header rows
          const values = line.split(',');
          const lineEmpId = values[employeeIdColIndex]?.trim().toUpperCase();
          if (lineEmpId === employeeId) {
            deleted = true;
            return false; // Remove this line
          }
          return true;
        });

        if (!deleted) {
          return { error: `Could not locate ${employeeId} in document for deletion` };
        }

        // Save updated content
        const newContent = newLines.join('\n');
        const { error: updateError } = await supabase
          .from('documents')
          .update({ content: newContent, updated_at: new Date().toISOString() })
          .eq('id', docId);

        if (updateError) {
          console.error('Failed to delete employee:', updateError);
          return { error: 'Failed to save after employee deletion' };
        }

        console.log(`[Employee] Deleted ${employeeId} (${employeeName}). Reason: ${reason}`);

        return {
          success: true,
          employee_id: employeeId,
          employee_name: employeeName,
          reason,
          message: `Successfully deleted employee ${employeeId} (${employeeName})`,
        };
      }

      default:
        return { error: `Unknown employee function: ${functionName}` };
    }
  } catch (error) {
    console.error('Employee function error:', error);
    return { error: error instanceof Error ? error.message : 'Employee operation failed' };
  }
}

// Execute Google Drive function
async function executeGoogleDrive(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<unknown> {
  // Check for server-side token first (from secrets)
  const serverToken = Deno.env.get('GOOGLE_DRIVE_ACCESS_TOKEN') || '';
  let token = config?.accessToken || serverToken;

  if (!token) {
    return { error: "Google Drive not configured. Please add your access token in Settings or as a secret." };
  }

  // If it's a refresh token, exchange it for an access token
  if (isRefreshToken(token)) {
    try {
      token = await getGoogleAccessToken(token, 'drive');
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to refresh Google Drive token' };
    }
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };

  const formatGoogleDriveError = (status: number, errorText: string) => {
    let details: any = null;
    try {
      details = JSON.parse(errorText);
    } catch {
      // ignore
    }

    const gError = details?.error;
    const message: string = gError?.message || errorText || `Google Drive API error: ${status}`;

    const reason: string | undefined =
      gError?.errors?.[0]?.reason ||
      gError?.details?.find((d: any) => typeof d?.reason === 'string')?.reason ||
      gError?.details?.[0]?.reason;

    const activationUrl: string | undefined = gError?.details?.find(
      (d: any) => d?.metadata?.activationUrl
    )?.metadata?.activationUrl;

    // Common: API disabled on the Google Cloud project tied to the OAuth client
    if (
      reason === 'accessNotConfigured' ||
      reason === 'SERVICE_DISABLED' ||
      /API has not been used|is disabled|Enable it by visiting/i.test(message)
    ) {
      return {
        error: 'Google Drive API is disabled for your Google Cloud project. Enable Google Drive API and retry.',
        activationUrl,
        status,
      };
    }

    // Common: missing OAuth scopes
    if (reason === 'insufficientPermissions' || /insufficient.*scope|permission/i.test(message)) {
      return {
        error: 'Google Drive permission denied. Ensure the token includes Google Drive scopes (e.g., drive.readonly) and retry.',
        status,
      };
    }

    return { error: message, status };
  };

  try {
    console.log(`Executing Google Drive: ${functionName}`, args);

    switch (functionName) {
      case 'google_drive_list_files': {
        const query = args.query as string || '';
        let url = 'https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,description,webViewLink,modifiedTime)';
        if (query) {
          url += `&q=name contains '${query.replace(/'/g, "\\'")}'`;
        }
        
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Google Drive list error:', response.status, errorText);
          return formatGoogleDriveError(response.status, errorText);
        }
        
        const data = await response.json();
        const files = data.files || [];
        
        return {
          files: files.map((file: any) => ({
            id: file.id,
            name: file.name,
            type: file.mimeType || 'unknown',
            description: file.description || '',
            link: file.webViewLink || '',
            modified: file.modifiedTime || '',
          })),
          total: files.length,
          message: `Found ${files.length} file(s)${query ? ` matching "${query}"` : ''} in Google Drive`,
        };
      }

      case 'google_drive_search_files': {
        const query = args.query as string;
        if (!query) {
          return { error: "Search query is required" };
        }
        
        const searchQuery = `fullText contains '${query.replace(/'/g, "\\'")}'`;
        const url = `https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,description,webViewLink,modifiedTime)&q=${encodeURIComponent(searchQuery)}`;
        
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Google Drive search error:', response.status, errorText);
          return formatGoogleDriveError(response.status, errorText);
        }
        
        const data = await response.json();
        const files = data.files || [];
        
        return {
          files: files.map((file: any) => ({
            id: file.id,
            name: file.name,
            type: file.mimeType || 'unknown',
            description: file.description || '',
            link: file.webViewLink || '',
            modified: file.modifiedTime || '',
          })),
          total: files.length,
          message: `Found ${files.length} file(s) matching "${query}" in Google Drive`,
        };
      }

      case 'google_drive_read_file': {
        const fileId = args.file_id as string;
        if (!fileId) {
          return { error: "File ID is required" };
        }

        // First get file metadata to check the type
        const metaResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
          { headers }
        );
        
        if (!metaResponse.ok) {
          const errorText = await metaResponse.text();
          console.error('Google Drive metadata error:', metaResponse.status, errorText);
          return formatGoogleDriveError(metaResponse.status, errorText);
        }
        
        const metadata = await metaResponse.json();
        const mimeType = metadata.mimeType || '';
        let content = '';

        // For Google Docs, Sheets, Slides - export as text
        if (mimeType.includes('application/vnd.google-apps')) {
          let exportMime = 'text/plain';
          if (mimeType.includes('spreadsheet')) {
            exportMime = 'text/csv';
          }
          
          const exportResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
            { headers }
          );
          
          if (!exportResponse.ok) {
            const errorText = await exportResponse.text();
            console.error('Google Drive export error:', exportResponse.status, errorText);
            return formatGoogleDriveError(exportResponse.status, errorText);
          }
          
          content = await exportResponse.text();
        } else {
          // For regular files, download content
          const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers }
          );
          
          if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            console.error('Google Drive download error:', downloadResponse.status, errorText);
            return formatGoogleDriveError(downloadResponse.status, errorText);
          }
          
          content = await downloadResponse.text();
        }

        return {
          file_id: fileId,
          file_name: metadata.name || args.file_name || 'Unknown',
          mime_type: mimeType,
          content: content.substring(0, 50000), // Limit content size
          content_length: content.length,
          message: `Successfully retrieved content from "${metadata.name}" (${content.length} characters)`,
        };
      }

      default:
        return { error: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    console.error('Google Drive execution error:', error);
    return { error: error instanceof Error ? error.message : 'Google Drive request failed' };
  }
}

// Execute RAG search
async function executeRAGSearch(
  args: Record<string, unknown>,
  supabaseUrl: string,
  supabaseKey: string,
  userId?: string | null
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
        userId: userId || null, // Pass user ID for multi-tenant isolation
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

// Execute Gmail function
async function executeGmail(
  functionName: string,
  args: Record<string, unknown>,
  config: Record<string, string>
): Promise<unknown> {
  let token = config.accessToken || Deno.env.get('GMAIL_ACCESS_TOKEN') || '';
  
  if (!token) {
    return { error: "Gmail not connected. Please add your Gmail access token." };
  }

  // If it's a refresh token, exchange it for an access token
  if (isRefreshToken(token)) {
    try {
      token = await getGoogleAccessToken(token, 'gmail');
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to refresh Gmail token' };
    }
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
  };

  try {
    switch (functionName) {
      case 'gmail_list_emails': {
        const limit = (args.limit as number) || 10;
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`,
          { headers }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gmail list error:', response.status, errorText);
          if (response.status === 401) {
            return { error: "Gmail authentication expired. Please reconnect Gmail." };
          }
          return { error: `Gmail API error: ${response.status}` };
        }
        
        const data = await response.json();
        const messageIds = data.messages || [];
        
        const emails = [];
        for (const msg of messageIds.slice(0, limit)) {
          try {
            const msgResp = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers }
            );
            if (!msgResp.ok) continue;
            
            const msgData = await msgResp.json();
            const hdrs = msgData.payload?.headers || [];
            const getHeader = (name: string) => hdrs.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
            
            emails.push({
              id: msg.id,
              subject: getHeader('Subject') || '(No Subject)',
              from: getHeader('From'),
              date: getHeader('Date'),
              snippet: msgData.snippet || '',
            });
          } catch { }
        }
        
        return {
          emails,
          total: emails.length,
          message: `Found ${emails.length} recent emails`,
        };
      }

      case 'gmail_search_emails': {
        const query = args.query as string;
        if (!query) return { error: "Search query is required" };
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=15`,
          { headers }
        );
        
        if (!response.ok) {
          return { error: `Gmail search failed: ${response.status}` };
        }
        
        const data = await response.json();
        const messageIds = data.messages || [];
        
        const emails = [];
        for (const msg of messageIds.slice(0, 15)) {
          try {
            const msgResp = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers }
            );
            if (!msgResp.ok) continue;
            
            const msgData = await msgResp.json();
            const hdrs = msgData.payload?.headers || [];
            const getHeader = (name: string) => hdrs.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
            
            emails.push({
              id: msg.id,
              subject: getHeader('Subject') || '(No Subject)',
              from: getHeader('From'),
              date: getHeader('Date'),
              snippet: msgData.snippet || '',
            });
          } catch { }
        }
        
        return {
          query,
          emails,
          total: emails.length,
          message: `Found ${emails.length} emails matching "${query}"`,
        };
      }

      case 'gmail_get_email': {
        const emailId = args.email_id as string;
        if (!emailId) return { error: "Email ID is required" };
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
          { headers }
        );
        
        if (!response.ok) {
          return { error: `Could not fetch email: ${response.status}` };
        }
        
        const msgData = await response.json();
        const hdrs = msgData.payload?.headers || [];
        const getHeader = (name: string) => hdrs.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        
        // Extract body
        let body = '';
        const payload = msgData.payload;
        if (payload?.body?.data) {
          body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (payload?.parts) {
          for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              break;
            }
          }
        }
        
        return {
          id: emailId,
          subject: getHeader('Subject') || '(No Subject)',
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          body: body.substring(0, 5000),
          snippet: msgData.snippet || '',
        };
      }

      default:
        return { error: `Unknown Gmail function: ${functionName}` };
    }
  } catch (error) {
    console.error('Gmail execution error:', error);
    return { error: error instanceof Error ? error.message : 'Gmail request failed' };
  }
}

// Execute tool call
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  connectedSources: ConnectedSource[],
  supabaseUrl: string,
  supabaseKey: string,
  userId?: string | null
): Promise<unknown> {
  console.log(`Executing tool: ${toolName}`, args, `for user: ${userId || 'anonymous'}`);

  if (toolName.startsWith('servicenow_')) {
    const source = connectedSources.find(s => s.type === 'servicenow' || s.id === 'servicenow');
    return executeServiceNow(toolName, args, source?.config || {});
  }

  if (toolName.startsWith('google_drive_')) {
    const source = connectedSources.find(s => s.type === 'google-drive' || s.id === 'google-drive');
    const serverToken = Deno.env.get('GOOGLE_DRIVE_ACCESS_TOKEN');
    
    // Use server-side token if available, otherwise use client config
    if (serverToken) {
      return executeGoogleDrive(toolName, args, { accessToken: serverToken });
    }
    
    if (!source?.config?.accessToken) {
      return { error: "Google Drive not connected. Please add your access token as a secret or connect in Settings." };
    }
    return executeGoogleDrive(toolName, args, source.config);
  }

  if (toolName.startsWith('jira_')) {
    const source = connectedSources.find(s => s.type === 'jira' || s.id === 'jira');
    // Pass config even if empty - executeJira will check env vars as fallback
    return executeJira(toolName, args, source?.config || {});
  }

  if (toolName.startsWith('notion_')) {
    return executeNotion(toolName, args);
  }

  if (toolName === 'search_documents') {
    return executeRAGSearch(args, supabaseUrl, supabaseKey, userId);
  }

  if (toolName.startsWith('file_')) {
    return executeFileConnector(toolName, args, supabaseUrl, supabaseKey, userId);
  }

  if (toolName.startsWith('employee_')) {
    return executeEmployeeFunction(toolName, args, supabaseUrl, supabaseKey, userId);
  }

  if (toolName.startsWith('github_')) {
    return executeGitHub(toolName, args);
  }

  if (toolName.startsWith('gmail_')) {
    const source = connectedSources.find(s => s.type === 'email' || s.id === 'email');
    return executeGmail(toolName, args, source?.config || {});
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
  const hasGoogleDrive = !!Deno.env.get('GOOGLE_DRIVE_ACCESS_TOKEN') || connectedSources.some(s => s.type === 'google-drive' || s.id === 'google-drive');
  const hasGitHub = !!Deno.env.get('GITHUB_ACCESS_TOKEN') || connectedSources.some(s => s.type === 'github' || s.id === 'github');
  const hasGmail = !!Deno.env.get('GMAIL_ACCESS_TOKEN') || connectedSources.some(s => s.type === 'email' || s.id === 'email');
  const hasFileConnector = connectedSources.some(s => s.type === 'file' || s.id === 'file');
  const hasNotion = !!Deno.env.get('NOTION_INTEGRATION_TOKEN') || connectedSources.some(s => s.type === 'notion' || s.id === 'notion');
  const hasJira = !!(Deno.env.get('JIRA_URL') && Deno.env.get('JIRA_EMAIL') && Deno.env.get('JIRA_API_TOKEN')) || connectedSources.some(s => s.type === 'jira' || s.id === 'jira');
  
  return `You are NOVA, a conversational voice assistant. You communicate naturally like a helpful human colleague, not a system reading records.

## CRITICAL VOICE-FIRST RULES:
1. **NEVER read data line-by-line** - Synthesize information into natural sentences
2. **NEVER mention file names, spreadsheets, table names, or data sources** - Just share the information naturally
3. **NEVER say things like "According to Employee_Data.xlsx" or "From the spreadsheet"**
4. **Use approximate phrasing for numbers** - Say "about fourteen years" not "14 years"
5. **Keep sentences short and voice-friendly** - Optimized for being spoken aloud
6. **Always end with a helpful follow-up question**

## Your Personality:
- Be warm, conversational, and human-like
- Use casual language (contractions like "I'll", "you're", "that's")
- Show empathy and understanding
- Be concise but friendly
- Use natural phrases like "Let me check that for you", "Here's what I found", "Looks like..."
- NEVER sound robotic or overly formal

## How to Respond About People/Employees:
When asked about a person, synthesize the information naturally:

❌ BAD (reading data):
"Employee ID: EMP0000004
Full Name: Joshua Nguyen
Department: IT
Status: Resigned
Experience: 14 years
Location: Denmark"

✅ GOOD (conversational):
"Joshua Nguyen is a former software engineer from the IT team. He has around fourteen years of experience and was based in Denmark. He's no longer with the company, as he has resigned. What would you like to know about him?"

❌ BAD: "According to Employee_Data.xlsx, the employee EMP0000004..."
✅ GOOD: "Joshua is a former IT team member with about fourteen years of experience."

## ID Display Rules:
When mentioning IDs, shorten them naturally:
- INC0010017 → "incident ending in 0017"
- KB0000001 → "article ending in 0001"
- EMP0000004 → just use the person's name instead!

## Connected Data Sources:
${connectedSources.length > 0 ? sourceNames : 'None connected yet'}
${hasGitHub ? '+ GitHub (connected via token)' : ''}
${hasGmail ? '+ Gmail (connected via token)' : ''}
${hasNotion ? '+ Notion (connected via token)' : ''}
${hasJira ? '+ Jira (connected via token)' : ''}

## Your Capabilities:
- **ServiceNow**: Search articles, get counts, manage incidents (create AND update)
- **Google Drive**: List and search files
- **Gmail**: List, search, and read emails
- **Jira**: List projects, search issues, create issues, update issues, add comments
- **Notion**: Search pages, list databases, get page content, create pages, update pages, query databases
- **GitHub**: List repos, search code, view files, list issues and PRs
- **Files/Documents**: Search uploaded files (Excel, CSV, PDF, etc.) for employee data, IDs, departments, and any content

## Response Style Guidelines:
1. Start with a short natural summary (role, department, status)
2. Summarize details in plain language, not bullet points
3. Use approximate numbers when speaking ("about five years" not "5 years")
4. Keep responses concise and conversational
5. End with a polite follow-up question

## CRITICAL RULES:
1. You MUST call functions when available. Never say "I can't" if a function exists.
2. When user mentions ANY ID format (EMP0000001, employee IDs, etc.) or asks about employees/departments/salaries - ALWAYS search uploaded files first using file_search_documents.
3. When user mentions a filename or asks about data in files - ALWAYS search using file_search_documents.
4. **NEVER expose internal data structure or file names to the user**

## Example Responses:

For "Who is Joshua Nguyen?":
"Joshua Nguyen is a former software engineer from the IT team. He has around fourteen years of experience and was based in Denmark. He's no longer with the company, as he has resigned. What would you like to know about him?"

For "Find employees in Marketing":
"I found a few people in Marketing! There's Sarah Chen, who's a Marketing Manager with about eight years of experience, and Mike Johnson, a Content Specialist who's been with the company for three years. Would you like more details about any of them?"

For incident counts:
"You've got around five thousand incidents in the system. Would you like me to filter by status or priority?"

${hasServiceNow ? `
## ServiceNow Connected - Use These:
- "how many articles" → servicenow_get_article_count
- "how many incidents" → servicenow_get_incident_count
- Article number (KB...) → servicenow_get_article_by_number
- Incident number (INC...) → servicenow_get_incident
- "update incident X" → servicenow_update_incident
- "resolve incident X" → servicenow_update_incident with state=6
- "close incident X" → servicenow_update_incident with state=7
- "add notes to incident X" → servicenow_update_incident with work_notes
` : ''}

${hasGoogleDrive ? `
## Google Drive Connected - Use These:
- "list files" → google_drive_list_files
- "search for X" → google_drive_search_files
` : ''}

${hasJira ? `
## Jira Connected - Use These:
- "list projects" → jira_list_projects
- "find issues about X" → jira_search_issues
- "show issue X" → jira_get_issue
- "create issue/task/bug" → jira_create_issue (REQUIRES project_key and summary)
- "update issue X" → jira_update_issue
- "add comment to X" → jira_add_comment
- "change status of X to Done" → jira_update_issue with status
` : ''}

${hasNotion ? `
## Notion Connected - Use These:
- "search Notion for X" → notion_search
- "list my databases" → notion_list_databases
- "show page X" → notion_get_page
- "create a page called X" → notion_create_page
- "update page X" → notion_update_page
- "query database X" → notion_query_database
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

${hasGmail ? `
## Gmail Connected - Use These:
- "list my emails" → gmail_list_emails
- "search emails for X" → gmail_search_emails
- "show email" → gmail_get_email
` : ''}

${hasFileConnector ? `
## File Connector Connected - ALWAYS USE FOR DATA QUERIES:
- Employee IDs (EMP...) → file_search_documents with the ID
- "find employee X" → file_search_documents with name
- "IT employees" → file_search_documents with "IT"
- "list files" → file_list_documents
- ANY question about employees, departments, salaries, etc. → file_search_documents
- ALWAYS search uploaded files when user asks about data that could be in spreadsheets
- **REMEMBER: Never mention the file name in your response!**
` : ''}

${connectedSources.length === 0 && !hasGitHub && !hasGmail && !hasFileConnector && !hasNotion && !hasJira ? `
## No Sources Yet:
Friendly guide them: "Hey! To get started, head to Settings and connect your tools - ServiceNow, Jira, Google Drive, whatever you use. Then come back and I can help you search and manage everything!"
` : ''}`
}

// Filter tools based on connected sources
function getAvailableTools(connectedSources: ConnectedSource[]): typeof AVAILABLE_TOOLS {
  const connectedTypes = new Set(connectedSources.map(s => s.type || s.id));
  const hasGitHubToken = !!Deno.env.get('GITHUB_ACCESS_TOKEN');
  const hasGmailToken = !!Deno.env.get('GMAIL_ACCESS_TOKEN');
  const hasNotionToken = !!Deno.env.get('NOTION_INTEGRATION_TOKEN');
  const hasJiraEnvConfig = !!(Deno.env.get('JIRA_URL') && Deno.env.get('JIRA_EMAIL') && Deno.env.get('JIRA_API_TOKEN'));
  
  return AVAILABLE_TOOLS.filter(tool => {
    const name = tool.function.name;
    
    // ServiceNow tools - check both config and env vars
    if (name.startsWith('servicenow_')) {
      const hasEnvConfig = Deno.env.get('SERVICENOW_INSTANCE') && Deno.env.get('SERVICENOW_USERNAME');
      return connectedTypes.has('servicenow') || hasEnvConfig;
    }
    
    // Google Drive tools - check both client config and server secret
    if (name.startsWith('google_drive_')) {
      const hasServerToken = !!Deno.env.get('GOOGLE_DRIVE_ACCESS_TOKEN');
      return connectedTypes.has('google-drive') || hasServerToken;
    }
    
    // Jira tools - check both client config and env vars
    if (name.startsWith('jira_')) {
      return connectedTypes.has('jira') || hasJiraEnvConfig;
    }
    
    // Notion tools - check env var
    if (name.startsWith('notion_')) {
      return connectedTypes.has('notion') || hasNotionToken;
    }
    
    // GitHub tools - check env var
    if (name.startsWith('github_')) {
      return connectedTypes.has('github') || hasGitHubToken;
    }
    
    // Gmail tools - check env var
    if (name.startsWith('gmail_')) {
      return connectedTypes.has('email') || hasGmailToken;
    }
    
    // File connector tools - available if file connector is connected
    if (name.startsWith('file_')) {
      return connectedTypes.has('file');
    }
    
    // Document search - available if any document source connected
    if (name === 'search_documents') {
      const docSources = ['file', 'confluence', 'notion', 'sharepoint'];
      return docSources.some(s => connectedTypes.has(s)) || connectedSources.length > 0 || hasNotionToken;
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

    // Extract user ID from auth header for multi-tenant isolation
    const userId = await getUserIdFromAuth(req, SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '');
    console.log('Universal chat:', { messageCount: messages.length, sources: connectedSources.map(s => s.id), userId: userId || 'anonymous' });

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
        
        // Pass userId for multi-tenant data isolation
        const toolResult = await executeTool(
          functionName,
          args,
          connectedSources,
          SUPABASE_URL,
          SUPABASE_KEY,
          userId
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