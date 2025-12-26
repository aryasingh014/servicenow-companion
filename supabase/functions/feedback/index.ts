import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeedbackData {
  messageId: string;
  conversationId?: string;
  rating: 'positive' | 'negative' | 'neutral';
  category: string;
  comment?: string;
  userMessage?: string;
  assistantResponse?: string;
  metadata?: Record<string, unknown>;
}

interface FeedbackAnalysis {
  totalFeedback: number;
  averageRating: number;
  categoryBreakdown: Record<string, number>;
  recentIssues: FeedbackData[];
  suggestedImprovements: string[];
  criticalAlerts: FeedbackData[];
}

// In-memory storage for feedback (in production, use Supabase database)
// This allows real-time analysis without database queries
const feedbackStore: FeedbackData[] = [];

// Real-time adjustment rules based on feedback patterns
const adjustmentRules: Array<{
  condition: (feedback: FeedbackData[]) => boolean;
  adjustment: {
    type: 'add_rule' | 'modify_rule' | 'add_example' | 'emphasize_rule';
    rule: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  };
}> = [
  {
    condition: (feedback) => {
      // If 3+ negative feedbacks about data accuracy in last 10 feedbacks
      const recent = feedback.slice(-10);
      const dataAccuracyIssues = recent.filter(
        f => f.rating === 'negative' && f.category === 'data_accuracy'
      );
      return dataAccuracyIssues.length >= 3;
    },
    adjustment: {
      type: 'emphasize_rule',
      rule: 'ALWAYS verify data from ServiceNow before responding. Never make up numbers.',
      priority: 'high',
      reason: 'Multiple reports of inaccurate data',
    },
  },
  {
    condition: (feedback) => {
      // If 2+ negative feedbacks about adherence to rules
      const recent = feedback.slice(-10);
      const ruleViolations = recent.filter(
        f => f.rating === 'negative' && f.category === 'adherence_to_rules'
      );
      return ruleViolations.length >= 2;
    },
    adjustment: {
      type: 'emphasize_rule',
      rule: 'CRITICAL: Follow all conversation rules strictly. Review rules before responding.',
      priority: 'high',
      reason: 'Rule violations detected',
    },
  },
  {
    condition: (feedback) => {
      // If negative feedback mentions "can't" or "don't have access"
      const recent = feedback.slice(-5);
      return recent.some(f => 
        f.rating === 'negative' && 
        f.comment?.toLowerCase().includes("can't") &&
        f.comment?.toLowerCase().includes("access")
      );
    },
    adjustment: {
      type: 'add_rule',
      rule: 'NEVER say "I can\'t" or "I don\'t have access" when data is available. Always check if data was fetched before responding.',
      priority: 'high',
      reason: 'User reported unnecessary restrictions',
    },
  },
  {
    condition: (feedback) => {
      // If multiple complaints about incomplete responses
      const recent = feedback.slice(-10);
      const completenessIssues = recent.filter(
        f => f.rating === 'negative' && f.category === 'completeness'
      );
      return completenessIssues.length >= 2;
    },
    adjustment: {
      type: 'modify_rule',
      rule: 'Provide complete, detailed answers. Include all relevant information from search results.',
      priority: 'medium',
      reason: 'Responses too brief or incomplete',
    },
  },
];

function analyzeFeedback(feedback: FeedbackData[]): FeedbackAnalysis {
  const total = feedback.length;
  const ratings: number[] = feedback.map(f => {
    if (f.rating === 'positive') return 1;
    if (f.rating === 'negative') return -1;
    return 0;
  });
  const averageRating = total > 0 
    ? ratings.reduce((a: number, b: number) => a + b, 0) / total 
    : 0;

  const categoryBreakdown: Record<string, number> = {};
  feedback.forEach(f => {
    categoryBreakdown[f.category] = (categoryBreakdown[f.category] || 0) + 1;
  });

  const recentIssues = feedback
    .filter(f => f.rating === 'negative')
    .slice(-5)
    .reverse();

  const criticalAlerts = feedback
    .filter(f => 
      f.rating === 'negative' && 
      (f.category === 'data_accuracy' || f.category === 'adherence_to_rules')
    )
    .slice(-3)
    .reverse();

  const suggestedImprovements: string[] = [];
  
  // Analyze patterns and suggest improvements
  if (categoryBreakdown['data_accuracy'] > 0) {
    suggestedImprovements.push('Improve data verification before responding');
  }
  if (categoryBreakdown['adherence_to_rules'] > 0) {
    suggestedImprovements.push('Strengthen rule enforcement in responses');
  }
  if (categoryBreakdown['completeness'] > 0) {
    suggestedImprovements.push('Provide more complete and detailed responses');
  }

  return {
    totalFeedback: total,
    averageRating,
    categoryBreakdown,
    recentIssues,
    suggestedImprovements,
    criticalAlerts,
  };
}

function getRealTimeAdjustments(feedback: FeedbackData[]): Array<{
  type: string;
  rule: string;
  priority: string;
  reason: string;
}> {
  const adjustments: Array<{
    type: string;
    rule: string;
    priority: string;
    reason: string;
  }> = [];

  adjustmentRules.forEach(rule => {
    if (rule.condition(feedback)) {
      adjustments.push(rule.adjustment);
    }
  });

  return adjustments;
}

function checkCriticalAlert(feedback: FeedbackData): boolean {
  // Critical if negative feedback with high-priority categories
  if (feedback.rating !== 'negative') return false;
  
  const criticalCategories = ['data_accuracy', 'adherence_to_rules'];
  if (criticalCategories.includes(feedback.category)) return true;
  
  // Critical if comment contains urgent keywords
  const urgentKeywords = ['wrong', 'incorrect', 'error', 'broken', 'not working', 'failed'];
  const commentLower = feedback.comment?.toLowerCase() || '';
  return urgentKeywords.some(keyword => commentLower.includes(keyword));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, feedback: feedbackData } = await req.json();

    if (action === 'submit') {
      // Store feedback
      const feedback: FeedbackData = {
        ...feedbackData,
        timestamp: new Date().toISOString(),
      };
      
      feedbackStore.push(feedback);
      
      // Keep only last 100 feedback entries for analysis
      if (feedbackStore.length > 100) {
        feedbackStore.shift();
      }

      // Analyze for real-time adjustments
      const adjustments = getRealTimeAdjustments(feedbackStore);
      const isCritical = checkCriticalAlert(feedback);

      // Log critical alerts
      if (isCritical) {
        console.error('🚨 CRITICAL FEEDBACK ALERT:', {
          messageId: feedback.messageId,
          category: feedback.category,
          comment: feedback.comment,
          rating: feedback.rating,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          adjustments: adjustments.length > 0 ? adjustments : undefined,
          criticalAlert: isCritical ? {
            message: 'Critical feedback received',
            category: feedback.category,
            requiresImmediateReview: true,
          } : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'analyze') {
      const analysis = analyzeFeedback(feedbackStore);
      const adjustments = getRealTimeAdjustments(feedbackStore);

      return new Response(
        JSON.stringify({
          ...analysis,
          realTimeAdjustments: adjustments,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'get_adjustments') {
      const adjustments = getRealTimeAdjustments(feedbackStore);
      return new Response(
        JSON.stringify({ adjustments }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Feedback function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

