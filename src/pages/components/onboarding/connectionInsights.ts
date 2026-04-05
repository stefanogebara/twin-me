/**
 * connectionInsights — Contextual insight messages shown in toasts
 * when a platform is freshly connected, giving users an immediate
 * sense of value instead of a generic "Connected" message.
 */

export const CONNECTION_INSIGHT_MESSAGES: Record<string, string> = {
  spotify: "Your music taste is being analyzed — mood patterns incoming",
  google_calendar: "Scanning your schedule to understand your rhythms",
  youtube: "Discovering what you watch when no one's watching",
  discord: "Mapping your community interests and social energy",
  google_gmail: "Learning your communication style from email patterns",
  reddit: "Exploring the communities that reveal your real interests",
  github: "Reading your code to understand how you think",
  linkedin: "Tracing your career trajectory and professional identity",
  whoop: "Connecting your recovery data to your daily patterns",
  twitch: "Finding your gaming identity and viewing habits",
};
