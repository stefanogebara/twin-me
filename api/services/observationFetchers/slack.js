/**
 * Slack observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Slack workspace profile + channel membership and return natural-language observations.
 * Reveals professional focus areas and collaboration context.
 */
async function fetchSlackObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'slack');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Slack: no valid token', { userId });
    return observations;
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    'Content-Type': 'application/json'
  };

  // User profile — timezone and title reveal work context
  try {
    const profileRes = await axios.get('https://slack.com/api/users.profile.get', { headers, timeout: 10000 });
    if (profileRes.data?.ok) {
      const profile = profileRes.data.profile;
      const parts = [];
      if (profile.title) parts.push(`job title: ${sanitizeExternal(profile.title, 80)}`);
      if (profile.tz) parts.push(`timezone: ${profile.tz}`);
      if (parts.length > 0) {
        observations.push({
          content: `Slack profile shows ${parts.join(', ')}`,
          contentType: 'profile_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Slack profile error', { error: e });
  }

  // Channel membership — reveals project areas and interests
  try {
    const channelsRes = await axios.get(
      'https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200',
      { headers, timeout: 10000 }
    );
    if (channelsRes.data?.ok) {
      const channels = (channelsRes.data.channels || [])
        .filter(c => c.is_member)
        .map(c => sanitizeExternal(c.name, 50))
        .filter(Boolean);

      if (channels.length > 0) {
        const preview = channels.slice(0, 10).join(', ');
        const suffix = channels.length > 10 ? ` and ${channels.length - 10} more` : '';
        observations.push({
          content: `Member of ${channels.length} Slack channels: ${preview}${suffix}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Slack channels error', { error: e });
  }

  return observations;
}

export default fetchSlackObservations;
export { fetchSlackObservations };
