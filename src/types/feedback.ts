export type FeedbackRating = "positive" | "negative" | "neutral";

export type FeedbackCategory = 
  | "accuracy" 
  | "helpfulness" 
  | "clarity" 
  | "completeness" 
  | "adherence_to_rules"
  | "data_accuracy"
  | "response_time"
  | "other";

export interface Feedback {
  id?: string;
  messageId: string;
  conversationId?: string;
  rating: FeedbackRating;
  category: FeedbackCategory;
  comment?: string;
  userMessage?: string;
  assistantResponse?: string;
  timestamp?: Date;
  metadata?: {
    intent?: string;
    dataFetched?: boolean;
    errors?: string[];
    [key: string]: unknown;
  };
}

export interface FeedbackAnalysis {
  totalFeedback: number;
  averageRating: number;
  categoryBreakdown: Record<FeedbackCategory, number>;
  recentIssues: Feedback[];
  suggestedImprovements: string[];
  criticalAlerts: Feedback[];
}

export interface PromptAdjustment {
  adjustmentType: "add_rule" | "modify_rule" | "add_example" | "emphasize_rule";
  rule: string;
  priority: "high" | "medium" | "low";
  reason: string;
}

export interface ConversationalLearning {
  id?: string;
  pattern: string; // What the user wants (e.g., "start like this")
  instruction: string; // The actual instruction/rule learned
  context?: string; // The conversation context where it was learned
  learnedFrom: string; // The user message that contained the correction
  timestamp?: Date;
  appliedCount?: number; // How many times this has been applied
}

