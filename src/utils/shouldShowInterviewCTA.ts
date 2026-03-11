/**
 * Determines whether the interview CTA should show on the Dashboard.
 *
 * Rules:
 * - Never show in demo mode
 * - Never show if interview is already completed
 * - Never show if user is "mature" (3+ connected platforms OR 1000+ memories)
 * - Show otherwise (new users who haven't completed the interview)
 */
export function shouldShowInterviewCTA({
  isDemoMode,
  interviewCompleted,
  interviewStatusLoaded,
  connectedPlatformCount,
  totalMemories,
}: {
  isDemoMode: boolean;
  interviewCompleted: boolean;
  interviewStatusLoaded: boolean;
  connectedPlatformCount: number;
  totalMemories: number;
}): boolean {
  if (isDemoMode) return false;
  if (!interviewStatusLoaded) return false;
  if (interviewCompleted) return false;

  // Mature users don't need the interview prompt —
  // they've already provided enough signal through platform data
  const MATURE_PLATFORM_THRESHOLD = 3;
  const MATURE_MEMORY_THRESHOLD = 1000;

  if (connectedPlatformCount >= MATURE_PLATFORM_THRESHOLD) return false;
  if (totalMemories >= MATURE_MEMORY_THRESHOLD) return false;

  return true;
}
