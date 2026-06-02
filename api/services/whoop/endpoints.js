/**
 * Whoop v2 REST endpoint constants for the analytics tools.
 *
 * We deliberately mirror the upstream constants from shashank's MCP
 * (MIT, Copyright (c) 2025 Shashank Mishra) so the ported analytics
 * code can stay byte-identical and divergence is easy to spot.
 */

export const WHOOP_API_BASE_URL = 'https://api.prod.whoop.com/developer';

export const ENDPOINT_USER_PROFILE = '/v2/user/profile/basic';
export const ENDPOINT_BODY_MEASUREMENT = '/v2/user/measurement/body';
export const ENDPOINT_RECOVERY = '/v2/recovery';
export const ENDPOINT_SLEEP = '/v2/activity/sleep';
export const ENDPOINT_WORKOUT = '/v2/activity/workout';
export const ENDPOINT_CYCLE = '/v2/cycle';
