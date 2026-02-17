/**
 * Direct API test for stefanogebara@gmail.com enrichment.
 * Bypasses Playwright — just calls the enrichment API and logs results.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'api', '.env') });

const API_URL = 'http://localhost:3004/api';
const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const EMAIL = 'stefanogebara@gmail.com';
const NAME = 'Stefano Gebara';

const TOKEN = jwt.sign(
  { id: USER_ID, email: EMAIL, userId: USER_ID },
  process.env.JWT_SECRET,
  { expiresIn: '2h' }
);

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

function log(msg, type = 'info') {
  const prefix = { info: 'i', success: '+', error: 'x', warning: '!' }[type] || ' ';
  console.log(`[${new Date().toLocaleTimeString()}][${prefix}] ${msg}`);
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('  ENRICHMENT API TEST — Stefano Gebara');
  console.log('='.repeat(60) + '\n');

  // Step 1: Clear existing data
  log('Clearing existing enrichment data...');
  try {
    const clearRes = await fetch(`${API_URL}/enrichment/clear/${USER_ID}`, {
      method: 'DELETE', headers,
    });
    log(`Clear: ${clearRes.status} ${clearRes.statusText}`, clearRes.ok ? 'success' : 'warning');
  } catch (e) {
    log(`Clear failed: ${e.message}`, 'warning');
  }

  // Step 2: Run enrichment search
  log('Running /enrichment/search...');
  const start = Date.now();
  try {
    const res = await fetch(`${API_URL}/enrichment/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: USER_ID, email: EMAIL, name: NAME }),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`Search: ${res.status} in ${elapsed}s`, res.ok ? 'success' : 'error');

    const data = await res.json();

    if (data.data) {
      const d = data.data;
      console.log('\n--- Career Fields ---');
      const careerFields = ['discovered_name', 'discovered_company', 'discovered_title',
        'discovered_location', 'discovered_linkedin_url', 'discovered_twitter_url',
        'discovered_github_url', 'discovered_bio', 'discovered_summary',
        'career_timeline', 'education', 'achievements', 'skills'];
      for (const f of careerFields) {
        if (d[f]) {
          const val = typeof d[f] === 'string' ? d[f].substring(0, 120) : JSON.stringify(d[f]).substring(0, 120);
          log(`${f}: ${val}`, 'success');
        }
      }

      console.log('\n--- Personal Fields ---');
      const personalFields = ['interests_and_hobbies', 'causes_and_values', 'notable_quotes',
        'public_appearances', 'personality_traits', 'life_story',
        'social_media_presence', 'discovered_instagram_url', 'discovered_personal_website'];
      let found = 0;
      for (const f of personalFields) {
        if (d[f]) {
          const val = typeof d[f] === 'string' ? d[f].substring(0, 120) : JSON.stringify(d[f]).substring(0, 120);
          log(`${f}: ${val}`, 'success');
          found++;
        }
      }
      log(`Personal: ${found}/${personalFields.length}`, found > 0 ? 'success' : 'warning');

      console.log('\n--- Source ---');
      log(`source: ${d.source || 'unknown'}`, 'info');
      log(`hasResults: ${data.hasResults}`, 'info');
    } else {
      log('No data in response', 'warning');
      log(`Response: ${JSON.stringify(data).substring(0, 300)}`, 'info');
    }
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`Search failed after ${elapsed}s: ${e.message}`, 'error');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

run().catch(console.error);
