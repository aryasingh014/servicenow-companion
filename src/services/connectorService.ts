import { ConnectorConfig } from "@/types/connector";

const STORAGE_KEY = "connected-sources";

export interface ConnectedSource {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
  connectedAt: string;
}

// Get all connected sources
export function getConnectedSources(): ConnectedSource[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    
    const configs: ConnectorConfig[] = JSON.parse(saved);
    return configs.map(c => ({
      id: c.connectorId,
      name: getConnectorDisplayName(c.connectorId),
      type: c.connectorId,
      config: c.config,
      connectedAt: c.connectedAt,
    }));
  } catch (e) {
    console.error("Error loading connected sources:", e);
    return [];
  }
}

// Check if a specific connector is connected
export function isConnectorConnected(connectorId: string): boolean {
  const sources = getConnectedSources();
  return sources.some(s => s.id === connectorId);
}

// Get connector config
export function getConnectorConfig(connectorId: string): Record<string, string> | null {
  const sources = getConnectedSources();
  const source = sources.find(s => s.id === connectorId);
  return source?.config || null;
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
    'notion': 'Notion',
    'bookstack': 'BookStack',
    'document360': 'Document360',
    'discourse': 'Discourse',
  };
  return names[connectorId] || connectorId;
}

// Get list of connected connector names for display
export function getConnectedConnectorNames(): string[] {
  return getConnectedSources().map(s => s.name);
}

// Build context about connected sources for the AI
export function buildConnectedSourcesContext(): string {
  const sources = getConnectedSources();
  
  if (sources.length === 0) {
    return "No data sources are currently connected.";
  }
  
  const sourceList = sources.map(s => `- ${s.name}`).join('\n');
  return `Connected data sources:\n${sourceList}`;
}
