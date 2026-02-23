/**
 * Demo Data Helpers
 * Shared helper functions and constant pools used across demo data modules
 */

// Randomization helper functions
export const randomInRange = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const randomFloat = (min: number, max: number, decimals: number = 1): number => {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
};

export const randomFromArray = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// Recovery label pools
export const RECOVERY_LABELS = ['Low', 'Moderate', 'Good', 'Optimal'] as const;
export const STRAIN_LABELS = ['Light', 'Moderate', 'High', 'Very High'] as const;
export const SLEEP_QUALITIES = ['Poor', 'Fair', 'Good', 'Excellent'] as const;
export const MOODS = ['focused', 'energetic', 'relaxed', 'creative', 'productive'] as const;

// Artist pools for variety
export const ARTIST_POOLS = [
  ['Tycho', 'Boards of Canada', 'Aphex Twin', 'Four Tet', 'ODESZA'],
  ['Khruangbin', 'Tame Impala', 'Glass Animals', 'MGMT', 'Unknown Mortal Orchestra'],
  ['Bonobo', 'Caribou', 'Jon Hopkins', 'Floating Points', 'Moderat'],
  ['Nils Frahm', 'Olafur Arnalds', 'Max Richter', 'Ludovico Einaudi', 'Kiasmos'],
];

// Track name pools for variety
export const TRACK_POOLS = [
  ['A Walk', 'Awake', 'Dive', 'Epoch', 'Coastal Brake'],
  ['The Less I Know The Better', 'Let It Happen', 'Borderline', 'Eventually', 'Feels Like We Only Go Backwards'],
  ['Kiara', 'Kerala', 'Sapphire', 'Flashlight', 'First Fires'],
  ['Says', 'Familiar', 'All Melody', 'My Friend the Forest', 'Spells'],
];

export const GENRE_POOLS = [
  ['Ambient', 'Electronic', 'Lo-fi', 'Indie', 'Jazz'],
  ['Psychedelic Rock', 'Alternative', 'Synthwave', 'Dream Pop', 'Shoegaze'],
  ['Classical', 'Neo-Classical', 'Minimalist', 'Post-Rock', 'Ambient'],
  ['Electronic', 'Chillwave', 'Ambient', 'Lo-fi', 'Synthwave'],
];

export const PEAK_HOURS = ['10pm - 2am', '8pm - 11pm', '6am - 9am', '2pm - 5pm', '9pm - 12am'];

// Helper to generate dynamic timestamps relative to now
export const getRelativeDate = (hoursAgo: number): string => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
};

export const getRelativeDateDays = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

// Helper to format time for display
export const formatTimeAgo = (hoursAgo: number): string => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Get day name from days ago
export const getDayName = (daysAgo: number): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return days[date.getDay()];
};

// Generate timestamps for recent tracks (returns ISO string for proper parsing)
export const generateRecentTrackTime = (index: number): string => {
  const now = new Date();
  // Each track is spaced ~2-4 hours apart
  const hoursAgo = index * randomFloat(2, 4, 1);
  now.setHours(now.getHours() - hoursAgo);
  return now.toISOString();
};

// Generate listening hours data for visualization
export const generateListeningHours = (): Array<{ hour: number; plays: number }> => {
  const hours = [];
  for (let h = 6; h <= 23; h++) {
    // Peak hours around 9-10am and 8-10pm
    let basePlays = 5;
    if (h >= 9 && h <= 11) basePlays = 20 + randomInRange(5, 15);
    else if (h >= 19 && h <= 22) basePlays = 25 + randomInRange(5, 15);
    else if (h >= 14 && h <= 17) basePlays = 12 + randomInRange(3, 10);
    else basePlays = 5 + randomInRange(0, 8);

    hours.push({ hour: h, plays: basePlays });
  }
  return hours;
};
