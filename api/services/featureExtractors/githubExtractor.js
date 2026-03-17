/**
 * GitHub Feature Extractor
 *
 * Extracts OCEAN Big Five personality traits from GitHub activity data.
 *
 * Features: language diversity (O, r=0.35), OSS contribution (O, r=0.30),
 * commit regularity (C, r=0.40), code docs (C, r=0.35), collaboration (E, r=0.35),
 * social engagement (E, r=0.30), commit msg quality (C, r=0.30),
 * weekend/night coding (N, r=0.20), project diversity (O, r=0.32),
 * repo maintenance (A, r=0.25).
 *
 * Research: Paruma et al. (2019), Calefato et al. (2019),
 * Rigby & Hassan (2007), Iyer et al. (2019)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('GithubFeatureExtractor');

class GitHubFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);
    try {
      const { data: platformData, error: pe } = await supabaseAdmin
        .from('user_platform_data').select('*')
        .eq('user_id', userId).eq('platform', 'github')
        .order('extracted_at', { ascending: false });
      if (pe) log.warn('Error fetching user_platform_data:', pe.message);

      const { data: soulData, error: se } = await supabaseAdmin
        .from('soul_data').select('*')
        .eq('user_id', userId).eq('platform', 'github')
        .order('created_at', { ascending: false });
      if (se) log.warn('Error fetching soul_data:', se.message);

      const normalized = (platformData || []).map(e => ({ ...e, created_at: e.extracted_at, raw_data: e.raw_data || {} }));
      const normSoul = (soulData || []).map(e => ({ ...e, raw_data: e.raw_data || {} }));
      const ghData = [...normalized, ...normSoul];

      if (ghData.length === 0) { log.info('No GitHub data found'); return []; }
      log.info(`Found ${ghData.length} GitHub entries (${normalized.length} platform, ${normSoul.length} soul)`);

      const features = [];
      const featureDefs = [
        ['gh_language_diversity', this.calcLanguageDiversity, 'openness', 0.35, 'Unique programming languages', 'Paruma et al. (2019)'],
        ['gh_oss_contribution_rate', this.calcOpenSourceRate, 'openness', 0.30, 'Public repos, forks, external PRs ratio', 'Rigby & Hassan (2007)'],
        ['gh_commit_regularity', this.calcCommitRegularity, 'conscientiousness', 0.40, 'Commit day consistency over 30-day window', 'Calefato et al. (2019)'],
        ['gh_code_documentation', this.calcDocumentation, 'conscientiousness', 0.35, 'READMEs and descriptions in repos', 'Iyer et al. (2019)'],
        ['gh_collaboration_activity', this.calcCollaboration, 'extraversion', 0.35, 'PRs, issues, collaborative repos', 'Calefato et al. (2019)'],
        ['gh_social_engagement', this.calcSocialEngagement, 'extraversion', 0.30, 'Stars, forks, following/followers ratio', 'Paruma et al. (2019)'],
        ['gh_commit_message_quality', this.calcCommitMsgQuality, 'conscientiousness', 0.30, 'Commit message descriptiveness', 'Iyer et al. (2019)'],
        ['gh_unusual_hours_coding', this.calcUnusualHours, 'neuroticism', 0.20, 'Weekend and late-night coding', 'Paruma et al. (2019)'],
        ['gh_project_diversity', this.calcProjectDiversity, 'openness', 0.32, 'Range of project types', 'Rigby & Hassan (2007)'],
        ['gh_repo_maintenance', this.calcRepoMaintenance, 'agreeableness', 0.25, 'Issue response and PR acceptance', 'Calefato et al. (2019)'],
      ];

      for (const [type, fn, trait, weight, desc, cite] of featureDefs) {
        const result = fn.call(this, ghData);
        if (result !== null) {
          features.push(this.createFeature(userId, type, result.value, {
            contributes_to: trait, contribution_weight: weight,
            description: desc, evidence: { correlation: weight, citation: cite },
            raw_value: result.rawValue
          }));
        }
      }

      log.info(`Extracted ${features.length} features`);
      return features;
    } catch (error) { log.error('Error:', error); throw error; }
  }

  // ── Data helpers ──────────────────────────────────────────────────────────

  _repos(d) {
    const repos = [], seen = new Set();
    for (const e of d) {
      const r = e.raw_data || {}, dt = e.data_type || '';
      if (dt === 'repository' && r.name) {
        const k = r.full_name || r.name;
        if (!seen.has(k)) { seen.add(k); repos.push(r); }
      }
      if (dt === 'comprehensive_github_profile' && r.repos) {
        for (const repo of r.repos) {
          const k = repo.full_name || repo.name;
          if (k && !seen.has(k)) { seen.add(k); repos.push(repo); }
        }
      }
    }
    return repos;
  }

  _events(d) {
    const events = [];
    for (const e of d) {
      const r = e.raw_data || {}, dt = e.data_type || '';
      if (dt === 'event' && r.type) events.push(r);
      if (dt === 'comprehensive_github_profile' && r.events) events.push(...r.events);
    }
    return events;
  }

  _profile(d) {
    for (const e of d) {
      const r = e.raw_data || {}, dt = e.data_type || '';
      if (dt === 'profile' && r.login) return r;
      if (dt === 'comprehensive_github_profile' && r.user) return r.user;
    }
    return null;
  }

  _langStats(d) {
    for (const e of d) {
      if (e.data_type === 'comprehensive_github_profile' && e.raw_data?.languageStats)
        return e.raw_data.languageStats;
    }
    const repos = this._repos(d), counts = {};
    for (const r of repos) if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([language, count]) => ({ language, count }));
  }

  _parseObs(d) {
    const obs = { commitDays: 0, busiestDay: null };
    for (const e of d) {
      const c = e.content || '';
      const cd = c.match(/Committed code on (\d+) day/);
      if (cd) obs.commitDays = Math.max(obs.commitDays, parseInt(cd[1], 10));
      const bd = c.match(/Most active on GitHub on (\w+)s/);
      if (bd) obs.busiestDay = bd[1];
    }
    return obs;
  }

  // ── Feature calculations ──────────────────────────────────────────────────

  calcLanguageDiversity(d) {
    const stats = this._langStats(d), repos = this._repos(d), langs = new Set();
    for (const s of stats) if (s.language) langs.add(s.language);
    for (const r of repos) if (r.language) langs.add(r.language);
    if (langs.size === 0) return null;
    return {
      value: Math.round(Math.min(langs.size / 12, 1) * 10000) / 100,
      rawValue: { unique_languages: langs.size, top_languages: [...langs].slice(0, 5) }
    };
  }

  calcOpenSourceRate(d) {
    const repos = this._repos(d), profile = this._profile(d), events = this._events(d);
    if (repos.length === 0 && !profile) return null;
    const pub = repos.filter(r => !r.private && !r.is_private).length;
    const forks = repos.filter(r => r.fork || r.is_fork).length;
    const total = repos.length || (profile?.public_repos || 0);
    if (total === 0) return null;
    const prs = events.filter(e => e.type === 'PullRequestEvent' && (e.payload?.action === 'opened')).length;
    const score = (pub / total) * 40 + Math.min(forks / 10, 1) * 30 + Math.min(prs / 10, 1) * 30;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { public_repos: pub, forked_repos: forks, total_repos: total, pr_events: prs }
    };
  }

  calcCommitRegularity(d) {
    const obs = this._parseObs(d);
    if (obs.commitDays > 0) {
      return {
        value: Math.round(Math.min(obs.commitDays / 30, 1) * 10000) / 100,
        rawValue: { active_days: obs.commitDays, window_days: 30, source: 'observation' }
      };
    }
    const events = this._events(d), cutoff = Date.now() - 30 * 864e5, days = new Set();
    for (const e of events) {
      if (e.type === 'PushEvent' && e.created_at && new Date(e.created_at).getTime() > cutoff)
        days.add(e.created_at.slice(0, 10));
    }
    if (days.size === 0) return null;
    return {
      value: Math.round(Math.min(days.size / 30, 1) * 10000) / 100,
      rawValue: { active_days: days.size, window_days: 30, source: 'events' }
    };
  }

  calcDocumentation(d) {
    const repos = this._repos(d);
    if (repos.length === 0) return null;
    let desc = 0, topics = 0, home = 0;
    for (const r of repos) {
      if (r.description && r.description.trim().length > 5) desc++;
      if (r.topics && r.topics.length > 0) topics++;
      if (r.homepage && r.homepage.trim().length > 0) home++;
    }
    const t = repos.length;
    const score = (desc / t) * 50 + (topics / t) * 30 + (home / t) * 20;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { total_repos: t, with_description: desc, with_topics: topics, description_pct: Math.round((desc / t) * 100) }
    };
  }

  calcCollaboration(d) {
    const events = this._events(d), repos = this._repos(d);
    if (events.length === 0 && repos.length === 0) return null;
    const pr = events.filter(e => e.type === 'PullRequestEvent').length;
    const rev = events.filter(e => e.type === 'PullRequestReviewEvent').length;
    const ic = events.filter(e => e.type === 'IssueCommentEvent').length;
    const iss = events.filter(e => e.type === 'IssuesEvent').length;
    const forks = repos.filter(r => r.fork || r.is_fork).length;
    const score = Math.min((pr + rev + ic + iss) / 30, 1) * 60 + Math.min(forks / 10, 1) * 40;
    if (score === 0) return null;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { pr_events: pr, review_events: rev, issue_comments: ic, issue_events: iss, forked_repos: forks }
    };
  }

  calcSocialEngagement(d) {
    const profile = this._profile(d), events = this._events(d);
    if (!profile && events.length === 0) return null;
    const followers = profile?.followers || 0, following = profile?.following || 0;
    const stars = events.filter(e => e.type === 'WatchEvent').length;
    const forks = events.filter(e => e.type === 'ForkEvent').length;
    const ratio = followers > 0 ? Math.min(following / followers, 2) : (following > 0 ? 1.5 : 0);
    const score = (ratio / 2) * 30 + Math.min(stars / 20, 1) * 35 + Math.min(forks / 10, 1) * 35;
    if (score === 0 && followers === 0 && following === 0) return null;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { followers, following, star_events: stars, fork_events: forks }
    };
  }

  calcCommitMsgQuality(d) {
    const msgs = [];
    for (const e of d) {
      const r = e.raw_data || {}, dt = e.data_type || '';
      if (dt === 'commit' && r.message) msgs.push(r.message);
      if (dt === 'comprehensive_github_profile' && r.events) {
        for (const ev of r.events)
          if (ev.type === 'PushEvent') for (const c of (ev.payload?.commits || [])) if (c.message) msgs.push(c.message);
      }
      if (dt === 'event' && r.type === 'PushEvent')
        for (const c of (r.payload?.commits || [])) if (c.message) msgs.push(c.message);
      // Parse observation strings for quoted commit messages
      const content = e.content || '';
      const quoted = content.match(/"([^"]{3,80})"/g);
      if (quoted) for (const m of quoted) msgs.push(m.replace(/^"|"$/g, ''));
    }
    if (msgs.length < 3) return null;

    let totalLen = 0, descriptive = 0, conventional = 0;
    const prefixes = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci', 'style', 'build'];
    for (const msg of msgs) {
      const line = msg.split('\n')[0].trim();
      totalLen += line.length;
      if (line.length > 10 && !/^(update|fix|wip|test|merge|initial)$/i.test(line)) descriptive++;
      if (prefixes.some(p => line.toLowerCase().startsWith(`${p}:`) || line.toLowerCase().startsWith(`${p}(`))) conventional++;
    }
    const avg = totalLen / msgs.length;
    const score = Math.min(avg / 50, 1) * 30 + (descriptive / msgs.length) * 40 + (conventional / msgs.length) * 30;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { total_messages: msgs.length, avg_length: Math.round(avg), descriptive_pct: Math.round((descriptive / msgs.length) * 100), conventional_pct: Math.round((conventional / msgs.length) * 100) }
    };
  }

  calcUnusualHours(d) {
    const events = this._events(d), obs = this._parseObs(d);
    const weekendBonus = obs.busiestDay && ['Saturday', 'Sunday'].includes(obs.busiestDay) ? 10 : 0;
    let total = 0, weekend = 0, night = 0;
    for (const e of events) {
      if (!e.created_at) continue;
      total++;
      const dt = new Date(e.created_at);
      if (dt.getDay() === 0 || dt.getDay() === 6) weekend++;
      if (dt.getHours() >= 23 || dt.getHours() < 5) night++;
    }
    if (total === 0 && weekendBonus === 0) return null;
    const wRatio = total > 0 ? weekend / total : 0;
    const nRatio = total > 0 ? night / total : 0;
    const score = Math.min(Math.min(wRatio / 0.5, 1) * 50 + Math.min(nRatio / 0.3, 1) * 50 + weekendBonus, 100);
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { total_events: total, weekend_events: weekend, night_events: night, weekend_pct: total > 0 ? Math.round(wRatio * 100) : 0, night_pct: total > 0 ? Math.round(nRatio * 100) : 0, busiest_day: obs.busiestDay }
    };
  }

  calcProjectDiversity(d) {
    const repos = this._repos(d);
    if (repos.length === 0) return null;
    const cats = new Set();
    const kw = {
      web: ['react', 'vue', 'angular', 'next', 'nuxt', 'svelte', 'html', 'css', 'frontend', 'website', 'dashboard'],
      backend: ['api', 'server', 'express', 'fastapi', 'django', 'flask', 'spring', 'rails', 'backend'],
      mobile: ['android', 'ios', 'react-native', 'flutter', 'swift', 'kotlin', 'mobile', 'expo'],
      ml: ['machine-learning', 'ml', 'ai', 'deep-learning', 'tensorflow', 'pytorch', 'neural', 'nlp', 'llm'],
      data: ['data', 'analytics', 'pipeline', 'etl', 'pandas', 'jupyter', 'visualization'],
      devops: ['docker', 'kubernetes', 'terraform', 'ansible', 'deploy', 'infra', 'devops'],
      cli: ['cli', 'command-line', 'terminal', 'tool', 'utility', 'script'],
      game: ['game', 'unity', 'godot', 'unreal', 'pygame', 'gamedev'],
      library: ['lib', 'library', 'package', 'sdk', 'framework', 'plugin'],
      blockchain: ['blockchain', 'crypto', 'web3', 'solidity', 'defi', 'nft'],
      iot: ['iot', 'raspberry', 'arduino', 'embedded', 'sensor']
    };
    for (const r of repos) {
      const txt = [r.name || '', r.description || '', ...(r.topics || [])].join(' ').toLowerCase();
      for (const [cat, words] of Object.entries(kw)) if (words.some(w => txt.includes(w))) cats.add(cat);
      const lang = (r.language || '').toLowerCase();
      if (['swift', 'kotlin', 'dart'].includes(lang)) cats.add('mobile');
      if (lang === 'jupyter notebook') cats.add('data');
      if (lang === 'solidity') cats.add('blockchain');
    }
    if (cats.size === 0) return null;
    return {
      value: Math.round(Math.min(cats.size / 8, 1) * 10000) / 100,
      rawValue: { categories: [...cats], category_count: cats.size, repos_analyzed: repos.length }
    };
  }

  calcRepoMaintenance(d) {
    const repos = this._repos(d), events = this._events(d);
    if (repos.length === 0 && events.length === 0) return null;
    const cutoff = new Date(Date.now() - this.LOOKBACK_DAYS * 864e5);
    const recent = repos.filter(r => { const p = r.pushed_at || r.updated_at; return p && new Date(p) > cutoff; }).length;
    const ic = events.filter(e => e.type === 'IssueCommentEvent').length;
    const rev = events.filter(e => e.type === 'PullRequestReviewEvent').length;
    const merged = events.filter(e => e.type === 'PullRequestEvent' && e.payload?.action === 'closed' && e.payload?.pull_request?.merged).length;
    const score = (repos.length > 0 ? (recent / repos.length) * 25 : 0) + Math.min(ic / 15, 1) * 25 + Math.min(rev / 10, 1) * 25 + Math.min(merged / 5, 1) * 25;
    if (score === 0) return null;
    return {
      value: Math.round(score * 100) / 100,
      rawValue: { recent_repos: recent, total_repos: repos.length, issue_comments: ic, pr_reviews: rev, merged_prs: merged }
    };
  }

  // ── Standard helpers ──────────────────────────────────────────────────────

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'github',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 70,
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: { raw_value: metadata.raw_value || {} },
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || {}
      }
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };
    log.info(`Saving ${features.length} features to database...`);
    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, { onConflict: 'user_id,platform,feature_type' })
        .select();
      if (error) throw error;
      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };
    } catch (error) {
      log.error('Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

const githubFeatureExtractor = new GitHubFeatureExtractor();
export default githubFeatureExtractor;
