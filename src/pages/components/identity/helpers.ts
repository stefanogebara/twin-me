export function stripCitations(text: string): string {
  return text
    .replace(/\[Memory\s*#?\d+\]/gi, '')
    .replace(/\[Source:\s*[^\]]*\]/gi, '')
    .replace(/\[Based on[^\]]*\]/gi, '')
    .replace(/\[Ref\s*#?\d+\]/gi, '')
    .replace(/\[Note:\s*[^\]]*\]/gi, '')
    .replace(/\[Evidence[^\]]*\]/gi, '')
    .replace(/\[mem\s*#?\d+\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function stripLeadingBullet(text: string): string {
  return text.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim();
}

export function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const bg = new Set<string>();
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) bg.add(lower.slice(i, i + 2));
    return bg;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size) || 0;
}

export function cleanBullets(bullets: string[]): string[] {
  const cleaned: string[] = [];
  for (const raw of bullets) {
    const text = stripCitations(stripLeadingBullet(raw));
    if (!text) continue;
    const isDuplicate = cleaned.some((existing) => bigramSimilarity(existing, text) > 0.75);
    if (isDuplicate) continue;
    cleaned.push(text);
  }
  return cleaned;
}
