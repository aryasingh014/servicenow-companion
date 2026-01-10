import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthRequest {
  action: 'save-tokens' | 'refresh-token' | 'get-token' | 'revoke';
  connectorId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  email?: string;
}

// Get user ID from JWT claims
async function getUserFromAuth(req: Request): Promise<{ userId: string; email?: string } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data?.user) {
    console.log('Could not get user from token:', error?.message);
    return null;
  }

  return { userId: data.user.id, email: data.user.email };
}

// Get connector display name
function getConnectorDisplayName(connectorId: string): string {
  const names: Record<string, string> = {
    'google-drive': 'Google Drive',
    'email': 'Email',
    'calendar': 'Calendar',
    'github': 'GitHub',
  };
  return names[connectorId] || connectorId;
}

// Refresh Google OAuth token
async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('Google OAuth credentials not configured');
    return null;
  }

  try {
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
      console.error('Failed to refresh Google token:', await response.text());
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error) {
    console.error('Error refreshing Google token:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const userInfo = await getUserFromAuth(req);
    if (!userInfo) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = userInfo;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const request: OAuthRequest = await req.json();
    const { action, connectorId } = request;

    console.log(`OAuth Connector: ${action} for ${connectorId} (user: ${userId})`);

    switch (action) {
      case 'save-tokens': {
        const { accessToken, refreshToken, expiresAt, email } = request;

        if (!accessToken) {
          return new Response(
            JSON.stringify({ error: 'Access token is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate expiry time (default 1 hour if not provided)
        const tokenExpiry = expiresAt || new Date(Date.now() + 3600 * 1000).toISOString();

        const connectorData = {
          user_id: userId,
          connector_id: connectorId,
          name: getConnectorDisplayName(connectorId),
          config: { email: email || userInfo.email || '' },
          oauth_tokens: {
            access_token: accessToken,
            refresh_token: refreshToken || null,
            expires_at: tokenExpiry,
          },
          status: 'connected',
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('user_connectors')
          .upsert(connectorData, { onConflict: 'user_id,connector_id' });

        if (error) {
          console.error('Error saving tokens:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to save tokens' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`✅ Saved OAuth tokens for ${connectorId} (user: ${userId})`);

        return new Response(
          JSON.stringify({ success: true, message: 'Tokens saved successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-token': {
        // Get the current token, refreshing if needed
        const { data: connector, error } = await supabase
          .from('user_connectors')
          .select('oauth_tokens, status')
          .eq('user_id', userId)
          .eq('connector_id', connectorId)
          .maybeSingle();

        if (error || !connector) {
          return new Response(
            JSON.stringify({ error: 'Connector not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (connector.status !== 'connected') {
          return new Response(
            JSON.stringify({ error: 'Connector is not connected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const oauthTokens = connector.oauth_tokens as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
        } | null;

        if (!oauthTokens?.access_token) {
          return new Response(
            JSON.stringify({ error: 'No access token found' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if token is expired or will expire soon (within 5 minutes)
        const expiresAt = oauthTokens.expires_at ? new Date(oauthTokens.expires_at) : null;
        const isExpired = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

        if (isExpired && oauthTokens.refresh_token) {
          console.log(`Token expired for ${connectorId}, refreshing...`);
          
          // Determine provider and refresh
          const isGoogleConnector = ['google-drive', 'email', 'calendar'].includes(connectorId);
          
          if (isGoogleConnector) {
            const refreshed = await refreshGoogleToken(oauthTokens.refresh_token);
            
            if (refreshed) {
              // Update the tokens in database
              await supabase
                .from('user_connectors')
                .update({
                  oauth_tokens: {
                    access_token: refreshed.accessToken,
                    refresh_token: oauthTokens.refresh_token,
                    expires_at: refreshed.expiresAt,
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId)
                .eq('connector_id', connectorId);

              console.log(`✅ Refreshed token for ${connectorId}`);

              return new Response(
                JSON.stringify({ success: true, accessToken: refreshed.accessToken }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          // If refresh failed, return the old token (might still work)
          console.warn(`Failed to refresh token for ${connectorId}, returning existing token`);
        }

        return new Response(
          JSON.stringify({ success: true, accessToken: oauthTokens.access_token }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'refresh-token': {
        // Force refresh the token
        const { data: connector, error } = await supabase
          .from('user_connectors')
          .select('oauth_tokens')
          .eq('user_id', userId)
          .eq('connector_id', connectorId)
          .maybeSingle();

        if (error || !connector) {
          return new Response(
            JSON.stringify({ error: 'Connector not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const oauthTokens = connector.oauth_tokens as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
        } | null;

        if (!oauthTokens?.refresh_token) {
          return new Response(
            JSON.stringify({ error: 'No refresh token available' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const isGoogleConnector = ['google-drive', 'email', 'calendar'].includes(connectorId);
        
        if (isGoogleConnector) {
          const refreshed = await refreshGoogleToken(oauthTokens.refresh_token);
          
          if (!refreshed) {
            return new Response(
              JSON.stringify({ error: 'Failed to refresh token' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Update the tokens in database
          await supabase
            .from('user_connectors')
            .update({
              oauth_tokens: {
                access_token: refreshed.accessToken,
                refresh_token: oauthTokens.refresh_token,
                expires_at: refreshed.expiresAt,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('connector_id', connectorId);

          return new Response(
            JSON.stringify({ success: true, accessToken: refreshed.accessToken }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Token refresh not supported for this connector' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'revoke': {
        // Disconnect the connector
        const { error } = await supabase
          .from('user_connectors')
          .delete()
          .eq('user_id', userId)
          .eq('connector_id', connectorId);

        if (error) {
          console.error('Error revoking connector:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to revoke connector' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`✅ Revoked ${connectorId} for user ${userId}`);

        return new Response(
          JSON.stringify({ success: true, message: 'Connector revoked' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('OAuth Connector error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
