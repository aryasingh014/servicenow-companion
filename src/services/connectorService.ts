import { supabase } from "@/integrations/supabase/client";

// Type for user connector from database
export interface UserConnector {
  id: string;
  user_id: string;
  connector_id: string;
  name: string;
  config: Record<string, string>;
  oauth_tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
  } | null;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Legacy type for backwards compatibility
export interface ConnectedSource {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
  connectedAt: string;
}

// Get display name for connector
function getConnectorDisplayName(connectorId: string): string {
  const names: Record<string, string> = {
    'confluence': 'Confluence',
    'sharepoint': 'SharePoint',
    'google-drive': 'Google Drive',
    'jira': 'Jira',
    'zendesk': 'Zendesk',
    'servicenow': 'ServiceNow',
    'slack': 'Slack',
    'salesforce': 'Salesforce',
    'hubspot': 'HubSpot',
    'gong': 'Gong',
    'github': 'GitHub',
    'web': 'Web Pages',
    'file': 'Files',
    'email': 'Email',
    'calendar': 'Calendar',
    'notion': 'Notion',
    'bookstack': 'BookStack',
    'document360': 'Document360',
    'discourse': 'Discourse',
  };
  return names[connectorId] || connectorId;
}

// Fetch all connected sources for the current user from database
export async function getConnectedSources(): Promise<ConnectedSource[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_connectors')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected');

    if (error) {
      console.error("Error loading connected sources:", error);
      return [];
    }

    return (data || []).map((c: UserConnector) => ({
      id: c.connector_id,
      name: c.name,
      type: c.connector_id,
      config: {
        ...c.config,
        // Include OAuth tokens in config for API calls
        ...(c.oauth_tokens?.access_token && { accessToken: c.oauth_tokens.access_token }),
      },
      connectedAt: c.created_at,
    }));
  } catch (e) {
    console.error("Error loading connected sources:", e);
    return [];
  }
}

// Check if a specific connector is connected for current user
export async function isConnectorConnected(connectorId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('user_connectors')
      .select('id')
      .eq('user_id', user.id)
      .eq('connector_id', connectorId)
      .eq('status', 'connected')
      .maybeSingle();

    if (error) {
      console.error("Error checking connector status:", error);
      return false;
    }

    return !!data;
  } catch (e) {
    console.error("Error checking connector status:", e);
    return false;
  }
}

// Get connector config for current user
export async function getConnectorConfig(connectorId: string): Promise<Record<string, string> | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_connectors')
      .select('config, oauth_tokens')
      .eq('user_id', user.id)
      .eq('connector_id', connectorId)
      .eq('status', 'connected')
      .maybeSingle();

    if (error || !data) return null;

    const config = (data.config as Record<string, string>) || {};
    const oauthTokens = data.oauth_tokens as { access_token?: string } | null;
    
    // Merge OAuth tokens into config
    if (oauthTokens?.access_token) {
      config.accessToken = oauthTokens.access_token;
    }

    return config;
  } catch (e) {
    console.error("Error getting connector config:", e);
    return null;
  }
}

// Save or update connector for current user
export async function saveConnector(
  connectorId: string,
  config: Record<string, string>,
  oauthTokens?: { access_token?: string; refresh_token?: string; expires_at?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const connectorData = {
      user_id: user.id,
      connector_id: connectorId,
      name: getConnectorDisplayName(connectorId),
      config,
      oauth_tokens: oauthTokens || null,
      status: 'connected' as const,
      updated_at: new Date().toISOString(),
    };

    // Upsert: insert or update if exists
    const { error } = await supabase
      .from('user_connectors')
      .upsert(connectorData, {
        onConflict: 'user_id,connector_id',
      });

    if (error) {
      console.error("Error saving connector:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    console.error("Error saving connector:", e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Disconnect a connector for current user
export async function disconnectConnector(connectorId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('user_connectors')
      .delete()
      .eq('user_id', user.id)
      .eq('connector_id', connectorId);

    if (error) {
      console.error("Error disconnecting connector:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    console.error("Error disconnecting connector:", e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Get list of connected connector IDs for current user
export async function getConnectedConnectorIds(): Promise<string[]> {
  const sources = await getConnectedSources();
  return sources.map(s => s.id);
}

// Get list of connected connector names for display
export async function getConnectedConnectorNames(): Promise<string[]> {
  const sources = await getConnectedSources();
  return sources.map(s => s.name);
}

// Build context about connected sources for the AI
export async function buildConnectedSourcesContext(): Promise<string> {
  const sources = await getConnectedSources();
  
  if (sources.length === 0) {
    return "No data sources are currently connected.";
  }
  
  const sourceList = sources.map(s => `- ${s.name}`).join('\n');
  return `Connected data sources:\n${sourceList}`;
}

// Fetch all user connectors with full details (for Settings page)
export async function fetchUserConnectors(): Promise<UserConnector[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_connectors')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error("Error fetching user connectors:", error);
      return [];
    }

    return (data || []) as UserConnector[];
  } catch (e) {
    console.error("Error fetching user connectors:", e);
    return [];
  }
}

// Update connector's last synced timestamp
export async function updateConnectorLastSynced(connectorId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_connectors')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('connector_id', connectorId);
  } catch (e) {
    console.error("Error updating last synced:", e);
  }
}
