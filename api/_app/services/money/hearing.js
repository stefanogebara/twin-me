/**
 * A voice note, heard.
 * ====================
 * Instinct takes a voice note as a message (Stefano's walkthrough, 2026-09-23). Here a voice
 * note on WhatsApp is written down by a transcription model and then answered exactly as the
 * typed question would be; the audio is read in memory and dropped, only the words are kept.
 * Without a transcription key the channel says so and asks for the words typed: silence over
 * guessing. The model is OpenAI's, as the voice bridge already uses; nothing else is sent.
 */
import { createLogger } from '../logger.js';

const log = createLogger('MoneyHearing');
const KEY = () => { const k = process.env.OPENAI_API_KEY || ''; return k && k !== 'your_openai_api_key_here' ? k : null; };

export function canHear() { return Boolean(KEY()); }

/** The words of a voice note, or '' when nothing could be made out. Throws when the model fails. */
export async function transcribeVoice(buffer, mimeType = 'audio/ogg', { language = null } = {}) {
  const key = KEY();
  if (!key) throw new Error('hearing_not_configured');
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: key });
  const ext = /mp4|m4a/.test(mimeType) ? 'm4a' : /mpeg|mp3/.test(mimeType) ? 'mp3' : /wav/.test(mimeType) ? 'wav' : 'ogg';
  const lang = language ? String(language).slice(0, 2) : undefined;
  const ask = async (model) => {
    const file = await OpenAI.toFile(buffer, `voice.${ext}`, { type: mimeType || 'audio/ogg' });
    const r = await openai.audio.transcriptions.create({ file, model, response_format: 'text', ...(lang ? { language: lang } : {}) });
    return (typeof r === 'string' ? r : r?.text || '').trim();
  };
  try { return await ask('gpt-4o-mini-transcribe'); }
  catch (err) {
    if (err?.status === 404 || /model/i.test(err?.message || '')) return ask('whisper-1');
    log.warn('voice note not transcribed', { error: err?.message });
    throw err;
  }
}
