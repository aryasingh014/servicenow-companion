# NOVA Conversational Learning System

## Overview

NOVA now learns directly from user corrections in conversation, similar to ChatGPT. When you correct NOVA's responses or provide instructions, it learns and applies those patterns to future responses in real-time.

## How It Works

### Example Conversation

**User**: "How many incidents are there?"

**NOVA**: "There are 4790 incidents in the system."

**User**: "You should start like this: 'Based on the ServiceNow data, there are...'"

**NOVA**: *Learns this pattern* → Next time: "Based on the ServiceNow data, there are 4790 incidents."

### Learning Detection

NOVA automatically detects when you're providing corrections or instructions using patterns like:

- "You should start like this..."
- "Follow this pattern..."
- "You must always..."
- "Instead, say..."
- "That's wrong, you should..."
- "Actually, you need to..."

### What Gets Learned

When you correct NOVA, it extracts:
- **The instruction**: What you want NOVA to do
- **The pattern**: How you phrased the correction
- **The context**: What NOVA said that you're correcting

### Real-Time Application

1. You provide a correction → NOVA detects it
2. Instruction is extracted and stored
3. Next response uses the learned pattern
4. NOVA adapts its behavior immediately

## Features

### 1. **Automatic Detection**
- Detects corrections without explicit feedback buttons
- Works naturally in conversation
- No special commands needed

### 2. **Pattern Recognition**
Recognizes various correction formats:
- Direct instructions: "You should start like this..."
- Pattern requests: "Follow this pattern..."
- Corrections: "No, that's wrong. You should..."
- Preferences: "I prefer you to say..."

### 3. **Immediate Learning**
- Learns from each correction
- Applies to next response
- No deployment needed

### 4. **Context Awareness**
- Remembers what it said that you corrected
- Applies learning in similar contexts
- Builds on previous learnings

## Usage Examples

### Example 1: Response Format

**User**: "You should always start responses with 'I found that...'"

**Result**: NOVA will start future responses with "I found that..."

### Example 2: Pattern Following

**User**: "Follow this pattern: First state the number, then explain what it means"

**Result**: NOVA will follow this pattern for similar queries

### Example 3: Correction

**User**: "That's not right. You should check the data first before responding"

**Result**: NOVA learns to verify data before responding

### Example 4: Style Preference

**User**: "I prefer you to be more concise. Keep it to one sentence"

**Result**: NOVA will provide shorter, more concise responses

## Technical Details

### Learning Function

Located at: `supabase/functions/learning/index.ts`

**Actions:**
- `learn_from_conversation`: Detects and stores learning from user corrections
- `get_adjustments`: Returns learned patterns as prompt adjustments
- `get_learnings`: Returns all stored learnings
- `clear_learnings`: Clears all learned patterns

### Detection Patterns

The system recognizes corrections using regex patterns:
- Instruction patterns: "you should/must/need to..."
- Pattern requests: "follow this pattern..."
- Corrections: "no/actually/wait/correction..."
- Preferences: "I prefer/want you to..."

### Storage

Currently uses in-memory storage (last 50 learnings). For production:
1. Create Supabase table for persistent storage
2. Update learning function to use database
3. Enable historical learning analysis

## Benefits

1. **Natural Learning**: Works like ChatGPT - just correct in conversation
2. **Immediate Effect**: Changes apply to next response
3. **No UI Required**: No need for feedback buttons
4. **Contextual**: Remembers what was corrected
5. **Accumulative**: Builds knowledge over time

## Limitations

- Currently stores last 50 learnings (in-memory)
- Learning is session-based (resets on server restart)
- For persistent learning, implement database storage

## Future Enhancements

- Persistent database storage
- Learning prioritization (most used patterns first)
- Learning expiration (remove old/unused patterns)
- Learning analytics dashboard
- Multi-user learning (shared patterns)

