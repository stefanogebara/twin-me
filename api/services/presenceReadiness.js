/**
 * Presence readiness — pure scoring + plain-language mirror, in Brazilian Portuguese.
 * No I/O: presence.js fetches the counts and calls deriveReadiness(); tests call it directly.
 *
 * Thresholds are deliberately low (a widow with one child must not be blocked):
 * the mirror does the persuading, the gate only prevents a blind first call.
 */

export const READY_MIN_PEOPLE = 2;
export const READY_MIN_ANCHORS = 2;

/**
 * @param {object} input
 * @param {string} input.caredForName
 * @param {string} input.tone
 * @param {{people:number, anchors:number, boundaries:number, biography:number, notes_queued:number, conversations:number}} input.counts
 * @param {boolean} input.hasIntro  any biography fact exists (voice note or learned)
 */
export function deriveReadiness({ caredForName, tone, counts, hasIntro }) {
  const her = caredForName?.trim() || 'ela';
  const toneSet = Boolean(tone?.trim());
  const knows = [];
  const missing = [];

  if (counts.people > 0) knows.push(`${counts.people} ${counts.people === 1 ? 'pessoa' : 'pessoas'} na vida da ${her}, e como ela chama cada uma`);
  else missing.push('Ninguém no mapa da família ainda: a Presença não pode falar de ninguém com segurança');
  if (counts.people === 1) missing.push('Só uma pessoa no mapa: acrescente pelo menos mais uma, para ela nunca se confundir');

  if (counts.anchors >= READY_MIN_ANCHORS) knows.push(`${counts.anchors} histórias do mundo dela para abrir a conversa`);
  else missing.push(counts.anchors === 0 ? 'Nenhuma história do mundo dela: a primeira conversa vai ser só conversa fiada' : 'Só uma história: acrescente mais uma');

  if (toneSet) knows.push(`Como vocês são juntos: ${tone}`);
  else missing.push('O seu tom com ela não está definido');

  if (counts.boundaries > 0) knows.push(`${counts.boundaries} ${counts.boundaries === 1 ? 'limite' : 'limites'} da família além dos padrões`);
  else missing.push('Nenhum limite além dos padrões (visitas, dinheiro e remédios estão sempre protegidos)');

  if (hasIntro) knows.push(`O que você contou sobre a vida dela, nas suas palavras${counts.biography > 1 ? ` (${counts.biography} fatos)` : ''}`);
  else missing.push('Nada sobre o dia a dia dela ainda: o recado de voz de dois minutos preenche quase tudo isso');

  if (counts.conversations > 0) knows.push(`${counts.conversations} ${counts.conversations === 1 ? 'conversa anterior' : 'conversas anteriores'} para ela continuar`);

  const score = Math.min(100, Math.round(
    Math.min(counts.people, 3) / 3 * 30 +
    Math.min(counts.anchors, 3) / 3 * 25 +
    (toneSet ? 10 : 0) +
    Math.min(counts.boundaries, 2) / 2 * 10 +
    (hasIntro ? 20 : 0) +
    Math.min(counts.conversations, 1) * 5,
  ));

  const ready = counts.people >= READY_MIN_PEOPLE && counts.anchors >= READY_MIN_ANCHORS && toneSet;
  return { ready, score, knows, missing };
}
