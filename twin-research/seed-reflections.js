/**
 * Seed reflections for the test user to improve diversity in twin_quality_score.
 * Run once to bootstrap the reflection layer before continuing the research loop.
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { seedReflections } from '../api/services/reflectionEngine.js';

const TEST_USER_ID = process.env.TEST_TWIN_USER_ID || '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

console.log(`Seeding reflections for user ${TEST_USER_ID}...`);
console.log('This runs all 5 expert personas against existing memories.');
console.log('Expected: 10-15 new reflection memories created.\n');

const count = await seedReflections(TEST_USER_ID);
console.log(`\nDone. Reflections generated: ${count}`);
process.exit(0);
