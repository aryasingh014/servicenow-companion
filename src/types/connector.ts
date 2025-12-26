export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'popular' | 'knowledge' | 'crm' | 'development' | 'communication' | 'storage';
  isConnected: boolean;
  configFields?: ConnectorField[];
}

export interface ConnectorField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ConnectorConfig {
  connectorId: string;
  config: Record<string, string>;
  connectedAt: string;
}
