/**
 * WhatsApp Constants
 * ==================
 * Single source of truth for the TwinMe WhatsApp twin number.
 */

/** The TwinMe twin's WhatsApp number in display format */
export const TWIN_WHATSAPP_DISPLAY = '+1 555-943-4487';

/** The TwinMe twin's WhatsApp number digits only (for wa.me deep link) */
export const TWIN_WHATSAPP_DIGITS = '15559434487';

/** WhatsApp deep link to message the twin */
export const TWIN_WHATSAPP_LINK = `https://wa.me/${TWIN_WHATSAPP_DIGITS}`;
