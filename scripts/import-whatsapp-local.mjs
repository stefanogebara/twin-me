/**
 * import-whatsapp-local.mjs
 * -------------------------
 * Bypasses the broken UI upload path. Reads WhatsApp .txt/.zip exports from disk
 * and ingests them directly via `ingestChatHistory` (same pipeline the production
 * API calls, but with no Vercel 55s timeout and no Supabase Storage round-trip).
 *
 * Usage:
 *   node scripts/import-whatsapp-local.mjs
 *
 * Edit the JOBS array below to map files → chatContext.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ingestChatHistory } from '../api/services/chatHistory/chatHistoryIngestion.js';

const USER_ID = process.env.IMPORT_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const OWNER_NAME = process.env.IMPORT_OWNER_NAME || 'Stefano Gebara';

const JOBS = [
  {
    file: 'C:\\Users\\stefa\\Downloads\\WhatsApp Chat with Gabriel\\WhatsApp Chat with Gabriel.txt',
    chatContext: 'close_friend',
    chatName: 'Gabriel',
  },
  {
    file: 'C:\\Users\\stefa\\Downloads\\WhatsApp Chat with Henrique\\WhatsApp Chat with Henrique Vaz.txt',
    chatContext: 'close_friend',
    chatName: 'Henrique Vaz',
  },
  // Dionisio AMAZO: vendor group chat where user didn't send any messages —
  // parser returns owner_sent: 0. Left here for reference.
  // {
  //   file: 'C:\\Users\\stefa\\Downloads\\WhatsApp Chat with Dionisio AMAZO\\WhatsApp Chat with Dionisio AMAZO.txt',
  //   chatContext: 'professional',
  //   chatName: 'Dionisio AMAZO',
  // },
];

async function runJob({ file, chatContext, chatName }) {
  console.log(`\n=== ${chatName} (${chatContext}) ===`);
  console.log(`File: ${file}`);

  if (!fs.existsSync(file)) {
    console.error(`  SKIP: file not found`);
    return { skipped: true };
  }

  const stat = fs.statSync(file);
  console.log(`  Size: ${(stat.size / 1024).toFixed(1)} KB`);

  const buf = fs.readFileSync(file);
  const started = Date.now();

  try {
    const result = await ingestChatHistory(USER_ID, buf, 'whatsapp_chat', {
      ownerName: OWNER_NAME,
      chatName,
      chatContext,
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`  DONE in ${elapsed}s`);
    console.log(`  ${JSON.stringify({
      memoriesStored: result.memoriesStored,
      factsStored: result.factsStored,
      parseStats: result.parseStats,
      processStats: result.processStats,
    }, null, 2)}`);
    return result;
  } catch (err) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`  FAILED after ${elapsed}s:`, err.message);
    console.error(err.stack);
    return { error: err.message };
  }
}

(async () => {
  console.log(`User:  ${USER_ID}`);
  console.log(`Owner: ${OWNER_NAME}`);
  console.log(`Jobs:  ${JOBS.length}`);

  const results = [];
  for (const job of JOBS) {
    const res = await runJob(job);
    results.push({ job, res });
  }

  console.log('\n=== SUMMARY ===');
  for (const { job, res } of results) {
    const status = res.error ? 'ERR ' : res.skipped ? 'SKIP' : 'OK  ';
    const detail = res.error
      ? res.error
      : res.skipped
      ? 'file not found'
      : `${res.memoriesStored ?? 0} memories, ${res.factsStored ?? 0} facts`;
    console.log(`  [${status}] ${job.chatName.padEnd(15)} ${detail}`);
  }
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
