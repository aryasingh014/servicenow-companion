import { Connector } from '@/types/connector';

export const connectors: Connector[] = [
  // Core Connectors
  {
    id: 'servicenow',
    name: 'ServiceNow',
    description: 'Connect to ServiceNow for IT service management',
    icon: '⚙️',
    category: 'popular',
    isConnected: true,
    configFields: [
      { name: 'instanceUrl', label: 'Instance URL', type: 'url', required: true, placeholder: 'https://your-instance.service-now.com' },
      { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'admin' },
      { name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'Your password' },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'One-click connect to Google Drive with OAuth',
    icon: '📂',
    category: 'popular',
    isConnected: false,
    useOAuth: true,
    oauthProvider: 'google',
    configFields: [],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Connect to Notion for notes and wikis',
    icon: '📝',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'integrationToken', label: 'Integration Token', type: 'password', required: true, placeholder: 'secret_your_token' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect to GitHub for code repositories',
    icon: '🐙',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'accessToken', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_your_token' },
      { name: 'organization', label: 'Organization (optional)', type: 'text', required: false, placeholder: 'your-org' },
    ],
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Connect Gmail to index emails for AI search',
    icon: '✉️',
    category: 'popular',
    isConnected: false,
    useOAuth: true,
    oauthProvider: 'google',
    configFields: [],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Connect Google Calendar to search events',
    icon: '📅',
    category: 'popular',
    isConnected: false,
    useOAuth: true,
    oauthProvider: 'google',
    configFields: [],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Connect to Atlassian Jira for issue tracking',
    icon: '🎯',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'url', label: 'Jira URL', type: 'url', required: true, placeholder: 'https://your-domain.atlassian.net' },
      { name: 'email', label: 'Email', type: 'text', required: true, placeholder: 'your-email@company.com' },
      { name: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Your API token' },
    ],
  },
  {
    id: 'web',
    name: 'Web',
    description: 'Crawl and index web pages',
    icon: '🌐',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'urls', label: 'URLs to crawl', type: 'text', required: true, placeholder: 'https://example.com' },
      { name: 'depth', label: 'Crawl Depth', type: 'select', required: true, options: [
        { value: '1', label: '1 level' },
        { value: '2', label: '2 levels' },
        { value: '3', label: '3 levels' },
      ]},
    ],
  },
  {
    id: 'file',
    name: 'File',
    description: 'Upload and index local files',
    icon: '📄',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'fileTypes', label: 'Supported file types', type: 'text', required: false, placeholder: 'PDF, DOC, TXT (all supported)' },
    ],
  },
  {
    id: 'browser-history',
    name: 'Browser History',
    description: 'Index your browser history for search',
    icon: '🕐',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'daysBack', label: 'Days to index', type: 'select', required: true, options: [
        { value: '7', label: 'Last 7 days' },
        { value: '30', label: 'Last 30 days' },
        { value: '90', label: 'Last 90 days' },
      ]},
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Connect WhatsApp to search messages',
    icon: '💬',
    category: 'popular',
    isConnected: false,
    configFields: [
      { name: 'phoneNumber', label: 'Phone Number', type: 'text', required: true, placeholder: '+1234567890' },
      { name: 'businessId', label: 'Business Account ID', type: 'text', required: false, placeholder: 'Optional for business accounts' },
    ],
  },
];

export const connectorCategories = [
  { id: 'popular', name: 'Available Connectors', icon: '⭐' },
] as const;
