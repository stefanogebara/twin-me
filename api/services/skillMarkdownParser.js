/**
 * Skill Markdown Parser — Import/Export Skills as Markdown
 * ==========================================================
 * Inspired by OpenClaw SKILL.md format. Allows community-friendly
 * skill definitions that can be shared, imported, and versioned.
 *
 * Format:
 *   ---
 *   name: morning_briefing
 *   description: Personalized daily briefing at wake time
 *   category: daily_rituals
 *   trigger_type: cron
 *   default_autonomy_level: 3
 *   required_tools: [calendar_today, whoop_recovery]
 *   ---
 *
 *   # Morning Briefing
 *
 *   ## Steps
 *   1. Check calendar for today
 *   2. Get health metrics
 *   3. Compose personalized briefing
 *
 *   ## Personality
 *   Use serotonergic mode (warm, supportive)
 */

/**
 * Parse a SKILL.md markdown string into a skill definition object.
 * @param {string} markdown
 * @returns {object|null} Parsed skill definition or null on failure
 */
export function parseSkillMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return null;

  // Extract YAML frontmatter between --- delimiters
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  // Simple YAML parser (key: value pairs, arrays as [a, b, c])
  const meta = {};
  for (const line of frontmatter.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    let value = rawValue.trim();

    // Parse arrays: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    // Parse numbers
    else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    // Parse booleans
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;

    meta[key] = value;
  }

  if (!meta.name || !meta.description) return null;

  return {
    name: meta.name,
    description: meta.description,
    category: meta.category || 'custom',
    trigger_type: meta.trigger_type || null,
    trigger_spec: meta.trigger_spec ? JSON.parse(meta.trigger_spec) : null,
    actions: { instructions: body },
    required_tools: Array.isArray(meta.required_tools) ? meta.required_tools : [],
    default_autonomy_level: meta.default_autonomy_level ?? 1,
    is_system: false,
  };
}

/**
 * Serialize a DB skill definition row into SKILL.md markdown format.
 * @param {object} skill - Row from skill_definitions table
 * @returns {string} Markdown string
 */
export function serializeToMarkdown(skill) {
  const lines = ['---'];
  lines.push(`name: ${skill.name}`);
  lines.push(`description: ${skill.description}`);
  lines.push(`category: ${skill.category}`);
  if (skill.trigger_type) lines.push(`trigger_type: ${skill.trigger_type}`);
  lines.push(`default_autonomy_level: ${skill.default_autonomy_level}`);
  if (skill.required_tools?.length > 0) {
    lines.push(`required_tools: [${skill.required_tools.join(', ')}]`);
  }
  lines.push('---');
  lines.push('');

  // Extract body from actions
  const body = skill.actions?.instructions || skill.actions?.description || JSON.stringify(skill.actions, null, 2);
  lines.push(`# ${skill.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
  lines.push('');
  lines.push(body);

  return lines.join('\n');
}
