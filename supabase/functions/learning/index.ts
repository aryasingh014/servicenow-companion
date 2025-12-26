import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationalLearning {
  id: string;
  pattern: string;
  instruction: string;
  context?: string;
  learnedFrom: string;
  timestamp: string;
  appliedCount: number;
}

interface PromptAdjustment {
  type: 'add_rule' | 'modify_rule' | 'add_example' | 'emphasize_rule';
  rule: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

// In-memory storage for learned patterns (in production, use Supabase database)
const learnedPatterns: ConversationalLearning[] = [];

// Detect if user message contains a correction/instruction
function detectCorrection(userMessage: string, previousAssistantResponse?: string): {
  isCorrection: boolean;
  instruction?: string;
  pattern?: string;
} {
  const lowerMessage = userMessage.toLowerCase();
  
  // Patterns that indicate user is correcting/teaching
  const correctionPatterns = [
    /you (should|must|need to|have to) (start|begin|say|respond|answer|format|write|use)/i,
    /(start|begin|say|respond|answer|format|write|use) (like this|this way|like that|as follows)/i,
    /follow (this|that) (pattern|format|style|way|example)/i,
    /(this|that) is (how|the way) (you|I) (should|must|need to)/i,
    /(don't|do not) (start|say|respond|answer|format|write|use) (like that|that way)/i,
    /(instead|rather), (start|say|respond|answer|format|write|use)/i,
    /(correct|right) (way|format|pattern|style) (is|to|would be)/i,
    /you (should|must|need to) (always|never|try to)/i,
    /(prefer|like|want) (you|it) to (start|say|respond|answer|format|write|use)/i,
  ];

  // Check if message matches correction patterns
  for (const pattern of correctionPatterns) {
    if (pattern.test(userMessage)) {
      // Extract the instruction
      let instruction = userMessage;
      
      // Try to extract the actual instruction part
      const instructionMatch = userMessage.match(/(?:should|must|need to|like this|this way|as follows|would be|to)\s+(.+)/i);
      if (instructionMatch) {
        instruction = instructionMatch[1].trim();
      }
      
      // Remove quotes if present
      instruction = instruction.replace(/^["']|["']$/g, '');
      
      return {
        isCorrection: true,
        instruction: instruction.length > 0 ? instruction : userMessage,
        pattern: pattern.source,
      };
    }
  }

  // Check for explicit corrections like "no, that's wrong" or "actually, you should..."
  if (/^(no|actually|wait|correction|that's wrong|that's not right|incorrect)/i.test(lowerMessage)) {
    // Look for what they want instead
    const insteadMatch = userMessage.match(/(?:instead|rather|actually|should|must|need to)\s+(.+)/i);
    if (insteadMatch) {
      return {
        isCorrection: true,
        instruction: insteadMatch[1].trim(),
        pattern: 'explicit_correction',
      };
    }
  }

  return { isCorrection: false };
}

// Extract learning from user correction
function extractLearning(
  userMessage: string,
  previousAssistantResponse?: string,
  conversationContext?: string
): ConversationalLearning | null {
  const correction = detectCorrection(userMessage, previousAssistantResponse);
  
  if (!correction.isCorrection || !correction.instruction) {
    return null;
  }

  // Create a learning pattern
  const learning: ConversationalLearning = {
    id: `learned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    pattern: correction.pattern || 'user_correction',
    instruction: correction.instruction,
    context: conversationContext || previousAssistantResponse?.substring(0, 200),
    learnedFrom: userMessage,
    timestamp: new Date().toISOString(),
    appliedCount: 0,
  };

  return learning;
}

// Convert learned patterns to prompt adjustments
function getPromptAdjustments(): PromptAdjustment[] {
  const adjustments: PromptAdjustment[] = [];
  
  // Get recently learned patterns (last 20)
  const recentLearnings = learnedPatterns.slice(-20);
  
  // Group by pattern type and create adjustments
  recentLearnings.forEach(learning => {
    // Determine adjustment type based on instruction content
    let type: PromptAdjustment['type'] = 'add_rule';
    let priority: PromptAdjustment['priority'] = 'medium';
    
    if (learning.instruction.toLowerCase().includes('always') || 
        learning.instruction.toLowerCase().includes('never') ||
        learning.instruction.toLowerCase().includes('must')) {
      priority = 'high';
      type = 'emphasize_rule';
    }
    
    if (learning.instruction.toLowerCase().includes('example') ||
        learning.instruction.toLowerCase().includes('like this')) {
      type = 'add_example';
    }
    
    adjustments.push({
      type,
      rule: learning.instruction,
      priority,
      reason: `Learned from user correction: "${learning.learnedFrom.substring(0, 100)}"`,
    });
  });
  
  return adjustments;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();

    if (action === 'learn_from_conversation') {
      const { userMessage, previousAssistantResponse, conversationContext } = data;
      
      // Extract learning from user correction
      const learning = extractLearning(userMessage, previousAssistantResponse, conversationContext);
      
      if (learning) {
        // Check if similar learning already exists
        const existing = learnedPatterns.find(l => 
          l.instruction.toLowerCase() === learning.instruction.toLowerCase() ||
          (l.instruction.toLowerCase().includes(learning.instruction.toLowerCase().substring(0, 20)) &&
           learning.instruction.length > 20)
        );
        
        if (existing) {
          // Update existing learning
          existing.appliedCount = (existing.appliedCount || 0) + 1;
          existing.timestamp = new Date().toISOString();
          console.log('📚 Updated existing learning:', existing.instruction);
        } else {
          // Add new learning
          learnedPatterns.push(learning);
          console.log('🎓 New learning added:', learning.instruction);
          
          // Keep only last 50 learned patterns
          if (learnedPatterns.length > 50) {
            learnedPatterns.shift();
          }
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            learned: true,
            instruction: learning.instruction,
            totalLearnings: learnedPatterns.length,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          learned: false,
          message: 'No correction pattern detected',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'get_adjustments') {
      const adjustments = getPromptAdjustments();
      
      return new Response(
        JSON.stringify({
          adjustments,
          totalLearnings: learnedPatterns.length,
          recentLearnings: learnedPatterns.slice(-5).map(l => ({
            instruction: l.instruction,
            learnedFrom: l.learnedFrom.substring(0, 100),
            appliedCount: l.appliedCount,
          })),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'get_learnings') {
      return new Response(
        JSON.stringify({
          learnings: learnedPatterns,
          total: learnedPatterns.length,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'clear_learnings') {
      learnedPatterns.length = 0;
      return new Response(
        JSON.stringify({ success: true, message: 'All learnings cleared' }),
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
    console.error('Learning function error:', error);
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

