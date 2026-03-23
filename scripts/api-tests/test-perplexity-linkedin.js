import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

async function testPerplexityLinkedIn() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const linkedInUrl = 'https://www.linkedin.com/in/stefano-gebara-9b2a39197';
  const name = 'Stefano Gebara';

  console.log('=== TESTING PERPLEXITY LINKEDIN SCRAPE ===\n');

  const query = `Go to this LinkedIn profile and extract ALL information: ${linkedInUrl}

I need you to visit this profile page and tell me EXACTLY what you see in these sections:

1. EXPERIENCE SECTION - List every job/internship with:
   - Job title
   - Company name
   - Date range
   - Description

2. EDUCATION SECTION - List every school with:
   - School name
   - Degree
   - Field of study
   - Dates

3. SKILLS SECTION - List all skills

4. ABOUT SECTION - Full text

5. LICENSES & CERTIFICATIONS - List all

6. PROJECTS - List all projects

7. COURSES - List all courses

8. LANGUAGES - List all languages

If you cannot access LinkedIn directly, search the web for "${name}" and find their:
- GitHub profile
- Personal website
- Any company pages mentioning them
- University directory listings
- Hackathon results
- News articles

Return ALL data you find in a structured format.`;

  console.log('Sending query to Perplexity...\n');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://twinme.app'
    },
    body: JSON.stringify({
      model: 'perplexity/sonar-pro',
      messages: [{ role: 'user', content: query }],
      temperature: 0.2,
      max_tokens: 8000
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || 'No response';

  console.log('=== PERPLEXITY RESPONSE ===\n');
  console.log(content);
}

testPerplexityLinkedIn().catch(console.error);
