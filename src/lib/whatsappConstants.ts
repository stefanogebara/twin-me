/**
 * WhatsApp Constants
 * ==================
 * Single source of truth for the TwinMe WhatsApp twin number.
 */

/** The TwinMe twin's WhatsApp number in display format */
export const TWIN_WHATSAPP_DISPLAY = '+1 762-994-3997';

/** The TwinMe twin's WhatsApp number digits only (for wa.me deep link) */
export const TWIN_WHATSAPP_DIGITS = '17629943997';

/** WhatsApp deep link to message the twin */
export const TWIN_WHATSAPP_LINK = `https://wa.me/${TWIN_WHATSAPP_DIGITS}`;
