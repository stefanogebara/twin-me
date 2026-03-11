import { describe, it, expect } from 'vitest';
import { shouldShowInterviewCTA } from '../../src/utils/shouldShowInterviewCTA';

describe('shouldShowInterviewCTA', () => {
  const base = {
    isDemoMode: false,
    interviewCompleted: false,
    interviewStatusLoaded: true,
    connectedPlatformCount: 0,
    totalMemories: 0,
  };

  it('shows CTA for brand-new users', () => {
    expect(shouldShowInterviewCTA(base)).toBe(true);
  });

  it('hides CTA in demo mode', () => {
    expect(shouldShowInterviewCTA({ ...base, isDemoMode: true })).toBe(false);
  });

  it('hides CTA when interview is completed', () => {
    expect(shouldShowInterviewCTA({ ...base, interviewCompleted: true })).toBe(false);
  });

  it('hides CTA before interview status is loaded', () => {
    expect(shouldShowInterviewCTA({ ...base, interviewStatusLoaded: false })).toBe(false);
  });

  // H5 BUG: This is the exact scenario from the audit —
  // 10 platforms connected + 16K memories but CTA still shows
  it('hides CTA for mature users with many platforms (H5 bug)', () => {
    expect(shouldShowInterviewCTA({
      ...base,
      connectedPlatformCount: 10,
      totalMemories: 16000,
    })).toBe(false);
  });

  it('hides CTA when 3+ platforms connected even without interview', () => {
    expect(shouldShowInterviewCTA({
      ...base,
      connectedPlatformCount: 3,
    })).toBe(false);
  });

  it('hides CTA when 1000+ memories even without interview', () => {
    expect(shouldShowInterviewCTA({
      ...base,
      totalMemories: 1000,
    })).toBe(false);
  });

  it('shows CTA with 2 platforms and 500 memories (still onboarding)', () => {
    expect(shouldShowInterviewCTA({
      ...base,
      connectedPlatformCount: 2,
      totalMemories: 500,
    })).toBe(true);
  });
});
