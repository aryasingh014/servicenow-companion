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
      case 'testConnection': {
        // Simple test: try to list 1 file
        const url = new URL(`${baseUrl}/files`);
        url.searchParams.set('pageSize', '1');
        url.searchParams.set('fields', 'files(id)');
        
        const response = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) throw new Error('Authentication expired. Please reconnect.');
          if (response.status === 403) throw new Error('Access denied. Check Drive permissions.');
          throw new Error(`Connection failed: ${response.status}`);
        }
        
        return { success: true, message: 'Google Drive connection is working' };
      }

      case 'listFiles': {
        const queryText = typeof params?.query === 'string' ? (params?.query as string) : '';
        const escaped = queryText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim();
        const q = escaped ? `name contains '${escaped}'` : undefined;

        const url = new URL(`${baseUrl}/files`);
        url.searchParams.set('pageSize', '20');
        if (q) url.searchParams.set('q', q);
        url.searchParams.set('fields', 'files(id,name,mimeType,description,webViewLink,modifiedTime)');

        const response = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Google Drive listFiles error: ${response.status}`, errorText);

          if (response.status === 401) {
            throw new Error('Google Drive authentication expired. Please reconnect Google Drive.');
          }
          if (response.status === 403) {
            throw new Error('Google Drive access denied (403). You may not have Drive permissions, or you connected the wrong Google account.');
          }

          throw new Error(`Google Drive error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        return {
          files: data.files || [],
          total: data.files?.length || 0,
        };
      }

      case 'getFileCount': {
        const url = new URL(`${baseUrl}/files`);
        url.searchParams.set('pageSize', '1');
        url.searchParams.set('fields', 'files(id)');

        const countResponse = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!countResponse.ok) {
          const errorText = await countResponse.text();
          console.error(`Google Drive getFileCount error: ${countResponse.status}`, errorText);

          if (countResponse.status === 401) {
            throw new Error('Google Drive authentication expired. Please reconnect Google Drive.');
          }
          if (countResponse.status === 403) {
            throw new Error('Google Drive access denied (403). Please check Drive permissions for the connected Google account.');
          }

          throw new Error(`Google Drive error: ${countResponse.status} - ${errorText.substring(0, 200)}`);
        }

        // Note: Google Drive doesn't provide exact count easily, this is approximate
        return { count: 'many', message: 'Google Drive does not provide exact file counts' };
      }

      case 'searchFiles': {
        const searchTermRaw = typeof params?.query === 'string' ? (params?.query as string) : '';
        const searchTerm = searchTermRaw.trim();
        if (!searchTerm) {
          return { files: [], total: 0, message: 'No search query provided' };
        }

        const escaped = searchTerm.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        console.log(`Google Drive search: "${searchTerm}"`);

        // Try multiple search strategies
        const searchQueries = [
          `fullText contains '${escaped}'`,
          `name contains '${escaped}'`,
          `name contains '${escaped}' or fullText contains '${escaped}'`,
        ];

        let allFiles: any[] = [];
        const seenIds = new Set<string>();

        for (const query of searchQueries) {
          try {
            const url = new URL(`${baseUrl}/files`);
            url.searchParams.set('q', query);
            url.searchParams.set('pageSize', '50');
            url.searchParams.set('fields', 'files(id,name,mimeType,description,webViewLink,modifiedTime)');

            const searchResp = await fetch(url.toString(), {
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
              throw new Error('Google Drive authentication expired. Please reconnect Google Drive.');
            } else if (searchResp.status === 403) {
              throw new Error('Google Drive access denied (403). Please check Drive permissions or reconnect with the correct account.');
            }
          } catch (error) {
            if (error instanceof Error && (error.message.includes('expired') || error.message.includes('access denied'))) {
              throw error;
            }
            console.warn(`Search query "${query}" failed:`, error);
          }
        }

        // If no results from fullText, try name-only search
        if (allFiles.length === 0) {
          try {
            const url = new URL(`${baseUrl}/files`);
            url.searchParams.set('q', `name contains '${escaped}'`);
            url.searchParams.set('pageSize', '50');
            url.searchParams.set('fields', 'files(id,name,mimeType,description,webViewLink,modifiedTime)');

            const nameSearchResp = await fetch(url.toString(), {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            if (nameSearchResp.ok) {
              const nameSearchData = await nameSearchResp.json();
              if (nameSearchData.files && Array.isArray(nameSearchData.files)) {
                allFiles = nameSearchData.files;
              }
            } else if (nameSearchResp.status === 401) {
              throw new Error('Google Drive authentication expired. Please reconnect Google Drive.');
            } else if (nameSearchResp.status === 403) {
              throw new Error('Google Drive access denied (403). Please check Drive permissions or reconnect with the correct account.');
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
      
      case 'listFolders': {
        const url = new URL(`${baseUrl}/files`);
        url.searchParams.set('q', "mimeType='application/vnd.google-apps.folder'");
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('fields', 'files(id,name,modifiedTime)');

        const response = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error(`Failed to list folders: ${response.status}`);
        }

        const data = await response.json();
        return { folders: data.files || [] };
      }

      case 'getFileContent': {
        const fileId = params?.fileId as string;
        if (!fileId) throw new Error('fileId required');

        // Get file metadata first
        const metaResp = await fetch(`${baseUrl}/files/${fileId}?fields=id,name,mimeType`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!metaResp.ok) throw new Error(`Failed to get file metadata: ${metaResp.status}`);
        const meta = await metaResp.json();

        // For Google Docs, export as plain text
        let content = '';
        if (meta.mimeType?.startsWith('application/vnd.google-apps')) {
          const exportResp = await fetch(`${baseUrl}/files/${fileId}/export?mimeType=text/plain`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (exportResp.ok) {
            content = await exportResp.text();
          }
        } else {
          // For regular files, try to download
          const dlResp = await fetch(`${baseUrl}/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (dlResp.ok) {
            content = await dlResp.text();
          }
        }

        return { id: meta.id, name: meta.name, mimeType: meta.mimeType, content: content.substring(0, 50000) };
      }

      case 'listFolderFiles': {
        const folderId = params?.folderId as string;
        if (!folderId) throw new Error('folderId required');

        const url = new URL(`${baseUrl}/files`);
        url.searchParams.set('q', `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder'`);
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');

        const response = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error(`Failed to list folder files: ${response.status}`);
        const data = await response.json();
        return { files: data.files || [] };
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

// Gmail API helper
async function callGmail(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { accessToken } = config;
  
  if (!accessToken) {
    throw new Error('Gmail access token not configured. Please reconnect Email with OAuth.');
  }

  const baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';

  try {
    switch (action) {
      case 'testConnection': {
        const response = await fetch(`${baseUrl}/profile`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) throw new Error('Authentication expired. Please reconnect.');
          if (response.status === 403) throw new Error('Access denied. Check Gmail permissions.');
          throw new Error(`Connection failed: ${response.status}`);
        }
        
        const profile = await response.json();
        return { success: true, message: `Connected to ${profile.emailAddress}` };
      }

      case 'fetchEmails': {
        const limit = (params?.limit as number) || 50;
        
        // List messages
        const listResp = await fetch(
          `${baseUrl}/messages?maxResults=${limit}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (!listResp.ok) {
          if (listResp.status === 401) throw new Error('Gmail authentication expired. Please reconnect.');
          if (listResp.status === 403) throw new Error('Gmail access denied. Check permissions.');
          throw new Error(`Gmail API error: ${listResp.status}`);
        }

        const listData = await listResp.json();
        const messageIds = listData.messages || [];

        const emails: Array<{
          id: string;
          subject: string;
          from: string;
          date: string;
          snippet: string;
          body: string;
        }> = [];

        for (const msg of messageIds.slice(0, limit)) {
          try {
            const msgResp = await fetch(
              `${baseUrl}/messages/${msg.id}?format=full`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (!msgResp.ok) continue;

            const msgData = await msgResp.json();
            const headers = msgData.payload?.headers || [];

            const getHeader = (name: string) =>
              headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

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

            emails.push({
              id: msg.id,
              subject: getHeader('Subject') || '(No Subject)',
              from: getHeader('From'),
              date: getHeader('Date'),
              snippet: msgData.snippet || '',
              body: body.substring(0, 5000),
            });
          } catch (msgError) {
            console.warn('Failed to fetch message:', msgError);
          }
        }

        return { emails, count: emails.length };
      }

      case 'indexEmails': {
        const limit = (params?.limit as number) || 50;
        
        // Fetch emails first
        const result = await callGmail(config, 'fetchEmails', { limit }) as { emails: Array<{ id: string; subject: string; from: string; date: string; body: string }> };
        const emails = result.emails || [];

        // Index into documents table via rag-service logic
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
        const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!SUPABASE_URL || !SUPABASE_KEY) {
          throw new Error('Supabase configuration missing');
        }

        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        let indexed = 0;
        let skipped = 0;
        let errors = 0;

        for (const email of emails) {
          try {
            // Create content hash for deduplication
            const encoder = new TextEncoder();
            const data = encoder.encode(email.id + email.subject + email.date);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Check for existing
            const { data: existing } = await supabase
              .from('documents')
              .select('id')
              .eq('connector_id', 'email')
              .eq('content_hash', contentHash)
              .maybeSingle();

            if (existing) {
              skipped++;
              continue;
            }

            // Build document content
            const content = `Subject: ${email.subject}\nFrom: ${email.from}\nDate: ${email.date}\n\n${email.body}`;

            // Insert document
            const { error } = await supabase
              .from('documents')
              .insert({
                connector_id: 'email',
                source_type: 'email',
                source_id: email.id,
                title: email.subject,
                content: content.substring(0, 50000),
                content_hash: contentHash,
                metadata: {
                  from: email.from,
                  date: email.date,
                },
              });

            if (error) {
              console.error(`Failed to index email ${email.id}:`, error);
              errors++;
            } else {
              indexed++;
            }
          } catch (emailError) {
            console.error(`Error processing email:`, emailError);
            errors++;
          }
        }

        return { 
          indexed, 
          skipped, 
          errors, 
          message: `Indexed ${indexed} emails, skipped ${skipped} duplicates, ${errors} errors` 
        };
      }

      default:
        throw new Error(`Unknown Gmail action: ${action}`);
    }
  } catch (error) {
    console.error('Gmail API error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Gmail request failed');
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
    case 'testConnection': {
      const response = await fetch(`${baseUrl}/wiki/rest/api/space?limit=1`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      return { success: true, message: 'Confluence connection is working' };
    }
    
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
    case 'testConnection': {
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      return { success: true, message: 'Jira connection is working' };
    }
    
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
    case 'testConnection': {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers,
      });
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      return { success: true, message: 'Notion connection is working' };
    }
    
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
    case 'testConnection': {
      const response = await fetch('https://api.github.com/user', { headers });
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      return { success: true, message: 'GitHub connection is working' };
    }
    
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
    case 'testConnection': {
      const response = await fetch('https://slack.com/api/auth.test', { headers });
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Slack authentication failed');
      return { success: true, message: 'Slack connection is working' };
    }
    
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
    case 'testConnection': {
      const response = await fetch(`${baseUrl}/api/now/table/sys_user?sysparm_limit=1`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Authentication failed. Check credentials.');
        throw new Error(`Connection failed: ${response.status}`);
      }
      return { success: true, message: 'ServiceNow connection is working' };
    }
    
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

// WhatsApp Business API helper
async function callWhatsApp(config: Record<string, string>, action: string, params?: Record<string, unknown>): Promise<unknown> {
  const { accessToken, phoneNumberId, businessAccountId } = config;
  
  if (!accessToken || !phoneNumberId) {
    throw new Error('WhatsApp Business API requires access token and phone number ID. Get these from Meta Business Suite.');
  }

  const baseUrl = 'https://graph.facebook.com/v18.0';
  
  switch (action) {
    case 'testConnection': {
      // Test by fetching phone number info
      const response = await fetch(`${baseUrl}/${phoneNumberId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error('Invalid access token. Please check your WhatsApp Business API token.');
        if (response.status === 400) throw new Error('Invalid phone number ID. Please verify in Meta Business Suite.');
        throw new Error(`WhatsApp API error: ${errorData?.error?.message || response.status}`);
      }
      
      const data = await response.json();
      return { 
        success: true, 
        message: `WhatsApp Business connected: ${data.display_phone_number || 'Phone verified'}`,
        phoneNumber: data.display_phone_number,
        verifiedName: data.verified_name
      };
    }

    case 'getMessages': {
      // Note: WhatsApp Cloud API doesn't provide message history directly
      // Messages are received via webhooks. This fetches conversation analytics.
      if (!businessAccountId) {
        return { 
          messages: [],
          note: 'Message history requires webhook setup. WhatsApp Cloud API delivers messages in real-time via webhooks.'
        };
      }
      
      const response = await fetch(
        `${baseUrl}/${businessAccountId}/conversations?fields=id,name,messages_count`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      return { conversations: data.data || [], total: data.data?.length || 0 };
    }

    case 'sendMessage': {
      const { to, message } = params || {};
      if (!to || !message) {
        throw new Error('Recipient (to) and message are required');
      }
      
      const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to send message: ${errorData?.error?.message || response.status}`);
      }
      
      const data = await response.json();
      return { success: true, messageId: data.messages?.[0]?.id };
    }

    default:
      throw new Error(`Unknown WhatsApp action: ${action}`);
  }
}

// Demo/mock connectors for connectors that need local setup
async function callDemoConnector(connector: string, action: string, _config: Record<string, string>): Promise<unknown> {
  switch (action) {
    case 'testConnection':
      // Simulate fast connection test
      return { success: true, message: `${connector} connector ready (demo mode)` };
    default:
      return { success: true, message: `${connector} action "${action}" executed (demo mode)` };
  }
}

// Calendar (Google Calendar) API helper
async function callCalendar(config: Record<string, string>, action: string, _params?: Record<string, unknown>): Promise<unknown> {
  const { accessToken } = config;
  
  if (!accessToken) {
    throw new Error('Google Calendar access token not configured. Please connect with OAuth.');
  }

  switch (action) {
    case 'testConnection': {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!response.ok) {
        if (response.status === 401) throw new Error('Authentication expired. Please reconnect.');
        if (response.status === 403) throw new Error('Access denied. Check Calendar permissions.');
        throw new Error(`Connection failed: ${response.status}`);
      }
      
      return { success: true, message: 'Google Calendar connection is working' };
    }
    default:
      throw new Error(`Unknown Calendar action: ${action}`);
  }
}

// Main router function
async function routeConnectorRequest(request: ConnectorRequest): Promise<unknown> {
  const { connector, action, config, params } = request;

  console.log(`Routing request: ${connector} -> ${action}`);

  switch (connector) {
    case 'google-drive':
      return callGoogleDrive(config, action, params);
    case 'email':
      return callGmail(config, action, params);
    case 'calendar':
      return callCalendar(config, action, params);
    case 'jira':
      return callJira(config, action, params);
    case 'notion':
      return callNotion(config, action, params);
    case 'github':
      return callGitHub(config, action, params);
    case 'servicenow':
      return callServiceNow(config, action, params);
    // Demo connectors - fast mock responses
    case 'web':
    case 'file':
    case 'browser-history':
      return callDemoConnector(connector, action, config);
    case 'whatsapp':
      return callWhatsApp(config, action, params);
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
