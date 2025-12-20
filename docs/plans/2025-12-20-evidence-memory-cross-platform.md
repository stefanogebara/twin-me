# Evidence, Memory & Cross-Platform Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance Twin AI Learn insight pages with evidence-based reasoning, life event inference from calendar, and cross-platform context blending through a persistent "Twin Memory" system.

**Architecture:** The system infers life events (vacations, conferences) from calendar event titles using multilingual keyword detection, stores them in a `life_context` table, and includes this context in all Claude reflection prompts. Evidence for each observation is returned from the API and displayed in a collapsible UI component.

**Tech Stack:** Node.js/Express backend, PostgreSQL (Supabase), Claude Sonnet 4.5 for reflections, React/TypeScript frontend with Radix UI Collapsible

---

## Task 1: Create Life Context Database Migration

**Files:**
- Create: `database/supabase/migrations/20251220_life_context.sql`

**Step 1: Write the migration SQL**

```sql
-- Life Context Table
-- Stores inferred and user-provided life events that inform all twin reflections

CREATE TABLE IF NOT EXISTS life_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN (
    'vacation', 'conference', 'training', 'holiday',
    'work_project', 'health_event', 'travel', 'sabbatical'
  )),
  title TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  source TEXT NOT NULL CHECK (source IN ('calendar_inference', 'user_input', 'pattern_detection')),
  source_event_id TEXT,
  source_platform TEXT DEFAULT 'google_calendar',
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  detected_language TEXT,
  original_title TEXT,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_life_context_user_active
  ON life_context(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_life_context_dates
  ON life_context(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_life_context_type
  ON life_context(user_id, context_type);

-- Function to get active life context for a user
CREATE OR REPLACE FUNCTION get_active_life_context(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  context_type TEXT,
  title TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  days_remaining INTEGER,
  confidence DECIMAL(3,2),
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id,
    lc.context_type,
    lc.title,
    lc.start_date,
    lc.end_date,
    CASE
      WHEN lc.end_date IS NOT NULL
      THEN EXTRACT(DAY FROM lc.end_date - NOW())::INTEGER
      ELSE NULL
    END as days_remaining,
    lc.confidence,
    lc.metadata
  FROM life_context lc
  WHERE lc.user_id = p_user_id
    AND lc.is_active = true
    AND lc.is_dismissed = false
    AND lc.start_date <= NOW()
    AND (lc.end_date IS NULL OR lc.end_date >= NOW())
  ORDER BY lc.start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming life context
CREATE OR REPLACE FUNCTION get_upcoming_life_context(p_user_id UUID, p_days_ahead INTEGER DEFAULT 14)
RETURNS TABLE (
  id UUID,
  context_type TEXT,
  title TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  days_until INTEGER,
  confidence DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id,
    lc.context_type,
    lc.title,
    lc.start_date,
    lc.end_date,
    EXTRACT(DAY FROM lc.start_date - NOW())::INTEGER as days_until,
    lc.confidence
  FROM life_context lc
  WHERE lc.user_id = p_user_id
    AND lc.is_active = true
    AND lc.is_dismissed = false
    AND lc.start_date > NOW()
    AND lc.start_date <= NOW() + (p_days_ahead || ' days')::INTERVAL
  ORDER BY lc.start_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security
ALTER TABLE life_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own life context"
  ON life_context FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own life context"
  ON life_context FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own life context"
  ON life_context FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own life context"
  ON life_context FOR DELETE
  USING (user_id = auth.uid());

-- Updated trigger
CREATE TRIGGER update_life_context_updated_at
  BEFORE UPDATE ON life_context
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Apply migration to Supabase**

Run: Apply via Supabase dashboard SQL editor or CLI
Expected: Table `life_context` created with indexes and RLS policies

**Step 3: Commit**

```bash
git add database/supabase/migrations/20251220_life_context.sql
git commit -m "feat: add life_context table for storing inferred life events"
```

---

## Task 2: Create Life Event Inference Service

**Files:**
- Create: `api/services/lifeEventInferenceService.js`

**Step 1: Write the life event inference service**

```javascript
/**
 * Life Event Inference Service
 *
 * Analyzes calendar events and other platform data to infer significant
 * life events (vacation, conferences, training periods, etc.) that should
 * inform all twin reflections and recommendations.
 *
 * Key Features:
 * - Multilingual vacation detection (Férias, Vacaciones, Congé, etc.)
 * - Multi-day event detection for extended contexts
 * - Conference/travel detection
 * - Training period detection
 * - Auto-storage with confidence scoring
 */

import { supabaseAdmin } from './database.js';

class LifeEventInferenceService {
  constructor() {
    // Multilingual vacation keywords (Portuguese, Spanish, French, Dutch, Italian, German, English)
    this.vacationKeywords = /férias|vacaciones|congé|vakantie|ferie|urlaub|vacation|holidays?|pto|time\s*off|day\s*off|sabbatical|leave|break|off\s*work/i;

    // Conference/travel keywords
    this.conferenceKeywords = /conference|summit|convention|expo|trade\s*show|symposium|congress|forum|retreat|offsite|business\s*trip/i;

    // Training/fitness period keywords
    this.trainingKeywords = /training\s*(camp|program|period)|marathon\s*prep|race\s*prep|competition\s*prep|tournament|championship/i;

    // Holiday keywords (specific named holidays)
    this.holidayKeywords = /christmas|natal|navidad|noël|new\s*year|ano\s*novo|thanksgiving|easter|páscoa|hanukkah|diwali|eid/i;

    // Language detection patterns
    this.languagePatterns = {
      'pt': /férias|natal|ano\s*novo|páscoa|folga/i,
      'es': /vacaciones|navidad|año\s*nuevo|semana\s*santa/i,
      'fr': /congé|vacances|noël|pâques/i,
      'nl': /vakantie|kerst|nieuwjaar/i,
      'it': /ferie|vacanze|natale|capodanno/i,
      'de': /urlaub|ferien|weihnachten|neujahr/i,
      'en': /vacation|holiday|christmas|new\s*year/i
    };
  }

  detectLanguage(text) {
    if (!text) return 'en';
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.test(text)) return lang;
    }
    return 'en';
  }

  detectVacation(events) {
    const vacationEvents = [];
    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.vacationKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        const durationDays = endDate
          ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
          : 1;

        let confidence = 0.7;
        if (durationDays >= 7) confidence = 0.95;
        else if (durationDays >= 3) confidence = 0.85;

        if (/férias|vacation|pto|holidays/i.test(title)) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }

        vacationEvents.push({
          type: 'vacation',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          durationDays,
          confidence,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            hasDescription: !!description,
            isAllDay: !!(event.start?.date || event.all_day),
            attendeeCount: event.attendees?.length || 0
          }
        });
      }
    }
    return this.mergeOverlappingEvents(vacationEvents);
  }

  detectConference(events) {
    const conferenceEvents = [];
    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.conferenceKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        conferenceEvents.push({
          type: 'conference',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.8,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            location: event.location,
            isTravel: /travel|trip|flight|hotel/i.test(combined)
          }
        });
      }
    }
    return conferenceEvents;
  }

  detectTrainingPeriod(events) {
    const trainingEvents = [];
    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.trainingKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        trainingEvents.push({
          type: 'training',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.75,
          sourceEventId: event.id || event.google_event_id,
          metadata: {
            isCompetition: /competition|tournament|championship|race|marathon/i.test(combined)
          }
        });
      }
    }
    return trainingEvents;
  }

  detectHoliday(events) {
    const holidayEvents = [];
    for (const event of events) {
      const title = event.title || event.summary || '';
      const description = event.description || '';
      const combined = `${title} ${description}`;

      if (this.holidayKeywords.test(combined)) {
        const startDate = new Date(event.start_time || event.start?.dateTime || event.start?.date);
        const endDate = event.end_time || event.end?.dateTime || event.end?.date
          ? new Date(event.end_time || event.end?.dateTime || event.end?.date)
          : null;

        holidayEvents.push({
          type: 'holiday',
          title: title,
          originalTitle: title,
          startDate,
          endDate,
          confidence: 0.9,
          sourceEventId: event.id || event.google_event_id,
          detectedLanguage: this.detectLanguage(combined),
          metadata: {
            holidayType: this.identifyHolidayType(combined)
          }
        });
      }
    }
    return holidayEvents;
  }

  identifyHolidayType(text) {
    if (/christmas|natal|navidad|noël|weihnachten|kerst/i.test(text)) return 'christmas';
    if (/new\s*year|ano\s*novo|año\s*nuevo|nieuwjaar|neujahr/i.test(text)) return 'new_year';
    if (/thanksgiving/i.test(text)) return 'thanksgiving';
    if (/easter|páscoa|pâques|pasqua/i.test(text)) return 'easter';
    return 'other';
  }

  mergeOverlappingEvents(events) {
    if (events.length <= 1) return events;
    events.sort((a, b) => a.startDate - b.startDate);
    const merged = [];
    let current = events[0];

    for (let i = 1; i < events.length; i++) {
      const next = events[i];
      const gap = (next.startDate - (current.endDate || current.startDate)) / (1000 * 60 * 60 * 24);

      if (gap <= 1) {
        current = {
          ...current,
          endDate: new Date(Math.max(
            current.endDate?.getTime() || current.startDate.getTime(),
            next.endDate?.getTime() || next.startDate.getTime()
          )),
          durationDays: Math.ceil(
            (Math.max(
              current.endDate?.getTime() || current.startDate.getTime(),
              next.endDate?.getTime() || next.startDate.getTime()
            ) - current.startDate.getTime()) / (1000 * 60 * 60 * 24)
          ),
          confidence: Math.max(current.confidence, next.confidence),
          title: current.title,
          metadata: {
            ...current.metadata,
            mergedCount: (current.metadata?.mergedCount || 1) + 1
          }
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  }

  async inferLifeEvents(userId, events) {
    console.log(`[Life Event Inference] Analyzing ${events.length} events for user ${userId}`);
    const inferredEvents = [];

    const vacations = this.detectVacation(events);
    const conferences = this.detectConference(events);
    const training = this.detectTrainingPeriod(events);
    const holidays = this.detectHoliday(events);

    inferredEvents.push(...vacations, ...conferences, ...training, ...holidays);

    console.log(`[Life Event Inference] Found ${inferredEvents.length} life events:`, {
      vacations: vacations.length,
      conferences: conferences.length,
      training: training.length,
      holidays: holidays.length
    });

    return inferredEvents;
  }

  async inferAndStoreLifeEvents(userId, events) {
    const inferredEvents = await this.inferLifeEvents(userId, events);
    if (inferredEvents.length === 0) return [];

    const storedEvents = [];
    for (const event of inferredEvents) {
      try {
        const { data: existing } = await supabaseAdmin
          .from('life_context')
          .select('id')
          .eq('user_id', userId)
          .eq('context_type', event.type)
          .eq('source_event_id', event.sourceEventId)
          .single();

        if (existing) {
          console.log(`[Life Event Inference] Event already exists, skipping: ${event.title}`);
          continue;
        }

        const { data, error } = await supabaseAdmin
          .from('life_context')
          .insert({
            user_id: userId,
            context_type: event.type,
            title: event.title,
            start_date: event.startDate.toISOString(),
            end_date: event.endDate?.toISOString(),
            source: 'calendar_inference',
            source_event_id: event.sourceEventId,
            source_platform: 'google_calendar',
            confidence: event.confidence,
            detected_language: event.detectedLanguage,
            original_title: event.originalTitle,
            metadata: event.metadata,
            is_active: true
          })
          .select()
          .single();

        if (error) {
          console.error(`[Life Event Inference] Failed to store event: ${error.message}`);
        } else {
          console.log(`[Life Event Inference] Stored: ${event.type} - "${event.title}" (confidence: ${event.confidence})`);
          storedEvents.push(data);
        }
      } catch (err) {
        console.error(`[Life Event Inference] Error processing event: ${err.message}`);
      }
    }
    return storedEvents;
  }

  async getActiveLifeContext(userId) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('life_context')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_dismissed', false)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('start_date', { ascending: false });

    if (error) {
      console.error(`[Life Event Inference] Failed to get active context: ${error.message}`);
      return [];
    }
    return data || [];
  }

  async getUpcomingLifeContext(userId, daysAhead = 14) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from('life_context')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_dismissed', false)
      .gt('start_date', now.toISOString())
      .lte('start_date', futureDate.toISOString())
      .order('start_date', { ascending: true });

    if (error) {
      console.error(`[Life Event Inference] Failed to get upcoming context: ${error.message}`);
      return [];
    }
    return data || [];
  }

  async buildLifeContextSummary(userId) {
    const [activeContext, upcomingContext] = await Promise.all([
      this.getActiveLifeContext(userId),
      this.getUpcomingLifeContext(userId, 7)
    ]);

    const summary = {
      isOnVacation: activeContext.some(c => c.context_type === 'vacation'),
      isAtConference: activeContext.some(c => c.context_type === 'conference'),
      isInTraining: activeContext.some(c => c.context_type === 'training'),
      isHoliday: activeContext.some(c => c.context_type === 'holiday'),
      activeEvents: activeContext.map(c => ({
        type: c.context_type,
        title: c.title,
        startDate: c.start_date,
        endDate: c.end_date,
        daysRemaining: c.end_date
          ? Math.ceil((new Date(c.end_date) - new Date()) / (1000 * 60 * 60 * 24))
          : null
      })),
      upcomingEvents: upcomingContext.map(c => ({
        type: c.context_type,
        title: c.title,
        startDate: c.start_date,
        daysUntil: Math.ceil((new Date(c.start_date) - new Date()) / (1000 * 60 * 60 * 24))
      }))
    };

    summary.promptSummary = this.buildPromptSummary(summary);
    return summary;
  }

  buildPromptSummary(summary) {
    const parts = [];

    if (summary.isOnVacation) {
      const vacation = summary.activeEvents.find(e => e.type === 'vacation');
      if (vacation) {
        parts.push(`Currently on vacation: "${vacation.title}"${vacation.daysRemaining ? ` (${vacation.daysRemaining} days remaining)` : ''}`);
      }
    }

    if (summary.isAtConference) {
      const conference = summary.activeEvents.find(e => e.type === 'conference');
      if (conference) {
        parts.push(`At conference: "${conference.title}"`);
      }
    }

    if (summary.isInTraining) {
      const training = summary.activeEvents.find(e => e.type === 'training');
      if (training) {
        parts.push(`In training period: "${training.title}"`);
      }
    }

    if (summary.upcomingEvents.length > 0) {
      const upcoming = summary.upcomingEvents[0];
      parts.push(`Upcoming: ${upcoming.type} "${upcoming.title}" in ${upcoming.daysUntil} days`);
    }

    return parts.length > 0 ? parts.join('. ') : 'No significant life events detected.';
  }
}

export const lifeEventInferenceService = new LifeEventInferenceService();
export default lifeEventInferenceService;
```

**Step 2: Commit**

```bash
git add api/services/lifeEventInferenceService.js
git commit -m "feat: add life event inference service with multilingual detection"
```

---

## Task 3: Update User Context Aggregator

**Files:**
- Modify: `api/services/userContextAggregator.js`

**Step 1: Add import for lifeEventInferenceService**

At the top of the file, add:
```javascript
import { lifeEventInferenceService } from './lifeEventInferenceService.js';
```

**Step 2: Add getLifeContext method**

Add this method to the class:
```javascript
async getLifeContext(userId) {
  try {
    const lifeContextSummary = await lifeEventInferenceService.buildLifeContextSummary(userId);
    return {
      connected: true,
      isOnVacation: lifeContextSummary.isOnVacation,
      isAtConference: lifeContextSummary.isAtConference,
      isInTraining: lifeContextSummary.isInTraining,
      isHoliday: lifeContextSummary.isHoliday,
      currentStatus: lifeContextSummary.isOnVacation ? 'vacation' :
                     lifeContextSummary.isAtConference ? 'conference' :
                     lifeContextSummary.isInTraining ? 'training' : 'normal',
      activeEvents: lifeContextSummary.activeEvents,
      upcomingEvents: lifeContextSummary.upcomingEvents,
      promptSummary: lifeContextSummary.promptSummary
    };
  } catch (error) {
    console.error('[Context Aggregator] Failed to get life context:', error.message);
    return { connected: false, currentStatus: 'unknown' };
  }
}
```

**Step 3: Update aggregateUserContext to include life context**

Add life context to parallel fetch in `aggregateUserContext`:
```javascript
const [calendarContext, spotifyContext, whoopContext, lifeContext] = await Promise.all([
  this.getCalendarContext(userId),
  this.getSpotifyContext(userId),
  this.getWhoopContext(userId),
  this.getLifeContext(userId)
]);

return {
  calendar: calendarContext,
  spotify: spotifyContext,
  whoop: whoopContext,
  lifeContext: lifeContext,
  aggregatedAt: new Date().toISOString()
};
```

**Step 4: Update generateContextSummary to include life status**

Add to the summary generation:
```javascript
if (context.lifeContext?.isOnVacation) {
  parts.push(`Life Status: On vacation`);
} else if (context.lifeContext?.isAtConference) {
  parts.push(`Life Status: At conference`);
}
```

**Step 5: Commit**

```bash
git add api/services/userContextAggregator.js
git commit -m "feat: add life context to user context aggregator"
```

---

## Task 4: Integrate Auto-Inference on Calendar Sync

**Files:**
- Modify: `api/routes/calendar-oauth.js`

**Step 1: Add import for lifeEventInferenceService**

At the top of the file:
```javascript
import { lifeEventInferenceService } from '../services/lifeEventInferenceService.js';
```

**Step 2: Add auto-inference after calendar sync**

After storing calendar events in the sync endpoint, add:
```javascript
// After storing events - AUTO-STORE life events
let inferredLifeEvents = [];
try {
  inferredLifeEvents = await lifeEventInferenceService.inferAndStoreLifeEvents(userId, events);
  if (inferredLifeEvents.length > 0) {
    console.log(`[Calendar Sync] Auto-stored ${inferredLifeEvents.length} life events for user ${userId}`);
  }
} catch (inferenceError) {
  console.warn('[Calendar Sync] Life event inference failed:', inferenceError.message);
}

// Include in response
res.json({
  success: true,
  eventsStored: storedEvents.length,
  inferredLifeEvents: inferredLifeEvents.length,
  message: `Synced ${storedEvents.length} events, detected ${inferredLifeEvents.length} life events`
});
```

**Step 3: Commit**

```bash
git add api/routes/calendar-oauth.js
git commit -m "feat: auto-infer life events on calendar sync"
```

---

## Task 5: Update Reflection Service with Evidence + Life Context

**Files:**
- Modify: `api/services/platformReflectionService.js`

**Step 1: Update getPromptForPlatform to accept lifeContext**

Modify signature and add life context to prompts:
```javascript
getPromptForPlatform(platform, data, lifeContext = null) {
  const lifeContextPrompt = lifeContext?.promptSummary && lifeContext.promptSummary !== 'No significant life events detected.'
    ? `\n\nIMPORTANT LIFE CONTEXT:\n${lifeContext.promptSummary}\n\nConsider how this life context might be affecting their patterns.`
    : '';

  // Add to each platform prompt template
}
```

**Step 2: Update Claude prompt to request evidence**

Update the JSON structure in the prompt:
```javascript
You MUST respond with valid JSON in this exact format:
{
  "reflection": "Your 2-4 sentence conversational observation...",
  "themes": ["theme1", "theme2"],
  "confidence": "high" | "medium" | "low",
  "evidence": [
    {
      "observation": "A specific claim from your reflection",
      "dataPoints": ["Supporting data point 1", "Supporting data point 2", "Supporting data point 3"],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "patterns": [
    { "text": "A recurring pattern you've noticed", "frequency": "often" | "sometimes" | "noticed" }
  ]
}
```

**Step 3: Update formatResponse to return evidence and crossPlatformContext**

```javascript
formatResponse(reflection, history, lifeContext = null) {
  const reflectionData = { /* existing */ };

  const evidence = (reflectionData.evidence || []).map((e, i) => ({
    id: `evidence-${i}`,
    observation: e.observation,
    dataPoints: e.dataPoints || [],
    confidence: e.confidence || 'medium'
  }));

  const crossPlatformContext = lifeContext ? {
    lifeContext: {
      isOnVacation: lifeContext.isOnVacation,
      vacationTitle: lifeContext.activeEvents?.find(e => e.type === 'vacation')?.title,
      daysRemaining: lifeContext.activeEvents?.find(e => e.type === 'vacation')?.daysRemaining
    }
  } : null;

  return {
    success: true,
    reflection: reflectionData,
    evidence,
    crossPlatformContext,
    patterns: /* existing */,
    history: /* existing */
  };
}
```

**Step 4: Update storeReflection to include evidence in data_snapshot**

```javascript
const dataSnapshot = {
  rawDataUsed: data,
  evidence: parsedReflection.evidence || [],
  crossPlatformContext: lifeContext ? {
    lifeStatus: lifeContext.currentStatus,
    promptSummary: lifeContext.promptSummary
  } : null,
  generatedAt: new Date().toISOString()
};
```

**Step 5: Commit**

```bash
git add api/services/platformReflectionService.js
git commit -m "feat: add evidence and life context to reflection generation"
```

---

## Task 6: Create Frontend Evidence Section Component

**Files:**
- Create: `src/pages/insights/components/EvidenceSection.tsx`

**Step 1: Write the EvidenceSection component**

```tsx
/**
 * EvidenceSection Component
 *
 * Collapsible "How I noticed this" section that shows the evidence
 * and reasoning behind the twin's observations.
 */

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ChevronRight, ChevronDown, Eye, Plane, Activity, Calendar } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface EvidenceSectionProps {
  evidence: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext | null;
  className?: string;
}

export const EvidenceSection: React.FC<EvidenceSectionProps> = ({
  evidence,
  crossPlatformContext,
  className = ''
}) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#44403c',
    textMuted: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    bgSubtle: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    confidenceHigh: theme === 'dark' ? '#4ade80' : '#22c55e',
    confidenceMedium: theme === 'dark' ? '#fbbf24' : '#f59e0b',
    confidenceLow: theme === 'dark' ? '#94a3b8' : '#64748b'
  };

  if (!evidence || evidence.length === 0) return null;

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return colors.confidenceHigh;
      case 'medium': return colors.confidenceMedium;
      default: return colors.confidenceLow;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger
        className="flex items-center gap-2 text-sm transition-colors hover:opacity-80 w-full justify-start py-2"
        style={{ color: colors.textMuted }}
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Eye className="h-4 w-4" />
        <span>How I noticed this</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div
          className="rounded-xl p-4 space-y-4"
          style={{ backgroundColor: colors.bgSubtle, border: `1px solid ${colors.border}` }}
        >
          {/* Cross-Platform Context Badges */}
          {crossPlatformContext?.lifeContext?.isOnVacation && (
            <div className="flex flex-wrap gap-2 pb-3 border-b" style={{ borderColor: colors.border }}>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
                  color: theme === 'dark' ? '#fbbf24' : '#d97706'
                }}
              >
                <Plane className="h-3 w-3" />
                {crossPlatformContext.lifeContext.vacationTitle || 'On Vacation'}
              </span>
            </div>
          )}

          {/* Evidence Items */}
          <div className="space-y-4">
            {evidence.map((item, index) => (
              <div key={item.id || index}>
                <div className="flex items-start gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: getConfidenceColor(item.confidence) }}
                  />
                  <p className="text-sm font-medium" style={{ color: colors.text }}>
                    {item.observation}
                  </p>
                </div>
                {item.dataPoints && item.dataPoints.length > 0 && (
                  <ul className="mt-2 ml-3.5 space-y-1">
                    {item.dataPoints.map((dp, dpIndex) => (
                      <li key={dpIndex} className="text-xs flex items-start gap-2" style={{ color: colors.textSecondary }}>
                        <span className="opacity-50">-</span>
                        {dp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Confidence Legend */}
          <div className="flex items-center gap-4 pt-3 border-t text-xs" style={{ borderColor: colors.border, color: colors.textMuted }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.confidenceHigh }} />
              High confidence
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.confidenceMedium }} />
              Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.confidenceLow }} />
              Emerging pattern
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default EvidenceSection;
```

**Step 2: Commit**

```bash
git add src/pages/insights/components/EvidenceSection.tsx
git commit -m "feat: add collapsible evidence section component"
```

---

## Task 7: Update Insight Pages with Evidence Display

**Files:**
- Modify: `src/pages/insights/SpotifyInsightsPage.tsx`
- Modify: `src/pages/insights/CalendarInsightsPage.tsx`
- Modify: `src/pages/insights/WhoopInsightsPage.tsx`

**Step 1: Add EvidenceSection import to each file**

```tsx
import { EvidenceSection } from './components/EvidenceSection';
```

**Step 2: Update InsightsResponse interface in each file**

```tsx
interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  error?: string;
}
```

**Step 3: Add EvidenceSection after TwinReflection in each file**

```tsx
{/* Primary Reflection */}
{insights?.reflection && (
  <div className="mb-8">
    <TwinReflection
      reflection={insights.reflection.text}
      timestamp={insights.reflection.generatedAt}
      confidence={insights.reflection.confidence}
      isNew={true}
    />
    {/* Evidence Section - Collapsible */}
    {insights?.evidence && insights.evidence.length > 0 && (
      <EvidenceSection
        evidence={insights.evidence}
        crossPlatformContext={insights.crossPlatformContext}
        className="mt-4"
      />
    )}
  </div>
)}
```

**Step 4: Verify build passes**

Run: `npm run build`
Expected: Build completes without errors

**Step 5: Commit**

```bash
git add src/pages/insights/SpotifyInsightsPage.tsx src/pages/insights/CalendarInsightsPage.tsx src/pages/insights/WhoopInsightsPage.tsx
git commit -m "feat: add evidence display to all insight pages"
```

---

## Testing Checklist

1. **Life Event Detection**
   - [ ] Calendar sync detects "Férias" as vacation
   - [ ] Multi-day events get higher confidence scores
   - [ ] Life events stored in `life_context` table

2. **Evidence Generation**
   - [ ] Claude returns evidence array in response
   - [ ] Evidence stored in `data_snapshot` JSONB

3. **Frontend Display**
   - [ ] "How I noticed this" collapsible appears
   - [ ] Evidence expands on click
   - [ ] Cross-platform badges show vacation status

4. **Cross-Platform Context**
   - [ ] Spotify insights mention vacation if active
   - [ ] Calendar insights show life event detection
   - [ ] Whoop insights factor in life context

---

**Plan complete and saved to `docs/plans/2025-12-20-evidence-memory-cross-platform.md`.**

**Note:** This plan documents the implementation that was already completed. All tasks are done and the build passes successfully.

Would you like me to:
1. **Verify the implementation** - Test the running application to confirm everything works
2. **Create additional tests** - Add unit/integration tests for the new services
3. **Something else** - Specify what you need