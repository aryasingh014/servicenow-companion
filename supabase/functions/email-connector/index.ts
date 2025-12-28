import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Note: Using a Deno-compatible IMAP approach via raw sockets is complex.
// For MVP, we provide a simpler approach using fetch-based APIs for Gmail/Outlook
// with app passwords or OAuth tokens.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailConnectorRequest {
  action: 'test' | 'fetch' | 'index';
  config: {
    provider: 'imap' | 'gmail' | 'outlook';
    email: string;
    password?: string;
    imapHost?: string;
    imapPort?: string;
  };
  limit?: number;
}

interface ParsedEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}

// Get IMAP settings based on provider
function getImapSettings(config: EmailConnectorRequest['config']) {
  switch (config.provider) {
    case 'gmail':
      return {
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
      };
    case 'outlook':
      return {
        host: 'outlook.office365.com',
        port: 993,
        secure: true,
      };
    case 'imap':
    default:
      return {
        host: config.imapHost || 'imap.gmail.com',
        port: parseInt(config.imapPort || '993', 10),
        secure: true,
      };
  }
}

// Gmail API fetch (requires OAuth token)
async function fetchGmailEmails(accessToken: string, limit = 20): Promise<ParsedEmail[]> {
  // List messages
  const listResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResp.ok) {
    const errorText = await listResp.text();
    console.error('Gmail list error:', listResp.status, errorText);
    if (listResp.status === 401) {
      throw new Error('Gmail authentication failed. Please reconnect your Gmail account.');
    }
    throw new Error(`Gmail API error: ${listResp.status}`);
  }

  const listData = await listResp.json();
  const messageIds = listData.messages || [];

  const emails: ParsedEmail[] = [];

  for (const msg of messageIds.slice(0, limit)) {
    try {
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgResp.ok) continue;

      const msgData = await msgResp.json();
      const headers = msgData.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

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

  return emails;
}

// Generic IMAP fetch (simplified - just validates credentials for now)
async function testImapConnection(config: EmailConnectorRequest['config']): Promise<{ success: boolean; message: string }> {
  // For generic IMAP, we can't easily connect in Deno edge functions
  // This is a placeholder that validates config format
  if (!config.imapHost || !config.password) {
    return {
      success: false,
      message: 'IMAP host and password are required for generic IMAP connections.',
    };
  }

  // In a real implementation, you would use a proper IMAP library
  // For now, we indicate that Gmail/Outlook OAuth is preferred
  return {
    success: false,
    message: 'Generic IMAP is not yet supported in edge functions. Please use Gmail or Outlook with OAuth.',
  };
}

// Connect and fetch emails based on provider
async function fetchEmails(config: EmailConnectorRequest['config'], limit = 20): Promise<ParsedEmail[]> {
  if (config.provider === 'gmail') {
    if (!config.password) {
      throw new Error('Gmail requires an OAuth access token');
    }
    // For Gmail, we expect config.password to be the OAuth access token
    return fetchGmailEmails(config.password, limit);
  }

  // For other providers, return error for now
  throw new Error(
    `${config.provider} IMAP not yet supported. Please connect Gmail via OAuth in Settings.`
  );
}

// Test connection
async function testConnection(config: EmailConnectorRequest['config']): Promise<{ success: boolean; message: string }> {
  if (config.provider === 'gmail') {
    if (!config.password) {
      return { success: false, message: 'Gmail requires an OAuth access token' };
    }
    try {
      const resp = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${config.password}` } }
      );
      if (!resp.ok) {
        return { success: false, message: 'Gmail authentication failed. Token may be expired.' };
      }
      const profile = await resp.json();
      return { success: true, message: `Connected to ${profile.emailAddress}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  return testImapConnection(config);
}

// Index emails into documents table
async function indexEmails(
  config: EmailConnectorRequest['config'],
  limit: number
): Promise<{ indexed: number; skipped: number; errors: number }> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase configuration missing');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const emails = await fetchEmails(config, limit);

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
            email_account: config.email,
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

  return { indexed, skipped, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: EmailConnectorRequest = await req.json();
    const { action, config, limit = 50 } = request;

    if (!config || !config.provider || !config.email) {
      throw new Error('Invalid request: config with provider and email required');
    }

    console.log(`Email connector action: ${action} for ${config.email}`);

    switch (action) {
      case 'test': {
        const result = await testConnection(config);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'fetch': {
        const emails = await fetchEmails(config, limit);
        return new Response(
          JSON.stringify({
            success: true,
            emails,
            count: emails.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'index': {
        const result = await indexEmails(config, limit);
        return new Response(
          JSON.stringify({
            success: true,
            ...result,
            message: `Indexed ${result.indexed} emails, skipped ${result.skipped} duplicates, ${result.errors} errors`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Email connector error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
