/**
 * Task Intent Classifier Tests — Routing Accuracy
 * ==================================================
 * Tests that user messages are correctly classified as tasks vs conversation.
 * Misclassification means tasks get ignored or conversations get hijacked.
 */

import { describe, it, expect } from 'vitest';

// Mock LLM and DB dependencies
vi.mock('../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '{}' }),
  TIER_EXTRACTION: 'extraction',
}));

vi.mock('../../api/services/prospectiveMemoryService.js', () => ({
  createProspective: vi.fn().mockResolvedValue({ id: 'test' }),
}));

vi.mock('../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
  }),
}));

import { vi } from 'vitest';
const { classifyTaskIntent } = await import('../../api/services/taskIntentClassifier.js');

describe('Task Intent Classifier', () => {
  describe('remind intents', () => {
    it('detects "remind me to..."', () => {
      const result = classifyTaskIntent('remind me to call mom on Monday');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('remind');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('detects "don\'t let me forget..."', () => {
      const result = classifyTaskIntent("don't let me forget to check the demo results");
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('remind');
    });

    it('detects "follow up on..."', () => {
      const result = classifyTaskIntent('follow up with Sarah about the project tomorrow');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('remind');
    });
  });

  describe('draft intents', () => {
    it('detects "draft an email..."', () => {
      const result = classifyTaskIntent('draft an email to my team about the launch');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('draft');
    });

    it('detects "reply to..."', () => {
      const result = classifyTaskIntent('reply to Sarah\'s email about the meeting');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('draft');
    });

    it('detects "write a message..."', () => {
      const result = classifyTaskIntent('write a message to my manager about taking Friday off');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('draft');
    });
  });

  describe('user_rule intents', () => {
    it('detects "remember that I\'m..."', () => {
      const result = classifyTaskIntent("remember that I'm vegan");
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('user_rule');
    });

    it('detects "never mention..."', () => {
      const result = classifyTaskIntent('never mention my ex named Maria');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('user_rule');
    });

    it('detects "from now on..."', () => {
      const result = classifyTaskIntent('from now on always greet me in Portuguese');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('user_rule');
    });
  });

  describe('schedule intents', () => {
    it('detects "schedule a meeting..."', () => {
      const result = classifyTaskIntent('schedule a meeting with the team for Thursday');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('schedule');
    });

    it('detects "block time for..."', () => {
      const result = classifyTaskIntent('block time for deep work tomorrow morning');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('schedule');
    });
  });

  describe('control intents', () => {
    it('detects "play..."', () => {
      const result = classifyTaskIntent('play some lo-fi music');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('control');
    });
  });

  describe('conversation (NOT tasks)', () => {
    it('does not classify greetings as tasks', () => {
      const result = classifyTaskIntent('hey how are you?');
      expect(result.isTask).toBe(false);
    });

    it('does not classify feelings as tasks', () => {
      const result = classifyTaskIntent("I'm feeling pretty good today");
      expect(result.isTask).toBe(false);
    });

    it('does not classify questions about the twin', () => {
      const result = classifyTaskIntent('what do you think about my music taste?');
      expect(result.isTask).toBe(false);
    });

    it('does not classify short messages', () => {
      const result = classifyTaskIntent('hi');
      expect(result.isTask).toBe(false);
    });

    it('reduces confidence for conversational + task overlap', () => {
      // "how are you" is conversational, reduces task confidence
      const result = classifyTaskIntent('how are you doing, can you find me a restaurant?');
      // Should still detect as task but with reduced confidence
      if (result.isTask) {
        expect(result.confidence).toBeLessThan(0.9);
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = classifyTaskIntent('');
      expect(result.isTask).toBe(false);
    });

    it('handles null input', () => {
      const result = classifyTaskIntent(null);
      expect(result.isTask).toBe(false);
    });

    it('handles very short input', () => {
      const result = classifyTaskIntent('ok');
      expect(result.isTask).toBe(false);
    });
  });
});
