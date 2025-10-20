/**
 * Script to patch all extractors with proper error handling
 * Adds failExtractionJob method and updates extractAll to handle errors properly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extractorsDir = path.join(__dirname, '..', 'services', 'extractors');

// The failExtractionJob method to add
const failMethodCode = `
  /**
   * Mark extraction job as failed
   */
  async failExtractionJob(jobId, errorMessage) {
    try {
      await supabase
        .from('data_extraction_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage
        })
        .eq('id', jobId);
    } catch (error) {
      console.error(\`[\${this.platform || 'Extractor'}] Error marking job as failed:\`, error);
      // Don't throw - we're already in error handling
    }
  }`;

// List of extractors to patch
const extractors = [
  'youtubeExtractor.js',
  'gmailExtractor.js',
  'calendarExtractor.js',
  'githubExtractor.js',
  'discordExtractor.js',
  'linkedinExtractor.js',
  'redditExtractor.js',
  'slackExtractor.js'
];

function patchExtractor(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\nPatching ${fileName}...`);

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Check if failExtractionJob already exists
  if (!content.includes('failExtractionJob')) {
    console.log(`  ✅ Adding failExtractionJob method`);

    // Find the position before the closing brace of the class
    const classEndMatch = content.match(/}\s*\n\s*export default/);
    if (classEndMatch) {
      const insertPosition = content.lastIndexOf('}', classEndMatch.index);
      content = content.slice(0, insertPosition) + failMethodCode + '\n' + content.slice(insertPosition);
      modified = true;
    }
  }

  // Update extractAll method to include error handling
  const extractAllPattern = /async extractAll\([^)]*\)\s*{([^}]|{[^}]*})*}/;
  const extractAllMatch = content.match(extractAllPattern);

  if (extractAllMatch && !extractAllMatch[0].includes('failExtractionJob')) {
    console.log(`  ✅ Updating extractAll method with error handling`);

    const oldMethod = extractAllMatch[0];

    // Check if it already has try-catch
    if (!oldMethod.includes('let job = null;')) {
      // Transform the method to include proper error handling
      const newMethod = oldMethod
        .replace(/(\s*try\s*{)/, '\n    let job = null;\n    try {')
        .replace(/(catch\s*\(error\)\s*{[^}]*})/,
          `catch (error) {
      console.error('[${fileName.replace('Extractor.js', '')}] Extraction error:', error);

      // Mark the job as failed if it was created
      if (job && job.id) {
        await this.failExtractionJob(job.id, error.message || 'Unknown error occurred');
      }

      throw error;
    }`);

      content = content.replace(oldMethod, newMethod);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Patched successfully!`);
  } else {
    console.log(`  ⏭️  Already patched or doesn't need patching`);
  }
}

console.log('🔧 Patching extractors with proper error handling...\n');

for (const extractor of extractors) {
  const filePath = path.join(extractorsDir, extractor);

  if (fs.existsSync(filePath)) {
    try {
      patchExtractor(filePath);
    } catch (error) {
      console.error(`  ❌ Error patching ${extractor}:`, error.message);
    }
  } else {
    console.log(`  ⚠️  ${extractor} not found`);
  }
}

console.log('\n✅ Patching complete!');