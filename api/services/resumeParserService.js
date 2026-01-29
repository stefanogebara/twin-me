/**
 * Resume Parser Service
 *
 * Extracts structured data from resumes/CVs using AI
 * Supports PDF and text-based formats
 */

import Anthropic from '@anthropic-ai/sdk';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';

class ResumeParserService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Parse a resume file and extract structured data
   * @param {Buffer|string} fileContent - File content (buffer for PDF, string for text)
   * @param {string} fileType - 'pdf', 'txt', or 'text'
   * @param {string} userName - User's name for context
   * @returns {Promise<Object>} Extracted resume data
   */
  async parseResume(fileContent, fileType, userName = null) {
    console.log(`[ResumeParser] Parsing resume, type: ${fileType}`);

    let textContent;

    // Extract text from PDF if needed
    if (fileType === 'pdf') {
      try {
        const pdfData = await pdf(fileContent);
        textContent = pdfData.text;
        console.log(`[ResumeParser] Extracted ${textContent.length} chars from PDF`);
      } catch (error) {
        console.error('[ResumeParser] PDF parsing failed:', error);
        throw new Error('Failed to parse PDF file');
      }
    } else {
      textContent = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf-8');
    }

    // Use Claude to extract structured data
    const extractedData = await this.extractWithAI(textContent, userName);

    return extractedData;
  }

  /**
   * Extract structured data from resume text using Claude
   */
  async extractWithAI(resumeText, userName) {
    const prompt = `You are an expert resume parser. Extract ALL information from this resume into a structured JSON format.

RESUME TEXT:
${resumeText}

${userName ? `The person's name is: ${userName}` : ''}

Extract and return a JSON object with these fields (use null for missing data, empty arrays for sections with no data):

{
  "personal": {
    "name": "Full name",
    "email": "Email address",
    "phone": "Phone number",
    "location": "City, Country",
    "nationality": "Nationality if mentioned",
    "languages": ["Language 1 (proficiency)", "Language 2 (proficiency)"],
    "linkedin_url": "LinkedIn URL if present",
    "github_url": "GitHub URL if present",
    "website": "Personal website if present",
    "summary": "Professional summary or objective"
  },
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "location": "City, Country",
      "start_date": "Month Year",
      "end_date": "Month Year or Present",
      "description": "Full description of responsibilities and achievements",
      "highlights": ["Key achievement 1", "Key achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "Degree type (Bachelor's, Master's, MBA, etc.)",
      "field": "Field of study",
      "institution": "University/School name",
      "location": "City, Country",
      "start_date": "Year or Month Year",
      "end_date": "Year or Month Year",
      "gpa": "GPA if mentioned",
      "honors": "Honors, distinctions, awards",
      "activities": ["Club 1", "Activity 2"]
    }
  ],
  "skills": {
    "technical": ["Skill 1", "Skill 2"],
    "tools": ["Tool 1", "Tool 2"],
    "soft_skills": ["Skill 1", "Skill 2"],
    "other": ["Other skill 1"]
  },
  "certifications": [
    {
      "name": "Certification name",
      "issuer": "Issuing organization",
      "date": "Date obtained",
      "expiry": "Expiry date if applicable"
    }
  ],
  "projects": [
    {
      "name": "Project name",
      "description": "Project description",
      "technologies": ["Tech 1", "Tech 2"],
      "url": "Project URL if present"
    }
  ],
  "publications": [
    {
      "title": "Publication title",
      "venue": "Journal/Conference name",
      "date": "Publication date",
      "url": "URL if present"
    }
  ],
  "awards": [
    {
      "name": "Award name",
      "issuer": "Issuing organization",
      "date": "Date received",
      "description": "Brief description"
    }
  ],
  "volunteer": [
    {
      "role": "Role title",
      "organization": "Organization name",
      "start_date": "Start date",
      "end_date": "End date",
      "description": "Description"
    }
  ],
  "interests": ["Interest 1", "Interest 2"]
}

IMPORTANT:
- Extract EVERY piece of information, don't skip anything
- For dates, use the format exactly as written in the resume
- For descriptions, include the FULL text, don't summarize
- Include ALL bullet points and achievements
- If a section is empty, use an empty array []
- Return ONLY the JSON object, no other text`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ResumeParser] No JSON found in response');
        throw new Error('Failed to extract structured data from resume');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[ResumeParser] Successfully extracted resume data');

      return {
        success: true,
        data: parsed,
        raw_text: resumeText.substring(0, 1000) + '...' // Store preview of raw text
      };
    } catch (error) {
      console.error('[ResumeParser] AI extraction failed:', error);
      return {
        success: false,
        error: error.message,
        raw_text: resumeText.substring(0, 500)
      };
    }
  }

  /**
   * Merge resume data with existing enrichment data
   */
  mergeWithEnrichment(enrichmentData, resumeData) {
    if (!resumeData?.data) return enrichmentData;

    const resume = resumeData.data;
    const merged = { ...enrichmentData };

    // Merge personal info
    if (resume.personal) {
      merged.discovered_name = merged.discovered_name || resume.personal.name;
      merged.discovered_location = merged.discovered_location || resume.personal.location;
      merged.discovered_bio = merged.discovered_bio || resume.personal.summary;
      merged.languages = resume.personal.languages;
      merged.github_url = resume.personal.github_url;
      merged.website = resume.personal.website;
    }

    // Build career timeline from experience
    if (resume.experience && resume.experience.length > 0) {
      merged.career_timeline = resume.experience.map(exp => {
        const dateRange = exp.end_date ? `${exp.start_date} - ${exp.end_date}` : `${exp.start_date} - Present`;
        const location = exp.location ? ` (${exp.location})` : '';
        const highlights = exp.highlights?.length > 0 ? `\n  Key achievements: ${exp.highlights.join('; ')}` : '';
        return `${exp.title} at ${exp.company}${location} [${dateRange}]\n  ${exp.description}${highlights}`;
      }).join('\n\n');

      // Set current role from most recent experience
      if (!merged.discovered_title) {
        merged.discovered_title = resume.experience[0].title;
      }
      if (!merged.discovered_company) {
        merged.discovered_company = resume.experience[0].company;
      }
    }

    // Build education string
    if (resume.education && resume.education.length > 0) {
      merged.education = resume.education.map(edu => {
        const degree = edu.degree ? `${edu.degree}` : '';
        const field = edu.field ? ` in ${edu.field}` : '';
        const dates = edu.end_date ? ` (${edu.start_date} - ${edu.end_date})` : ` (${edu.start_date})`;
        const honors = edu.honors ? ` - ${edu.honors}` : '';
        const gpa = edu.gpa ? ` - GPA: ${edu.gpa}` : '';
        return `${degree}${field} at ${edu.institution}${dates}${honors}${gpa}`;
      }).join('\n');
    }

    // Merge skills
    if (resume.skills) {
      const allSkills = [
        ...(resume.skills.technical || []),
        ...(resume.skills.tools || []),
        ...(resume.skills.soft_skills || []),
        ...(resume.skills.other || [])
      ];
      merged.skills = allSkills.join(', ');
    }

    // Merge certifications
    if (resume.certifications && resume.certifications.length > 0) {
      merged.certifications = resume.certifications.map(cert =>
        `${cert.name} (${cert.issuer}${cert.date ? `, ${cert.date}` : ''})`
      ).join('\n');
    }

    // Merge projects
    if (resume.projects && resume.projects.length > 0) {
      merged.projects = resume.projects.map(proj =>
        `${proj.name}: ${proj.description}${proj.technologies?.length > 0 ? ` [${proj.technologies.join(', ')}]` : ''}`
      ).join('\n');
    }

    // Store full resume data for reference
    merged.resume_data = resume;
    merged.resume_source = 'cv_upload';

    return merged;
  }

  /**
   * Generate a narrative from resume data
   */
  async generateNarrativeFromResume(resumeData, name) {
    if (!resumeData?.data) return null;

    const resume = resumeData.data;
    const dataPoints = [];

    // Build data points for narrative
    if (name || resume.personal?.name) {
      dataPoints.push(`Full name: ${name || resume.personal.name}`);
    }

    if (resume.personal?.summary) {
      dataPoints.push(`Professional summary: ${resume.personal.summary}`);
    }

    if (resume.experience?.length > 0) {
      const expSummary = resume.experience.map(e =>
        `${e.title} at ${e.company} (${e.start_date} - ${e.end_date || 'Present'})`
      ).join('; ');
      dataPoints.push(`Work experience: ${expSummary}`);
    }

    if (resume.education?.length > 0) {
      const eduSummary = resume.education.map(e =>
        `${e.degree || 'Degree'}${e.field ? ` in ${e.field}` : ''} from ${e.institution} (${e.end_date || e.start_date})`
      ).join('; ');
      dataPoints.push(`Education: ${eduSummary}`);
    }

    if (resume.skills?.technical?.length > 0) {
      dataPoints.push(`Technical skills: ${resume.skills.technical.join(', ')}`);
    }

    if (resume.personal?.languages?.length > 0) {
      dataPoints.push(`Languages: ${resume.personal.languages.join(', ')}`);
    }

    if (resume.personal?.location) {
      dataPoints.push(`Location: ${resume.personal.location}`);
    }

    return dataPoints;
  }
}

export const resumeParserService = new ResumeParserService();
export default resumeParserService;
