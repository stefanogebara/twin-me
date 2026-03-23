import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

async function testScrapin() {
  const apiKey = process.env.SCRAPIN_API_KEY;
  const linkedInUrl = 'https://www.linkedin.com/in/stefano-gebara-9b2a39197';

  console.log('Testing Scrapin API...');
  console.log('API Key exists:', !!apiKey);

  const params = new URLSearchParams({
    apikey: apiKey,
    linkedInUrl: linkedInUrl
  });

  const response = await fetch(`https://api.scrapin.io/v1/enrichment/profile?${params}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  const data = await response.json();

  console.log('\n=== SCRAPIN RESPONSE ===');
  console.log('Success:', data.success);
  console.log('Credits left:', data.credits_left);

  if (data.person) {
    const p = data.person;
    console.log('\n=== PERSON DATA ===');
    console.log('Name:', p.firstName, p.lastName);
    console.log('Headline:', p.headline);
    console.log('Summary:', p.summary ? p.summary.substring(0, 200) + '...' : 'None');
    console.log('Location:', JSON.stringify(p.location));
    console.log('Industry:', p.industryName);
    console.log('Connections:', p.connectionsCount);
    console.log('Followers:', p.followerCount);

    console.log('\n=== POSITIONS ===');
    console.log('Position count:', p.positions?.positionsCount);
    if (p.positions?.positionHistory?.length > 0) {
      p.positions.positionHistory.forEach((pos, i) => {
        console.log(`\n[${i+1}] ${pos.title} at ${pos.companyName}`);
        console.log('    Dates:', pos.startEndDate?.start?.year, '-', pos.startEndDate?.end?.year || 'Present');
        console.log('    Location:', pos.location);
        if (pos.description) console.log('    Desc:', pos.description.substring(0, 100) + '...');
      });
    } else {
      console.log('No positions found');
    }

    console.log('\n=== EDUCATION ===');
    console.log('Education count:', p.schools?.educationsCount);
    if (p.schools?.educationHistory?.length > 0) {
      p.schools.educationHistory.forEach((edu, i) => {
        console.log(`\n[${i+1}] ${edu.schoolName}`);
        console.log('    Degree:', edu.degreeName);
        console.log('    Field:', edu.fieldOfStudy);
        console.log('    Dates:', edu.startEndDate?.start?.year, '-', edu.startEndDate?.end?.year);
      });
    } else {
      console.log('No education found');
    }

    console.log('\n=== SKILLS ===');
    if (p.skills?.length > 0) {
      console.log('Skills:', p.skills.join(', '));
    } else {
      console.log('No skills found');
    }

    console.log('\n=== CERTIFICATIONS ===');
    if (p.certifications?.length > 0) {
      p.certifications.forEach(cert => console.log('-', cert.name));
    } else {
      console.log('No certifications found');
    }

    console.log('\n=== LANGUAGES ===');
    if (p.languages?.length > 0) {
      p.languages.forEach(lang => console.log('-', lang.name, ':', lang.proficiency));
    } else {
      console.log('No languages found');
    }
  }
}

testScrapin().catch(console.error);
