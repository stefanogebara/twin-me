import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

async function testAllScrapinEndpoints() {
  const apiKey = process.env.SCRAPIN_API_KEY;
  const linkedInUrl = 'https://www.linkedin.com/in/stefano-gebara-9b2a39197';
  const email = 'stefanogebara@gmail.com';

  console.log('=== TESTING ALL SCRAPIN ENDPOINTS ===\n');

  // Test 1: Profile endpoint with different parameters
  console.log('--- TEST 1: Profile Endpoint ---');
  const profileParams = new URLSearchParams({
    apikey: apiKey,
    linkedInUrl: linkedInUrl
  });

  const profileRes = await fetch(`https://api.scrapin.io/v1/enrichment/profile?${profileParams}`);
  const profileData = await profileRes.json();
  console.log('Profile endpoint response:');
  console.log('- Success:', profileData.success);
  console.log('- Positions count:', profileData.person?.positions?.positionsCount);
  console.log('- Education count:', profileData.person?.schools?.educationsCount);
  console.log('- Has skills:', profileData.person?.skills?.length > 0);

  // Test 2: Email endpoint
  console.log('\n--- TEST 2: Email Endpoint ---');
  const emailParams = new URLSearchParams({
    apikey: apiKey,
    email: email
  });

  const emailRes = await fetch(`https://api.scrapin.io/v1/enrichment/email?${emailParams}`);
  const emailData = await emailRes.json();
  console.log('Email endpoint response:');
  console.log('- Success:', emailData.success);
  if (emailData.person) {
    console.log('- Found name:', emailData.person.firstName, emailData.person.lastName);
    console.log('- Positions count:', emailData.person?.positions?.positionsCount);
    console.log('- Education count:', emailData.person?.schools?.educationsCount);
  } else {
    console.log('- No person data found');
  }

  // Test 3: Check what fields ARE populated
  console.log('\n--- TEST 3: All Populated Fields ---');
  if (profileData.person) {
    const p = profileData.person;
    const populated = [];
    const empty = [];

    for (const [key, value] of Object.entries(p)) {
      if (value === null || value === undefined ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && value !== null && Object.keys(value).length === 0)) {
        empty.push(key);
      } else if (typeof value === 'object' && value !== null) {
        // Check nested objects
        if (value.positionsCount === 0 || value.educationsCount === 0 ||
            value.certificationsCount === 0 || value.recommendationsCount === 0) {
          empty.push(key);
        } else {
          populated.push(key);
        }
      } else {
        populated.push(key);
      }
    }

    console.log('POPULATED fields:', populated.join(', '));
    console.log('EMPTY fields:', empty.join(', '));
  }

  // Test 4: Raw positions/schools data
  console.log('\n--- TEST 4: Raw Positions & Schools Data ---');
  console.log('positions object:', JSON.stringify(profileData.person?.positions, null, 2));
  console.log('schools object:', JSON.stringify(profileData.person?.schools, null, 2));

  // Test 5: Check if there's a "complete" or "full" parameter
  console.log('\n--- TEST 5: Profile with additional params ---');
  const fullParams = new URLSearchParams({
    apikey: apiKey,
    linkedInUrl: linkedInUrl,
    include: 'all'  // Try this param
  });

  const fullRes = await fetch(`https://api.scrapin.io/v1/enrichment/profile?${fullParams}`);
  const fullData = await fullRes.json();
  console.log('With include=all:');
  console.log('- Positions count:', fullData.person?.positions?.positionsCount);
  console.log('- Education count:', fullData.person?.schools?.educationsCount);
}

testAllScrapinEndpoints().catch(console.error);
