/**
 * Gmail Feature Extractor
 *
 * Extracts behavioral features from Gmail data that correlate
 * with Big Five personality traits.
 *
 * - Email organization → Conscientiousness (r=0.38)
 * - Response volume → Extraversion (r=0.30)
 * - Time pattern regularity → Conscientiousness (r=0.32)
 * - Contact diversity → Openness (r=0.25)
 * - Email activity hours → Neuroticism (r=0.20)
 * - Inbox management → Conscientiousness (r=0.28)
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('GmailExtractor');

const DEFAULT_LABELS = new Set([
  'inbox', 'sent', 'draft', 'drafts', 'trash', 'spam', 'starred', 'important',
  'unread', 'all', 'category_social', 'category_updates', 'category_forums',
  'category_promotions', 'category_primary', 'sent mail', 'all mail', 'chats'
]);

class GmailFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);
    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data').select('*')
        .eq('user_id', userId).eq('platform', 'gmail')
        .gte('extracted_at', cutoffDate).order('extracted_at', { ascending: false });
      if (platformError) log.warn('Error fetching user_platform_data:', platformError.message);

      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data').select('*')
        .eq('user_id', userId).eq('platform', 'gmail')
        .gte('created_at', cutoffDate).order('created_at', { ascending: false });
      if (soulError) log.warn('Error fetching soul_data:', soulError.message);

      const normalizedPlatform = (platformData || []).map(e => ({ ...e, created_at: e.extracted_at, raw_data: e.raw_data || {} }));
      const normalizedSoul = (soulData || []).map(e => ({ ...e, raw_data: e.raw_data || {} }));
      const data = [...normalizedPlatform, ...normalizedSoul];

      if (data.length === 0) { log.info('No Gmail data found'); return []; }
      log.info(`Found ${data.length} Gmail entries (${normalizedPlatform.length} platform, ${normalizedSoul.length} soul)`);

      const features = [];
      const push = (result, type, trait, weight, desc, corr, note) => {
        if (result !== null) {
          const val = typeof result === 'object' ? result.value : result;
          const raw = typeof result === 'object' ? result.rawValue : {};
          features.push(this.createFeature(userId, type, val, {
            contributes_to: trait, contribution_weight: weight,
            description: desc, evidence: { correlation: corr, note }, raw_value: raw
          }));
        }
      };

      push(this.calculateEmailOrganization(data), 'email_organization', 'conscientiousness', 0.38,
        'Number of custom labels/folders', 0.38, 'More labels indicate systematic organization');
      push(this.calculateResponseVolume(data), 'response_volume', 'extraversion', 0.30,
        'Weekly email send count', 0.30, 'Higher volume correlates with social engagement');
      push(this.calculateTimePatternRegularity(data), 'time_pattern_regularity', 'conscientiousness', 0.32,
        'Consistency of email send times', 0.32, 'Regular patterns suggest structured routines');
      push(this.calculateContactDiversity(data), 'contact_diversity', 'openness', 0.25,
        'Number of unique correspondents', 0.25, 'Diverse contacts suggest openness');
      push(this.calculateEmailActivityHours(data), 'email_activity_hours', 'neuroticism', 0.20,
        'Late night email activity', 0.20, 'Late-night activity may indicate restlessness');
      push(this.calculateInboxManagement(data), 'inbox_management', 'conscientiousness', 0.28,
        'Mailbox size control', 0.28, 'Smaller inbox suggests active management');

      log.info(`Extracted ${features.length} features`);
      return features;
    } catch (error) { log.error('Error:', error); throw error; }
  }

  /** Extract hour distribution from any entry with timestamps or hour_distribution */
  _extractHourCounts(data) {
    const hours = new Array(24).fill(0);
    let total = 0;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      // From structured distributions
      for (const dist of [raw.hour_distribution, raw.time_of_day_pattern]) {
        if (dist) {
          Object.entries(dist).forEach(([h, c]) => { const hr = parseInt(h, 10); if (hr >= 0 && hr < 24) { hours[hr] += c; total += c; } });
        }
      }
      // From message timestamps
      if (['sent', 'sent_messages', 'received', 'messages'].includes(dt)) {
        (raw.items || raw.messages || []).forEach(msg => {
          const d = new Date(msg.date || msg.sent_at || msg.timestamp);
          if (!isNaN(d.getTime())) { hours[d.getHours()]++; total++; }
        });
      }
    }
    return { hours, total };
  }

  calculateEmailOrganization(data) {
    let customCount = 0;
    const labels = new Set();
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      const addLabels = (items) => {
        items.forEach(l => {
          const name = (typeof l === 'string' ? l : (l.name || l.label || '')).toLowerCase().trim();
          if (name) { labels.add(name); if (!DEFAULT_LABELS.has(name)) customCount++; }
        });
      };
      if (dt === 'labels' || dt === 'gmail_labels') addLabels(raw.items || raw.labels || []);
      if (Array.isArray(raw.labels)) addLabels(raw.labels);
      if (raw.custom_label_count !== undefined) { const c = parseInt(raw.custom_label_count, 10); if (!isNaN(c) && c > customCount) customCount = c; }
      const m = content.match(/(\d+)\s*custom\s*labels?/i) || content.match(/(\d+)\s*(?:folders?|labels?)/i);
      if (m) { const c = parseInt(m[1], 10); if (!isNaN(c) && c > customCount) customCount = c; }
    }
    if (labels.size === 0 && customCount === 0) return null;
    return { value: Math.min(100, Math.round((customCount / 15) * 10000) / 100), rawValue: { custom_label_count: customCount, total_labels: labels.size } };
  }

  calculateResponseVolume(data) {
    let totalSent = 0;
    const timestamps = [];
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (['email_volume', 'email_stats', 'mailbox_stats'].includes(dt)) {
        if (raw.sent_per_week !== undefined) {
          return { value: Math.min(100, Math.round((raw.sent_per_week / 100) * 10000) / 100), rawValue: { weekly_sent: raw.sent_per_week } };
        }
        totalSent += (raw.sent_count || 0) + (raw.weekly_sent || 0) + (raw.weekly_volume || 0);
      }
      if (dt === 'sent' || dt === 'sent_messages') {
        (raw.items || raw.messages || []).forEach(msg => {
          totalSent++;
          const d = msg.date || msg.sent_at || msg.timestamp;
          if (d) timestamps.push(new Date(d));
        });
      }
      const vm = content.match(/(\d+)\s*emails?\s*(?:sent|per\s*week|weekly)/i);
      if (vm) { const c = parseInt(vm[1], 10); if (!isNaN(c) && c > totalSent) totalSent = c; }
    }
    if (totalSent === 0) return null;
    let weeklySent = totalSent;
    if (timestamps.length > 1) {
      timestamps.sort((a, b) => a - b);
      const weeks = Math.max(1, (timestamps[timestamps.length - 1] - timestamps[0]) / (7 * 864e5));
      weeklySent = timestamps.length / weeks;
    }
    return { value: Math.min(100, Math.round((weeklySent / 100) * 10000) / 100), rawValue: { weekly_sent: Math.round(weeklySent), total_sent: totalSent } };
  }

  calculateTimePatternRegularity(data) {
    const { hours, total } = this._extractHourCounts(data);
    if (total < 5) return null;
    const sorted = [...hours].sort((a, b) => b - a);
    let cum = 0, hoursFor80 = 0;
    for (const c of sorted) { cum += c; hoursFor80++; if (cum >= total * 0.8) break; }
    const score = Math.max(0, Math.min(100, ((12 - hoursFor80) / 8) * 100));
    return { value: Math.round(score * 100) / 100, rawValue: { hours_for_80_pct: hoursFor80, peak_hour: hours.indexOf(Math.max(...hours)), total_messages: total } };
  }

  calculateContactDiversity(data) {
    const contacts = new Set();
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (['sender_frequency', 'contacts', 'correspondents'].includes(dt)) {
        (raw.items || raw.senders || raw.contacts || []).forEach(c => {
          const e = typeof c === 'string' ? c : (c.email || c.address || c.sender || '');
          if (e) contacts.add(e.toLowerCase().trim());
        });
      }
      if (['sent', 'sent_messages', 'received', 'messages'].includes(dt)) {
        (raw.items || raw.messages || []).forEach(msg => {
          [msg.from, msg.to, msg.sender, msg.recipient, ...(msg.recipients || []), ...(msg.cc || [])].filter(Boolean).forEach(a => {
            const e = typeof a === 'string' ? a : (a.email || a.address || '');
            if (e) contacts.add(e.toLowerCase().trim());
          });
        });
      }
      if (raw.unique_contacts !== undefined) { const c = parseInt(raw.unique_contacts, 10); for (let i = contacts.size; i < c; i++) contacts.add(`_p${i}`); }
      const cm = content.match(/(\d+)\s*(?:unique\s*)?(?:contacts?|correspondents?)/i);
      if (cm) { const c = parseInt(cm[1], 10); for (let i = contacts.size; i < c; i++) contacts.add(`_p${i}`); }
    }
    if (contacts.size === 0) return null;
    return { value: Math.min(100, Math.round((contacts.size / 200) * 10000) / 100), rawValue: { unique_contacts: contacts.size } };
  }

  calculateEmailActivityHours(data) {
    const { hours, total } = this._extractHourCounts(data);
    if (total < 5) return null;
    const lateNight = [23, 0, 1, 2, 3, 4].reduce((s, h) => s + hours[h], 0);
    const pct = (lateNight / total) * 100;
    return { value: Math.min(100, Math.round((pct / 30) * 10000) / 100), rawValue: { late_night_percent: Math.round(pct * 100) / 100, late_night_count: lateNight, total_messages: total } };
  }

  calculateInboxManagement(data) {
    let mailboxSize = 0, inboxCount = 0, found = false;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const content = entry.content || '';
      for (const [k, target] of [['total_messages', 'mailbox'], ['mailbox_size', 'mailbox'], ['inbox_count', 'inbox']]) {
        if (raw[k] !== undefined) { const v = Math.max(target === 'inbox' ? inboxCount : mailboxSize, raw[k]); if (target === 'inbox') inboxCount = v; else mailboxSize = v; found = true; }
      }
      const sm = content.match(/(\d[\d,]*)\s*(?:total\s*)?(?:emails?|messages?)/i);
      if (sm) { const c = parseInt(sm[1].replace(/,/g, ''), 10); if (!isNaN(c) && c > mailboxSize) { mailboxSize = c; found = true; } }
      const im = content.match(/inbox[:\s]*(\d[\d,]*)/i);
      if (im) { const c = parseInt(im[1].replace(/,/g, ''), 10); if (!isNaN(c) && c > inboxCount) { inboxCount = c; found = true; } }
    }
    if (!found) return null;
    const metric = inboxCount > 0 ? inboxCount : mailboxSize;
    return { value: Math.max(0, Math.min(100, Math.round(((1000 - metric) / 1000) * 10000) / 100)), rawValue: { mailbox_size: mailboxSize, inbox_count: inboxCount } };
  }

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId, platform: 'gmail', feature_type: featureType,
      feature_value: featureValue, normalized_value: featureValue / 100,
      confidence_score: 65, sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: { raw_value: metadata.raw_value || {} },
      evidence: { description: metadata.description, correlation: metadata.evidence?.correlation, citation: metadata.evidence?.citation, note: metadata.evidence?.note, raw_value: metadata.raw_value || {} }
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };
    log.info(`Saving ${features.length} features to database...`);
    try {
      const { data, error } = await supabaseAdmin.from('behavioral_features')
        .upsert(features, { onConflict: 'user_id,platform,feature_type' }).select();
      if (error) throw error;
      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };
    } catch (error) { log.error('Error saving features:', error); return { success: false, error: error.message }; }
  }
}

const gmailFeatureExtractor = new GmailFeatureExtractor();
export default gmailFeatureExtractor;
