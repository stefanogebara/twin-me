import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert third-person reflection text to second-person for display.
 * Existing reflections in the DB were sometimes written as "This person..." or "They...".
 * This transform makes them read naturally as "You..." / "Your..." for the user.
 */
export function toSecondPerson(text: string): string {
  return text
    // Possessives must come first to avoid "This person's" → "You's"
    .replace(/\bThis person's\b/g, 'Your')
    .replace(/\bthis person's\b/g, 'your')
    .replace(/\bThis person\b/g, 'You')
    .replace(/\bthis person\b/g, 'you')
    .replace(/\bThey've\b/g, "You've")
    .replace(/\bthey've\b/g, "you've")
    .replace(/\bThey're\b/g, "You're")
    .replace(/\bthey're\b/g, "you're")
    .replace(/\bThey'll\b/g, "You'll")
    .replace(/\bthey'll\b/g, "you'll")
    .replace(/\bThey'd\b/g, "You'd")
    .replace(/\bthey'd\b/g, "you'd")
    .replace(/\bThey\b/g, 'You')
    .replace(/\bthey\b/g, 'you')
    .replace(/\bTheir\b/g, 'Your')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bThem\b/g, 'You')
    .replace(/\bthem\b/g, 'you')
    .replace(/\bThemselves\b/g, 'Yourself')
    .replace(/\bthemselves\b/g, 'yourself');
}
