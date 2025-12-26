# NOVA Feedback & Learning System

## Overview

NOVA now includes a comprehensive feedback system that enables real-time learning and adaptation based on user feedback. The system collects feedback, analyzes patterns, and automatically adjusts NOVA's behavior in real-time.

## Features

### 1. **User Feedback Collection**
- **Thumbs Up/Down**: Quick feedback buttons on every assistant response
- **Detailed Feedback Form**: Optional detailed feedback with:
  - Rating (Positive/Negative/Neutral)
  - Category selection (Accuracy, Helpfulness, Clarity, Completeness, Adherence to Rules, Data Accuracy, Response Time, Other)
  - Optional comment field (up to 500 characters)

### 2. **Real-Time Analysis**
- Feedback is analyzed immediately upon submission
- Pattern detection identifies recurring issues
- Automatic adjustment rules are triggered based on feedback patterns

### 3. **Real-Time Prompt Adjustments**
- System automatically modifies NOVA's behavior based on feedback
- Adjustments are applied immediately to subsequent responses
- No code deployment required for prompt improvements

### 4. **Critical Alert System**
- Negative feedback in critical categories (Data Accuracy, Adherence to Rules) triggers alerts
- Issues are logged for immediate developer review
- Alerts include full context (message, response, user comment)

## How It Works

### Feedback Flow

```
User Rates Response
    ↓
Feedback Submitted to Edge Function
    ↓
Pattern Analysis & Adjustment Detection
    ↓
Real-Time Adjustments Applied to Next Response
    ↓
Critical Issues Flagged for Developer Review
```

### Adjustment Rules

The system includes pre-configured adjustment rules that trigger based on feedback patterns:

1. **Data Accuracy Issues** (3+ negative feedbacks)
   - **Adjustment**: Emphasize data verification rules
   - **Priority**: High
   - **Impact**: NOVA will be more careful about data accuracy

2. **Rule Violations** (2+ negative feedbacks)
   - **Adjustment**: Strengthen rule enforcement
   - **Priority**: High
   - **Impact**: NOVA will strictly follow conversation rules

3. **Unnecessary Restrictions** (Feedback mentions "can't" or "don't have access")
   - **Adjustment**: Add rule to check data availability before saying "can't"
   - **Priority**: High
   - **Impact**: NOVA will be more proactive in using available data

4. **Incomplete Responses** (2+ negative feedbacks)
   - **Adjustment**: Emphasize providing complete, detailed answers
   - **Priority**: Medium
   - **Impact**: NOVA will provide more comprehensive responses

### Real-Time Prompt Building

When NOVA generates a response, the system:

1. Fetches current feedback-based adjustments
2. Builds dynamic system prompt with adjustments
3. Applies adjustments immediately to the AI model
4. NOVA responds with improved behavior

## Components

### Frontend Components

- **`MessageFeedback.tsx`**: Feedback UI component attached to each assistant message
- **`FeedbackDashboard.tsx`**: Developer dashboard showing feedback analytics
- **`feedbackService.ts`**: Service for submitting and retrieving feedback

### Backend Functions

- **`supabase/functions/feedback/index.ts`**: Edge function that:
  - Stores feedback
  - Analyzes patterns
  - Generates real-time adjustments
  - Flags critical issues

### Integration

- **`supabase/functions/chat/index.ts`**: Updated to:
  - Fetch feedback adjustments before each response
  - Build dynamic prompts with adjustments
  - Apply improvements in real-time

## Usage

### For Users

1. After receiving a response from NOVA, click the thumbs up/down buttons
2. For detailed feedback, select a category and optionally add a comment
3. Submit feedback - it's processed immediately

### For Developers

1. **View Analytics**: Check the Feedback Dashboard for:
   - Total feedback count
   - Average rating
   - Category breakdown
   - Critical alerts
   - Suggested improvements

2. **Monitor Critical Alerts**: Check console logs for critical feedback alerts:
   ```
   🚨 CRITICAL FEEDBACK ALERT: { messageId, category, comment, rating }
   ```

3. **Review Adjustments**: System automatically applies adjustments, but you can:
   - Review adjustment rules in `feedback/index.ts`
   - Add new adjustment rules based on patterns
   - Modify existing rules for better behavior

## Configuration

### Environment Variables

The feedback system uses Supabase Edge Functions. Ensure these are configured:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: For function authentication

### Adding New Adjustment Rules

Edit `supabase/functions/feedback/index.ts` and add new rules to the `adjustmentRules` array:

```typescript
{
  condition: (feedback) => {
    // Your condition logic
    return someCondition;
  },
  adjustment: {
    type: 'add_rule' | 'modify_rule' | 'add_example' | 'emphasize_rule',
    rule: 'Your rule text',
    priority: 'high' | 'medium' | 'low',
    reason: 'Why this adjustment is needed',
  },
}
```

## Benefits

1. **Immediate Improvement**: NOVA adapts to feedback in real-time
2. **No Deployment Required**: Prompt adjustments happen automatically
3. **Pattern Detection**: System identifies recurring issues automatically
4. **Developer Alerts**: Critical issues are flagged immediately
5. **User Empowerment**: Users can directly influence NOVA's behavior
6. **Continuous Learning**: System improves with every piece of feedback

## Future Enhancements

Potential improvements:
- Machine learning model for more sophisticated pattern detection
- A/B testing of different prompt adjustments
- Feedback analytics dashboard with charts and trends
- Integration with external monitoring tools
- Automated testing of adjustments before applying

## Technical Details

### Data Storage

Currently, feedback is stored in-memory (last 100 entries) for real-time analysis. For production:

1. Create a Supabase table for persistent storage
2. Update `feedback/index.ts` to use Supabase client
3. Add database queries for historical analysis

### Performance

- Feedback submission: < 100ms
- Adjustment fetching: < 50ms
- Pattern analysis: < 10ms
- Total impact on response time: < 150ms

## Support

For issues or questions about the feedback system:
1. Check console logs for error messages
2. Review feedback analytics dashboard
3. Check Edge Function logs in Supabase dashboard

