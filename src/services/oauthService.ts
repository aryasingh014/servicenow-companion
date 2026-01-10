import { supabase } from "@/integrations/supabase/client";

// Get a fresh OAuth token for a connector, refreshing if needed
export async function getFreshOAuthToken(connectorId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('oauth-connector', {
      body: {
        action: 'get-token',
        connectorId,
      },
    });

    if (error) {
      console.error('Error getting OAuth token:', error);
      return null;
    }

    const result = data as { success?: boolean; accessToken?: string; error?: string };
    
    if (!result.success || !result.accessToken) {
      console.error('Failed to get OAuth token:', result.error);
      return null;
    }

    return result.accessToken;
  } catch (e) {
    console.error('Error fetching OAuth token:', e);
    return null;
  }
}

// Force refresh an OAuth token
export async function refreshOAuthToken(connectorId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('oauth-connector', {
      body: {
        action: 'refresh-token',
        connectorId,
      },
    });

    if (error) {
      console.error('Error refreshing OAuth token:', error);
      return null;
    }

    const result = data as { success?: boolean; accessToken?: string; error?: string };
    
    if (!result.success || !result.accessToken) {
      console.error('Failed to refresh OAuth token:', result.error);
      return null;
    }

    return result.accessToken;
  } catch (e) {
    console.error('Error refreshing OAuth token:', e);
    return null;
  }
}

// Revoke/disconnect an OAuth connector
export async function revokeOAuthConnector(connectorId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('oauth-connector', {
      body: {
        action: 'revoke',
        connectorId,
      },
    });

    if (error) {
      console.error('Error revoking connector:', error);
      return false;
    }

    const result = data as { success?: boolean };
    return result.success === true;
  } catch (e) {
    console.error('Error revoking connector:', e);
    return false;
  }
}

// Check if a connector is an OAuth-based connector
export function isOAuthConnector(connectorId: string): boolean {
  const oauthConnectors = ['google-drive', 'email', 'calendar', 'github'];
  return oauthConnectors.includes(connectorId);
}
