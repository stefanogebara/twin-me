/**
 * Demo LinkedIn Data
 * Professional profile and career context for demo mode
 */

export interface DemoLinkedInData {
  headline: string;
  industry: string;
  locale: string;
  connectionCount: number;
  skills: string[];
}

export interface DemoLinkedInInsights {
  success: boolean;
  reflection: {
    id: string;
    text: string;
    generatedAt: string;
    expiresAt: string | null;
    confidence: 'high' | 'medium' | 'low';
    themes: string[];
  };
  patterns: { id: string; text: string; occurrences: 'often' | 'sometimes' | 'noticed' }[];
  history: { id: string; text: string; generatedAt: string }[];
  evidence: { id: string; observation: string; dataPoints: string[]; confidence: 'high' | 'medium' | 'low' }[];
  linkedinHeadline: string;
  linkedinIndustry: string;
  linkedinLocale: string;
  linkedinSkills: string[];
  linkedinConnectionCount: number;
}

export function getDemoLinkedInData(): DemoLinkedInData {
  return {
    headline: 'Software Engineer & Product Builder',
    industry: 'Technology',
    locale: 'BR',
    connectionCount: 340,
    skills: ['TypeScript', 'React', 'Node.js', 'Product Strategy', 'System Design'],
  };
}

export function getDemoLinkedInInsights(): DemoLinkedInInsights {
  const data = getDemoLinkedInData();
  return {
    success: true,
    reflection: {
      id: 'demo-linkedin-reflection-1',
      text:
        "Your professional identity sits at the intersection of engineering and product thinking. The 'builder' framing in your headline signals someone who values shipping and creating, not just contributing to a spec. Your skills span both deep technical work and strategic product sense — this breadth is a real signal. It often correlates with entrepreneurial ambition or a desire to own outcomes end-to-end rather than execute in a narrow lane.",
      generatedAt: new Date().toISOString(),
      expiresAt: null,
      confidence: 'high',
      themes: ['ambition', 'craft', 'ownership'],
    },
    patterns: [
      {
        id: 'linkedin-pattern-1',
        text: 'The combination of engineering and product skills suggests you prefer roles where you can influence both what gets built and how — you get frustrated when separated from the full picture.',
        occurrences: 'often',
      },
      {
        id: 'linkedin-pattern-2',
        text: "Being based in Brazil while working in global tech communities puts you at an interesting intersection — local context with international ambition.",
        occurrences: 'sometimes',
      },
      {
        id: 'linkedin-pattern-3',
        text: 'Your skill set skews toward modern, high-velocity tooling — TypeScript, React, Node.js — signaling a preference for building fast and iterating.',
        occurrences: 'noticed',
      },
    ],
    history: [
      {
        id: 'linkedin-history-1',
        text: 'The overlap between your technical background and product curiosity is consistent across your professional signals — this is a defining characteristic, not a phase.',
        generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    evidence: [
      {
        id: 'linkedin-evidence-1',
        observation: `Professional headline frames identity as both engineer and builder`,
        dataPoints: [
          `Headline: "${data.headline}"`,
          `Industry: ${data.industry}`,
          `Key skills: ${data.skills.slice(0, 3).join(', ')}`,
        ],
        confidence: 'high',
      },
    ],
    linkedinHeadline: data.headline,
    linkedinIndustry: data.industry,
    linkedinLocale: data.locale,
    linkedinSkills: data.skills,
    linkedinConnectionCount: data.connectionCount,
  };
}
