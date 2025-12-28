import React from 'react';

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

// ServiceNow
export const ServiceNowIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#81B5A1" />
    <circle cx="12" cy="12" r="5" fill="white" />
    <circle cx="12" cy="12" r="2.5" fill="#81B5A1" />
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

// Email (Gmail style)
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

// Calendar (Google Calendar style)
export const CalendarIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4" />
    <rect x="3" y="4" width="18" height="4" fill="#1A73E8" />
    <path d="M7 2v4M17 2v4" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
    <rect x="7" y="11" width="4" height="3" fill="white" rx="0.5" />
    <rect x="13" y="11" width="4" height="3" fill="white" rx="0.5" />
    <rect x="7" y="16" width="4" height="3" fill="white" rx="0.5" />
  </svg>
);

// Browser History
export const BrowserHistoryIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#8B5CF6" strokeWidth="2" fill="white" />
    <path d="M12 6v6l4 2" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12H2M22 12h-2M12 2v2M12 20v2" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// WhatsApp
export const WhatsAppIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
      fill="#25D366"
    />
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
      fill="white"
    />
  </svg>
);

// Connector icon map
export const connectorIcons: Record<string, React.FC<{ className?: string }>> = {
  'google-drive': GoogleDriveIcon,
  jira: JiraIcon,
  servicenow: ServiceNowIcon,
  github: GitHubIcon,
  web: WebIcon,
  file: FileIcon,
  email: EmailIcon,
  notion: NotionIcon,
  calendar: CalendarIcon,
  'browser-history': BrowserHistoryIcon,
  whatsapp: WhatsAppIcon,
};
