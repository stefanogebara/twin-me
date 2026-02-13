import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

async function testScrapinFull() {
  const apiKey = process.env.SCRAPIN_API_KEY;
  const linkedInUrl = 'https://www.linkedin.com/in/stefano-gebara-9b2a39197';

  console.log('Testing Scrapin API - FULL RAW RESPONSE...\n');

  const params = new URLSearchParams({
    apikey: apiKey,
    linkedInUrl: linkedInUrl
  });

  const response = await fetch(`https://api.scrapin.io/v1/enrichment/profile?${params}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  const data = await response.json();

  // Print the ENTIRE response to see all available fields
  console.log('=== FULL RAW RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
}

testScrapinFull().catch(console.error);
