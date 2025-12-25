export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ConversationContext {
  lastArticleId?: string;
  lastIncidentId?: string;
  incidentCreationFlow?: {
    step: "description" | "details" | "urgency" | "impact" | "category" | "confirm";
    data: Partial<IncidentData>;
  };
}

export interface IncidentData {
  shortDescription: string;
  description: string;
  urgency: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  category?: string;
}

export interface KnowledgeArticle {
  sysId: string;
  number: string;
  shortDescription: string;
  text: string;
  category: string;
}

export interface Incident {
  sysId: string;
  number: string;
  shortDescription: string;
  description: string;
  state: string;
  priority: string;
  assignmentGroup: string;
  openedAt: string;
}
