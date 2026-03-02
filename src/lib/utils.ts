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
  let result = text
    // Possessives first to avoid "This person's" → "You's"
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
    .replace(/\bthemselves\b/g, 'yourself')
    // Reflexive pronouns
    .replace(/\bHimself\b/g, 'Yourself')
    .replace(/\bhimself\b/g, 'yourself')
    .replace(/\bHerself\b/g, 'Yourself')
    .replace(/\bherself\b/g, 'yourself');

  // Fix third-person singular verb forms after "You" (result of subject replacement)
  // Pattern: "You [verb]s" → "You [verb]" for common verbs
  result = result.replace(/\bYou (treats|enjoys|likes|tends|uses|shows|demonstrates|displays|exhibits|finds|makes|takes|seeks|brings|keeps|holds|plays|works|feels|seems|appears|remains|becomes|leads|creates|builds|runs|starts|moves|drives|pushes|pulls|shapes|forms|centers|values|focuses|prioritizes|expresses|explores|connects|engages|approaches|handles|manages|navigates|balances|combines|blends|mixes|shifts|adapts|learns|grows|evolves|develops|refines|processes|reflects|considers|weighs|analyzes|questions|challenges)\b/g, (_, verb) => `You ${verb.replace(/s$/, '')}`);

  return result;
}
