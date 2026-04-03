/**
 * LinkedIn Feature Extractor
 *
 * Extracts behavioral features from LinkedIn profile data that correlate
 * with Big Five personality traits.
 *
 * - Skill diversity → Openness (r=0.30)
 * - Career progression → Conscientiousness (r=0.35)
 * - Professional network → Extraversion (r=0.38)
 * - Profile completeness → Conscientiousness (r=0.30)
 * - Industry breadth → Openness (r=0.25)
 */
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('LinkedInExtractor');

class LinkedInFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);
    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data').select('*')
        .eq('user_id', userId).eq('platform', 'linkedin')
        .gte('extracted_at', cutoffDate).order('extracted_at', { ascending: false });
      if (platformError) log.warn('Error fetching user_platform_data:', platformError.message);

      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data').select('*')
        .eq('user_id', userId).eq('platform', 'linkedin')
        .gte('created_at', cutoffDate).order('created_at', { ascending: false });
      if (soulError) log.warn('Error fetching soul_data:', soulError.message);

      const normalizedPlatform = (platformData || []).map(e => ({ ...e, created_at: e.extracted_at, raw_data: e.raw_data || {} }));
      const normalizedSoul = (soulData || []).map(e => ({ ...e, raw_data: e.raw_data || {} }));
      const data = [...normalizedPlatform, ...normalizedSoul];

      if (data.length === 0) { log.info('No LinkedIn data found'); return []; }
      log.info(`Found ${data.length} LinkedIn entries (${normalizedPlatform.length} platform, ${normalizedSoul.length} soul)`);

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

      push(this.calculateSkillDiversity(data), 'skill_diversity', 'openness', 0.30,
        'Number of distinct skills listed', 0.30, 'More diverse skills suggest intellectual curiosity');
      push(this.calculateCareerProgression(data), 'career_progression', 'conscientiousness', 0.35,
        'Evidence of headline changes indicating growth', 0.35, 'Active profile updates suggest goal orientation');
      push(this.calculateProfessionalNetwork(data), 'professional_network', 'extraversion', 0.38,
        'Connection and network size indicators', 0.38, 'Larger networks correlate with extraversion');
      push(this.calculateProfileCompleteness(data), 'profile_completeness', 'conscientiousness', 0.30,
        'Completeness of profile sections', 0.30, 'Thorough profiles indicate conscientiousness');
      push(this.calculateIndustryBreadth(data), 'industry_breadth', 'openness', 0.25,
        'Skills spanning multiple domains', 0.25, 'Cross-domain skills suggest openness');

      log.info(`Extracted ${features.length} features`);
      return features;
    } catch (error) { log.error('Error:', error); throw error; }
  }

  /** Collect skills from all entry types */
  _collectSkills(data) {
    const skills = new Set();
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (dt === 'skills' || dt === 'top_skills') {
        (raw.items || raw.skills || []).forEach(s => {
          const n = typeof s === 'string' ? s : (s.name || s.skill || '');
          if (n) skills.add(n.toLowerCase().trim());
        });
      }
      if (dt === 'profile' || dt === 'linkedin_profile') {
        (raw.skills || raw.top_skills || []).forEach(s => {
          const n = typeof s === 'string' ? s : (s.name || '');
          if (n) skills.add(n.toLowerCase().trim());
        });
      }
      if (raw.name && dt === 'skill') skills.add(raw.name.toLowerCase().trim());
      const m = content.match(/skills?:\s*(.+?)(?:\.|$)/i);
      if (m) m[1].split(/[,;]/).forEach(s => { const t = s.trim().toLowerCase(); if (t.length > 1) skills.add(t); });
    }
    return skills;
  }

  calculateSkillDiversity(data) {
    const skills = this._collectSkills(data);
    if (skills.size === 0) return null;
    return { value: Math.min(100, Math.round((skills.size / 20) * 10000) / 100), rawValue: { skill_count: skills.size } };
  }

  calculateCareerProgression(data) {
    const headlines = new Set();
    let positionCount = 0;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (raw.headline) headlines.add(raw.headline.trim());
      if (dt === 'headline' || dt === 'headline_change') {
        [raw.current, raw.previous, raw.headline].filter(Boolean).forEach(h => headlines.add(h.trim()));
      }
      if (dt === 'positions' || dt === 'experience') positionCount += (raw.items || raw.positions || []).length;
      const hm = content.match(/headline:\s*["']?(.+?)["']?(?:\.|,|$)/i);
      if (hm) headlines.add(hm[1].trim());
      const pm = content.match(/(\d+)\s*positions?/i);
      if (pm) { const c = parseInt(pm[1], 10); if (c > positionCount) positionCount = c; }
    }
    if (headlines.size === 0 && positionCount === 0) return null;
    const score = Math.min(40, headlines.size * 20) + (positionCount > 1 ? Math.min(40, positionCount * 10) : 0) + (headlines.size >= 1 ? 20 : 0);
    return { value: Math.min(100, score), rawValue: { headline_count: headlines.size, position_count: positionCount } };
  }

  calculateProfessionalNetwork(data) {
    let connCount = 0;
    let found = false;
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      for (const key of ['connections', 'connection_count']) {
        if (raw[key] !== undefined) {
          const c = typeof raw[key] === 'number' ? raw[key] : parseInt(raw[key], 10);
          if (!isNaN(c) && c > connCount) { connCount = c; found = true; }
        }
      }
      if (dt === 'network' || dt === 'connections') {
        const c = raw.total || raw.count || raw.size || 0;
        if (c > connCount) { connCount = c; found = true; }
      }
      const cm = content.match(/(\d[\d,]*)\s*connections?/i);
      if (cm) { const c = parseInt(cm[1].replace(/,/g, ''), 10); if (!isNaN(c) && c > connCount) { connCount = c; found = true; } }
      if (content.includes('500+') || raw.connections === '500+') { if (connCount < 500) { connCount = 500; found = true; } }
    }
    if (!found) return null;
    return { value: Math.min(100, Math.round((connCount / 500) * 10000) / 100), rawValue: { connection_count: connCount } };
  }

  calculateProfileCompleteness(data) {
    const s = { headline: false, summary: false, skills: false, experience: false, education: false, photo: false };
    for (const entry of data) {
      const raw = entry.raw_data || {};
      const dt = entry.data_type || '';
      const content = entry.content || '';
      if (raw.headline || dt === 'headline') s.headline = true;
      if (raw.summary || raw.about || dt === 'summary' || dt === 'about') s.summary = true;
      if (raw.skills || raw.top_skills || ['skills', 'top_skills', 'skill'].includes(dt)) s.skills = true;
      if (raw.positions || raw.experience || dt === 'positions' || dt === 'experience') s.experience = true;
      if (raw.education || dt === 'education') s.education = true;
      if (raw.profile_picture || raw.photo || raw.profilePicture) s.photo = true;
      if (dt === 'profile' || dt === 'linkedin_profile') {
        if (raw.headline) s.headline = true;
        if (raw.summary || raw.about) s.summary = true;
        if (raw.skills?.length > 0) s.skills = true;
        if (raw.positions?.length > 0) s.experience = true;
        if (raw.education?.length > 0) s.education = true;
        if (raw.profilePicture || raw.profile_picture) s.photo = true;
      }
      if (/headline/i.test(content)) s.headline = true;
      if (/summary|about/i.test(content)) s.summary = true;
      if (/skills?/i.test(content)) s.skills = true;
      if (/experience|position/i.test(content)) s.experience = true;
      if (/education/i.test(content)) s.education = true;
    }
    const completed = Object.values(s).filter(Boolean).length;
    if (completed === 0) return null;
    return { value: Math.round((completed / 6) * 10000) / 100, rawValue: { completed_sections: completed, total_sections: 6, sections: s } };
  }

  calculateIndustryBreadth(data) {
    const domains = {
      technology: ['software', 'programming', 'python', 'javascript', 'react', 'aws', 'cloud', 'devops', 'api', 'sql', 'docker', 'ai', 'data science'],
      business: ['management', 'strategy', 'leadership', 'marketing', 'sales', 'product management', 'consulting', 'agile'],
      creative: ['design', 'ux', 'ui', 'branding', 'photography', 'video', 'writing', 'illustration'],
      finance: ['finance', 'accounting', 'investment', 'banking', 'economics', 'audit'],
      science: ['research', 'biology', 'chemistry', 'physics', 'statistics', 'analytics', 'mathematics'],
      communication: ['public speaking', 'communication', 'negotiation', 'coaching', 'mentoring', 'training']
    };
    const skills = this._collectSkills(data);
    if (skills.size === 0) return null;
    const matched = new Map();
    for (const skill of skills) {
      for (const [domain, kws] of Object.entries(domains)) {
        if (kws.some(kw => skill.includes(kw) || kw.includes(skill))) {
          matched.set(domain, (matched.get(domain) || 0) + 1);
        }
      }
    }
    if (matched.size === 0) return null;
    return { value: Math.min(100, Math.round((matched.size / 4) * 10000) / 100), rawValue: { domain_count: matched.size, domains: Object.fromEntries(matched), total_skills: skills.size } };
  }

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId, platform: 'linkedin', feature_type: featureType,
      feature_value: featureValue, normalized_value: featureValue / 100,
      confidence_score: 65, sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
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

const linkedinFeatureExtractor = new LinkedInFeatureExtractor();
export default linkedinFeatureExtractor;
