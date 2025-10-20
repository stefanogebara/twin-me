/**
 * Automated script to fix Supabase lazy initialization in all services
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'api', 'services');

// Services to fix
const servicesToFix = [
  'behavioralEmbeddingService.js',
  'dataExtractionService.js',
  'discordExtraction.js',
  'embeddingGenerator.js',
  'githubExtraction.js',
  'hybridMonitoringManager.js',
  'mcpIntegration.js',
  'patternDetectionEngine.js',
  'ragService.js',
  'redditExtraction.js',
  'soulObserverAIAnalyzer.js',
  'soulObserverLLMContext.js',
  'soulSignatureBuilder.js',
  'spotifyExtraction.js',
  'sseService.js',
  'stylometricAnalyzer.js',
  'textProcessor.js',
  'tokenRefresh.js',
  'webhookReceiverService.js',
  'youtubeExtraction.js'
];

const lazyInitPattern = `// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}`;

function fixService(filename) {
  const filepath = path.join(servicesDir, filename);

  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  Skipping ${filename} - file not found`);
    return;
  }

  let content = fs.readFileSync(filepath, 'utf8');
  const originalContent = content;

  // Pattern 1: Fix the const supabase = createClient(...) declaration
  // Handles multiple variations:
  // - process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  // - process.env.VITE_SUPABASE_URL
  // - Multiline declarations
  const constPattern = /const supabase = createClient\(\s*(?:process\.env\.SUPABASE_URL \|\| )?process\.env\.(VITE_)?SUPABASE_URL,?\s*process\.env\.SUPABASE_(SERVICE_ROLE_KEY|ANON_KEY)\s*\);?/gs;

  if (constPattern.test(content)) {
    content = content.replace(constPattern, lazyInitPattern);
    console.log(`✅ ${filename}: Replaced const declaration with lazy init`);
  }

  // Pattern 2: Replace "await supabase." with "await getSupabaseClient()."
  const awaitSupabasePattern = /await supabase\./g;
  if (awaitSupabasePattern.test(content)) {
    const matches = content.match(awaitSupabasePattern);
    content = content.replace(awaitSupabasePattern, 'await getSupabaseClient().');
    console.log(`✅ ${filename}: Replaced ${matches.length} "await supabase." calls`);
  }

  // Pattern 3: Replace "supabase.from" with "getSupabaseClient().from" (for non-await cases)
  const supabaseFromPattern = /([^t\s])supabase\.from/g;
  if (supabaseFromPattern.test(content)) {
    const matches = content.match(supabaseFromPattern);
    content = content.replace(supabaseFromPattern, '$1getSupabaseClient().from');
    console.log(`✅ ${filename}: Replaced ${matches.length} "supabase.from" calls`);
  }

  // Pattern 4: Replace other supabase. patterns
  const otherSupabasePattern = /([^t\s])supabase\.(auth|storage|rpc|channel)/g;
  if (otherSupabasePattern.test(content)) {
    const matches = content.match(otherSupabasePattern);
    content = content.replace(otherSupabasePattern, '$1getSupabaseClient().$2');
    console.log(`✅ ${filename}: Replaced ${matches.length} other supabase calls`);
  }

  // Only write if content changed
  if (content !== originalContent) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`💾 ${filename}: File updated\n`);
  } else {
    console.log(`⚠️  ${filename}: No changes needed\n`);
  }
}

console.log('🔧 Starting Supabase lazy initialization fix...\n');

servicesToFix.forEach(fixService);

console.log('✅ All services processed!');
