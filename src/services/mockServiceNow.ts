// Mock ServiceNow service for demo purposes
// This will be replaced with actual API calls via edge functions

import { KnowledgeArticle, Incident, ConversationContext } from "@/types/chat";

// Mock data
const mockArticles: KnowledgeArticle[] = [
  {
    sysId: "1",
    number: "KB0000011",
    shortDescription: "Password Reset Procedure",
    text: "This article covers the complete password reset process including self-service options, MFA requirements, and common troubleshooting steps.",
    category: "IT Support",
  },
  {
    sysId: "2",
    number: "KB0000012",
    shortDescription: "VPN Connection Guide",
    text: "Step-by-step instructions for connecting to the corporate VPN, including configuration for different operating systems.",
    category: "Network",
  },
  {
    sysId: "3",
    number: "KB0000013",
    shortDescription: "Email Setup on Mobile Devices",
    text: "Guide for configuring corporate email on iOS and Android devices with security requirements.",
    category: "Mobile",
  },
];

const mockIncidents: Incident[] = [
  {
    sysId: "1",
    number: "INC0010395",
    shortDescription: "Email access issues",
    description: "User unable to access email on Outlook. Error message indicates authentication failure.",
    state: "In Progress",
    priority: "High",
    assignmentGroup: "IT Support",
    openedAt: "2024-01-15T10:30:00Z",
  },
  {
    sysId: "2",
    number: "INC0010396",
    shortDescription: "Printer not working",
    description: "Network printer on 3rd floor not responding to print jobs.",
    state: "New",
    priority: "Medium",
    assignmentGroup: "Hardware Support",
    openedAt: "2024-01-15T11:45:00Z",
  },
];

export class MockServiceNowService {
  async getArticleCount(): Promise<number> {
    await this.simulateDelay();
    return 54; // Simulated count
  }

  async getIncidentCount(): Promise<number> {
    await this.simulateDelay();
    return 1500; // Simulated count
  }

  async getArticleByNumber(number: string): Promise<KnowledgeArticle | null> {
    await this.simulateDelay();
    return mockArticles.find((a) => a.number === number) || mockArticles[0];
  }

  async getIncidentByNumber(number: string): Promise<Incident | null> {
    await this.simulateDelay();
    return mockIncidents.find((i) => i.number === number) || mockIncidents[0];
  }

  async createIncident(data: {
    shortDescription: string;
    description: string;
    urgency: string;
    impact: string;
  }): Promise<string> {
    await this.simulateDelay();
    return `INC00${Math.floor(10000 + Math.random() * 90000)}`;
  }

  private simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export const processUserMessage = async (
  message: string,
  context: ConversationContext,
  service: MockServiceNowService
): Promise<{ response: string; contextUpdates: Partial<ConversationContext> }> => {
  const lowerMessage = message.toLowerCase();
  let response = "";
  let contextUpdates: Partial<ConversationContext> = {};

  // Check for incident creation flow
  if (context.incidentCreationFlow) {
    return handleIncidentCreationFlow(message, context, service);
  }

  // Knowledge article count
  if (
    lowerMessage.includes("how many") &&
    (lowerMessage.includes("article") || lowerMessage.includes("knowledge"))
  ) {
    const count = await service.getArticleCount();
    response = `There are ${count} knowledge articles available in the system.\n\nWould you like details for a specific article, or should I help you find articles on a particular topic?`;
  }
  // Incident count
  else if (
    lowerMessage.includes("how many") &&
    lowerMessage.includes("incident")
  ) {
    const count = await service.getIncidentCount();
    response = `There are currently ${count.toLocaleString()} incidents in the system.\n\nWould you like details for a specific incident, or would you like to create a new one?`;
  }
  // Fetch specific article
  else if (lowerMessage.includes("kb") && /kb\d+/i.test(lowerMessage)) {
    const match = lowerMessage.match(/kb\d+/i);
    if (match) {
      const article = await service.getArticleByNumber(match[0].toUpperCase());
      if (article) {
        contextUpdates.lastArticleId = article.number;
        response = `Here's article ${article.number}: "${article.shortDescription}"\n\n**Main Topics Covered:**\n• ${article.text}\n• Security requirements and best practices\n• Troubleshooting common issues\n• Self-service options\n• Contact escalation paths\n\nWould you like me to explain any of these topics in more detail, or check for related incidents?`;
      }
    }
  }
  // Fetch specific incident
  else if (lowerMessage.includes("inc") && /inc\d+/i.test(lowerMessage)) {
    const match = lowerMessage.match(/inc\d+/i);
    if (match) {
      const incident = await service.getIncidentByNumber(match[0].toUpperCase());
      if (incident) {
        contextUpdates.lastIncidentId = incident.number;
        response = `Incident ${incident.number} is currently **${incident.state}** with **${incident.priority}** priority.\n\n**Summary:** ${incident.shortDescription}\n\n**Details:** ${incident.description}\n\n**Assigned to:** ${incident.assignmentGroup}\n\nWould you like to see similar incidents, resolution steps, or update this incident?`;
      }
    }
  }
  // Create incident
  else if (
    lowerMessage.includes("create") &&
    lowerMessage.includes("incident")
  ) {
    response = "Sure, I'll help you create a new incident. What is the short description of the issue you're experiencing?";
    contextUpdates.incidentCreationFlow = {
      step: "description",
      data: {},
    };
  }
  // Service catalog
  else if (lowerMessage.includes("catalog") || lowerMessage.includes("service")) {
    response = "The Service Catalog contains various IT services and request items. Currently available categories include:\n\n• Hardware Requests\n• Software Requests\n• Access Requests\n• IT Services\n\nWhich category would you like to explore?";
  }
  // Default response
  else {
    response = "I can help you with:\n\n• **Knowledge Articles** - Search and view documentation\n• **Incidents** - View, create, or manage incidents\n• **Service Catalog** - Browse available services\n\nWhat would you like to know about?";
  }

  return { response, contextUpdates };
};

const handleIncidentCreationFlow = async (
  message: string,
  context: ConversationContext,
  service: MockServiceNowService
): Promise<{ response: string; contextUpdates: Partial<ConversationContext> }> => {
  const flow = context.incidentCreationFlow!;
  let response = "";
  let contextUpdates: Partial<ConversationContext> = {};

  switch (flow.step) {
    case "description":
      flow.data.shortDescription = message;
      response = "Got it. Can you describe the issue in more detail?";
      contextUpdates.incidentCreationFlow = { ...flow, step: "details" };
      break;
    case "details":
      flow.data.description = message;
      response = "How urgent is this issue? (Low / Medium / High)";
      contextUpdates.incidentCreationFlow = { ...flow, step: "urgency" };
      break;
    case "urgency":
      flow.data.urgency = message.toLowerCase() as "low" | "medium" | "high";
      response = "What is the impact? (Low - Single user / Medium - Multiple users / High - Business critical)";
      contextUpdates.incidentCreationFlow = { ...flow, step: "impact" };
      break;
    case "impact":
      flow.data.impact = message.toLowerCase() as "low" | "medium" | "high";
      const incidentNumber = await service.createIncident({
        shortDescription: flow.data.shortDescription!,
        description: flow.data.description!,
        urgency: flow.data.urgency!,
        impact: flow.data.impact!,
      });
      response = `Your incident has been created successfully!\n\n**Incident Number:** ${incidentNumber}\n\n**Summary:** ${flow.data.shortDescription}\n**Urgency:** ${flow.data.urgency}\n**Impact:** ${flow.data.impact}\n\nWould you like to track this incident, add more details, or create another request?`;
      contextUpdates.incidentCreationFlow = undefined;
      contextUpdates.lastIncidentId = incidentNumber;
      break;
  }

  return { response, contextUpdates };
};
