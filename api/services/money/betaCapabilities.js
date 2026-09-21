import { isConfigured } from './feeds/enableBanking.js';
import { isMoneyChannelUser } from './channel.js';

/** Statement beta is the default. Advanced integrations require explicit owner opt-in. */
export function moneyCapabilities(userId) {
  const allowed = Boolean(userId) && (process.env.MONEY_ADVANCED_BETA_USER_IDS || '')
    .split(',').map((id) => id.trim()).filter(Boolean).includes(userId);
  return { bank: allowed && isConfigured(), capture: allowed, whatsapp: isMoneyChannelUser(userId) };
}
