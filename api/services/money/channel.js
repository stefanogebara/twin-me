/**
 * The money twin on a messaging channel: the pure half.
 * =====================================================
 * Who is on it, and how a reply from chat.js becomes a message a phone can show. A chart cannot
 * be sent as words, so a reply that drew one carries a link to the page instead. Nothing here
 * touches the database or the network, and nothing here imports chat.js: the tests of this file
 * need no mocks.
 */

/** WhatsApp takes 4,096; a person reading on a lock screen does not. */
export const CHANNEL_MAX_CHARS = 1500;
export const OFFER_PREFIX = 'mo:';
export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_CHARS = 20;
/** A bare "2" means the second offer only while the offers are still on the screen. */
export const NUMBERED_REPLY_WINDOW_MS = 10 * 60 * 1000;

export function moneyChannelUserIds(value = process.env.MONEY_WHATSAPP_USER_IDS) {
  return String(value || '').split(',').map((id) => id.trim()).filter(Boolean);
}

export function isMoneyChannelUser(userId, value = process.env.MONEY_WHATSAPP_USER_IDS) {
  return Boolean(userId) && moneyChannelUserIds(value).includes(userId);
}

export function plainForChannel(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/^[ \t]*(#+|>)[ \t]*/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cutAtSentence(text, max = CHANNEL_MAX_CHARS) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return (end > max * 0.5 ? head.slice(0, end + 1) : head).trim();
}

export function renderReply(reply, { appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://twinme.me' } = {}) {
  const text = cutAtSentence(plainForChannel(reply?.text));
  const drew = Array.isArray(reply?.figures) && reply.figures.length > 0;
  return { text, link: drew ? `${String(appUrl).replace(/\/+$/, '')}/money` : null };
}

const MUTE_RE = /^(stop|para|parar|basta|silencio)[.! ]*$/i;
const UNMUTE_RE = /^(start|volver|voltar|reanudar|retomar)[.! ]*$/i;
export function muteIntent(text) {
  const t = String(text || '').trim();
  if (MUTE_RE.test(t)) return 'mute';
  if (UNMUTE_RE.test(t)) return 'unmute';
  return null;
}

/* The channel's own few sentences. chat.js keeps its phrases to itself and changes daily; these
   are the ones only a channel says. English is the key, as in chat.js. */
const WORDS = {
  es: {
    'The morning line is off. Say start to bring it back.': 'La línea de la mañana queda apagada. Di volver para recuperarla.',
    'The morning line is back on.': 'La línea de la mañana vuelve mañana.',
    'That was already done.': 'Eso ya estaba hecho.',
    'That could not be done right now.': 'Eso no se pudo hacer ahora.',
    'Something went wrong on my side. Ask again in a moment.': 'Algo falló por mi parte. Pregunta de nuevo en un momento.',
    'The chart is on the page.': 'El gráfico está en la página.',
    'Open TwinMe': 'Abrir TwinMe',
    'Tap one, or reply with its number.': 'Toca una, o responde con su número.',
    'A forwarded message is read as data. That one reads like an instruction, so it was left alone.': 'Un mensaje reenviado se lee como dato. Ese parece una instrucción, así que no lo he tocado.',
    'That file could not be read. A photo of it would come through.': 'Ese archivo no se pudo leer. Una foto sí llegaría.',
  },
  'pt-BR': {
    'The morning line is off. Say start to bring it back.': 'A linha da manhã fica desligada. Diga voltar para trazê-la de volta.',
    'The morning line is back on.': 'A linha da manhã volta amanhã.',
    'That was already done.': 'Isso já estava feito.',
    'That could not be done right now.': 'Não deu para fazer isso agora.',
    'Something went wrong on my side. Ask again in a moment.': 'Algo falhou do meu lado. Pergunte de novo em instantes.',
    'The chart is on the page.': 'O gráfico está na página.',
    'Open TwinMe': 'Abrir TwinMe',
    'Tap one, or reply with its number.': 'Toque em uma, ou responda com o número.',
    'A forwarded message is read as data. That one reads like an instruction, so it was left alone.': 'Uma mensagem encaminhada é lida como dado. Essa parece uma instrução, então ficou como estava.',
    'That file could not be read. A photo of it would come through.': 'Não deu para ler esse arquivo. Uma foto dele chegaria.',
  },
};
export function channelSay(language, source) {
  return (WORDS[language] && WORDS[language][source]) || source;
}
