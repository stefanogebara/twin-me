/**
 * YouTube observation text. Pure, no network, no DB.
 *
 * Extracted from youtube.js in the 2026-08-13 payload audit, where the liked-
 * videos observation turned out to be the empty-PR-title bug one layer deeper:
 * the guard tested the SOURCE array while the template interpolated a DERIVED
 * one.
 *
 *     if (likedItems.length > 0) {
 *       const titles = likedItems.map(...).filter(Boolean).slice(0, 5);
 *       observations.push({ content: `... "${titles.join('", "')}" — from
 *                                     channels: ${channelsSeen.join(', ')}` });
 *     }
 *
 * Items whose snippets carry no title leave `titles` empty and the memory
 * stream gets `Recently liked YouTube videos: "" — from channels:`. Guarding
 * the input does not guarantee the output; the check has to be on the thing
 * actually being rendered.
 */

import { sanitizeExternal } from '../observationUtils.js';

const MAX_TITLES = 5;
const MAX_CHANNELS = 5;

/**
 * @param {Array<{snippet?: {title?: string, channelTitle?: string}}>} likedItems
 * @returns {string|null} null when no usable title survives sanitizing, so the
 *   caller writes nothing rather than a memory that says nothing.
 */
export function buildLikedVideosObservation(likedItems) {
  if (!Array.isArray(likedItems) || likedItems.length === 0) return null;
  const snippets = likedItems
    .filter((v) => v && typeof v === 'object')
    .map((v) => v.snippet)
    .filter((s) => s && typeof s === 'object');

  const titles = snippets
    .map((s) => sanitizeExternal(s.title, 80))
    .filter(Boolean)
    .slice(0, MAX_TITLES);
  if (titles.length === 0) return null;

  const channels = [...new Set(
    snippets.map((s) => sanitizeExternal(s.channelTitle)).filter(Boolean),
  )].slice(0, MAX_CHANNELS);

  const base = `Recently liked YouTube videos: "${titles.join('", "')}"`;
  // Dangling "— from channels:" with nothing after it is the same defect in
  // miniature, so the clause is dropped rather than left empty.
  return channels.length > 0 ? `${base} — from channels: ${channels.join(', ')}` : base;
}
