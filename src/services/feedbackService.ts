import { supabase } from "@/integrations/supabase/client";
import { Feedback, FeedbackAnalysis } from "@/types/feedback";

export async function submitFeedback(feedback: Feedback): Promise<void> {
  try {
    // Submit to Supabase Edge Function for processing
    const { data, error } = await supabase.functions.invoke('feedback', {
      body: {
        action: 'submit',
        feedback: {
          ...feedback,
          timestamp: feedback.timestamp || new Date().toISOString(),
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    // If there are immediate adjustments, apply them
    if (data?.adjustments) {
      console.log('📊 Feedback-triggered adjustments:', data.adjustments);
      // Store adjustments for real-time use
      localStorage.setItem('nova_adjustments', JSON.stringify(data.adjustments));
    }

    // If there are critical alerts, show notification
    if (data?.criticalAlert) {
      console.warn('🚨 Critical feedback alert:', data.criticalAlert);
      // Could trigger a notification system here
    }

    return data;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
}

export async function getFeedbackAnalysis(): Promise<FeedbackAnalysis | null> {
  try {
    const { data, error } = await supabase.functions.invoke('feedback', {
      body: { action: 'analyze' },
    });

    if (error) {
      throw new Error(error.message);
    }

    return data as FeedbackAnalysis;
  } catch (error) {
    console.error('Error fetching feedback analysis:', error);
    return null;
  }
}

export function getStoredAdjustments(): any[] {
  try {
    const stored = localStorage.getItem('nova_adjustments');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearStoredAdjustments(): void {
  localStorage.removeItem('nova_adjustments');
}

