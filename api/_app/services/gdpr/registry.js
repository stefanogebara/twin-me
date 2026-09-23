/**
 * GDPR platform parser registry (audit A2-M2a god-file split).
 *
 * Maps each supported platform key to its parse function. `needsTimezone`
 * mirrors EXACTLY which cases of the old processGdprImport switch passed
 * userTimezone to the parser (spotify, youtube, discord, google_search,
 * netflix); every other parser is called with the file buffer only.
 */
import { parseSpotify } from './parsers/spotify.js';
import { parseYouTube } from './parsers/youtube.js';
import { parseDiscord } from './parsers/discord.js';
import { parseReddit } from './parsers/reddit.js';
import { parseAndroidUsage } from './parsers/androidUsage.js';
import { parseGoogleSearch } from './parsers/googleSearch.js';
import { parseWhatsApp } from './parsers/whatsapp.js';
import { parseWhoop } from './parsers/whoop.js';
import { parseAppleHealth } from './parsers/appleHealth.js';
import { parseHealthConnect } from './parsers/healthConnect.js';
import { parseAndroidHealthConnect } from './parsers/androidHealth.js';
import { parseSmsPatterns } from './parsers/smsPatterns.js';
import { parseLetterboxd } from './parsers/letterboxd.js';
import { parseGoodreads } from './parsers/goodreads.js';
import { parseNetflix } from './parsers/netflix.js';
import { parseTikTok } from './parsers/tiktok.js';
import { parseXArchive } from './parsers/xArchive.js';
import { parseAppleMusic } from './parsers/appleMusic.js';
import { parseSoundCloud } from './parsers/soundcloud.js';
import { parseLinkedIn } from './parsers/linkedin.js';
import { parseInstagram } from './parsers/instagram.js';

export const PLATFORM_PARSERS = {
  spotify:        { parse: parseSpotify,              needsTimezone: true },
  youtube:        { parse: parseYouTube,              needsTimezone: true },
  discord:        { parse: parseDiscord,              needsTimezone: true },
  reddit:         { parse: parseReddit,               needsTimezone: false },
  android_usage:  { parse: parseAndroidUsage,         needsTimezone: false },
  google_search:  { parse: parseGoogleSearch,         needsTimezone: true },
  whatsapp:       { parse: parseWhatsApp,             needsTimezone: false },
  whoop:          { parse: parseWhoop,                needsTimezone: false },
  apple_health:   { parse: parseAppleHealth,          needsTimezone: false },
  health_connect: { parse: parseHealthConnect,        needsTimezone: false },
  android_health: { parse: parseAndroidHealthConnect, needsTimezone: false },
  sms_patterns:   { parse: parseSmsPatterns,          needsTimezone: false },
  letterboxd:     { parse: parseLetterboxd,           needsTimezone: false },
  goodreads:      { parse: parseGoodreads,            needsTimezone: false },
  netflix:        { parse: parseNetflix,              needsTimezone: true },
  tiktok:         { parse: parseTikTok,               needsTimezone: false },
  x_archive:      { parse: parseXArchive,             needsTimezone: false },
  apple_music:    { parse: parseAppleMusic,           needsTimezone: false },
  soundcloud:     { parse: parseSoundCloud,           needsTimezone: false },
  linkedin:       { parse: parseLinkedIn,             needsTimezone: false },
  instagram:      { parse: parseInstagram,            needsTimezone: false },
};
