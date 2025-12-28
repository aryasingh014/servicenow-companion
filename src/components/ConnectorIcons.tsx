import React from 'react';

// Confluence
export const ConfluenceIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1.938 18.534c-.246.404-.508.86-.737 1.232a.573.573 0 00.2.784l4.036 2.456a.578.578 0 00.79-.186c.2-.34.462-.798.746-1.296 1.924-3.358 3.874-2.944 7.352-1.264l4.036 1.948a.574.574 0 00.766-.268l1.802-4.104a.574.574 0 00-.264-.754c-1.104-.528-3.294-1.578-5.356-2.57-5.768-2.772-10.638-2.53-13.37 4.022z"
      fill="#1868DB"
    />
    <path
      d="M22.062 5.466c.246-.404.508-.86.738-1.232a.573.573 0 00-.2-.784L18.564.994a.578.578 0 00-.79.186c-.2.34-.462.798-.746 1.296-1.924 3.358-3.874 2.944-7.352 1.264L5.64 1.792a.574.574 0 00-.766.268L3.072 6.164a.574.574 0 00.264.754c1.104.528 3.294 1.578 5.356 2.57 5.768 2.772 10.638 2.53 13.37-4.022z"
      fill="#1868DB"
    />
  </svg>
);

// SharePoint
export const SharePointIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#038387" />
    <circle cx="16" cy="12" r="7" fill="#1A9BA1" />
    <circle cx="12" cy="17" r="5" fill="#37C2D8" />
    <path d="M6 8h8v2H6zM6 12h6v2H6zM10 16h4v2h-4z" fill="white" />
  </svg>
);

// Google Drive
export const GoogleDriveIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.5 2L1 15h6.5l7.5-13H8.5z" fill="#0F9D58" />
    <path d="M23 15L15.5 2H9l7.5 13H23z" fill="#FBBC04" />
    <path d="M1 15l3.5 6h15l3.5-6H1z" fill="#4285F4" />
  </svg>
);

// Jira
export const JiraIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12.004 1L3 12l4.5 4.5L12 12l4.5 4.5L21 12 12.004 1z"
      fill="url(#jira-gradient)"
    />
    <path d="M12 12l-4.5 4.5L12 21l4.5-4.5L12 12z" fill="#2684FF" />
    <defs>
      <linearGradient id="jira-gradient" x1="4" y1="6" x2="18" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2684FF" />
        <stop offset="1" stopColor="#0052CC" />
      </linearGradient>
    </defs>
  </svg>
);

// Zendesk
export const ZendeskIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 2v14L2 22V8l9-6z" fill="#03363D" />
    <path d="M11 2L2 8h9V2z" fill="#03363D" />
    <path d="M13 22V8l9-6v14l-9 6z" fill="#03363D" />
    <path d="M13 22l9-6h-9v6z" fill="#03363D" />
  </svg>
);

// ServiceNow
export const ServiceNowIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#81B5A1" />
    <circle cx="12" cy="12" r="5" fill="white" />
    <circle cx="12" cy="12" r="2.5" fill="#81B5A1" />
  </svg>
);

// Slack
export const SlackIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.5 14.5a2 2 0 100-4 2 2 0 000 4zm4-2h4v-4a2 2 0 10-4 0v4z" fill="#E01E5A" />
    <path d="M9.5 5.5a2 2 0 104 0 2 2 0 00-4 0zm2 4v4h4a2 2 0 100-4h-4z" fill="#36C5F0" />
    <path d="M18.5 9.5a2 2 0 100 4 2 2 0 000-4zm-4 2h-4v4a2 2 0 104 0v-4z" fill="#2EB67D" />
    <path d="M14.5 18.5a2 2 0 10-4 0 2 2 0 004 0zm-2-4v-4h-4a2 2 0 100 4h4z" fill="#ECB22E" />
  </svg>
);

// Salesforce
export const SalesforceIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10.2 5.4a4.2 4.2 0 013.2-1.4 4.4 4.4 0 014.4 4.4 4.4 4.4 0 01-.2 1.2 3.4 3.4 0 012.4 3.2 3.4 3.4 0 01-3.4 3.4H8a4 4 0 01-4-4 4 4 0 012.8-3.8 4.8 4.8 0 013.4-3z"
      fill="#00A1E0"
    />
  </svg>
);

// HubSpot
export const HubSpotIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M17 8.5V6.5a1.5 1.5 0 00-1.5-1.5h0a1.5 1.5 0 00-1.5 1.5v2a4.5 4.5 0 102.5 8l2-2a1 1 0 00-1.4-1.4l-2 2A2.5 2.5 0 1117 10.5v-2z"
      fill="#FF7A59"
    />
    <circle cx="8" cy="8" r="2" fill="#FF7A59" />
    <path d="M8 10v4" stroke="#FF7A59" strokeWidth="2" />
  </svg>
);

// Gong
export const GongIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#6B52AE" />
    <path d="M8 9v6M12 7v10M16 9v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// GitHub
export const GitHubIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
      fill="#181717"
    />
  </svg>
);

// Web
export const WebIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#6366F1" strokeWidth="2" />
    <ellipse cx="12" cy="12" rx="4" ry="10" stroke="#6366F1" strokeWidth="2" />
    <path d="M2 12h20M4 7h16M4 17h16" stroke="#6366F1" strokeWidth="2" />
  </svg>
);

// File
export const FileIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
      fill="#10B981"
      stroke="#10B981"
      strokeWidth="2"
    />
    <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Email
export const EmailIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="20" height="16" rx="2" fill="#EA4335" />
    <path d="M2 6l10 7 10-7" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Notion
export const NotionIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4.5A1.5 1.5 0 015.5 3H16l4 4v12.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19.5v-15z"
      fill="white"
      stroke="#000"
      strokeWidth="1.5"
    />
    <path d="M7 8h6M7 12h10M7 16h8" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// BookStack
export const BookStackIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2z" fill="#0288D1" />
    <path d="M8 7h8M8 11h8M8 15h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Document360
export const Document360Icon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#7C3AED" />
    <path d="M8 9h8M8 12h8M8 15h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Discourse
export const DiscourseIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#000" />
    <path
      d="M12 6c-3.3 0-6 2.4-6 5.4 0 1.3.5 2.5 1.3 3.4L6 18l3.7-1.3c.7.2 1.5.3 2.3.3 3.3 0 6-2.4 6-5.4S15.3 6 12 6z"
      fill="#FFF9AE"
    />
  </svg>
);

// Connector icon map
export const connectorIcons: Record<string, React.FC<{ className?: string }>> = {
  confluence: ConfluenceIcon,
  sharepoint: SharePointIcon,
  'google-drive': GoogleDriveIcon,
  jira: JiraIcon,
  zendesk: ZendeskIcon,
  servicenow: ServiceNowIcon,
  slack: SlackIcon,
  salesforce: SalesforceIcon,
  hubspot: HubSpotIcon,
  gong: GongIcon,
  github: GitHubIcon,
  web: WebIcon,
  file: FileIcon,
  email: EmailIcon,
  notion: NotionIcon,
  bookstack: BookStackIcon,
  document360: Document360Icon,
  discourse: DiscourseIcon,
};
