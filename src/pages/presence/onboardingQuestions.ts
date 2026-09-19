/**
 * "Três perguntas" (plan 2026-09-15-presence-forward, README 6.1 step 3; Phase 2 T7).
 *
 * After the voice note, the onboarding asks only what the note left open, three
 * at most, in a fixed order of harm: who has died (the worst confusion a
 * presence can make), what never to bring up, what she loves telling; then the
 * family's own tone and words, which a note rarely carries. Each answer becomes
 * one fact of the kind the brief already reads. Pure.
 */
import type { PresenceFactKind } from '@/services/api/presenceAPI';

export type QuestionDraft = {
  tone: string;
  people: Array<{ name: string; relation: string; calledBy: string }>;
  anchors: { place: string; dish: string; person: string };
  boundaries: string[];
};

export type OnboardingQuestion = {
  id: 'deceased' | 'boundary' | 'anchor' | 'tone' | 'language';
  factKind: PresenceFactKind;
  label: string;
  prompt: string;
  placeholder: string;
  /** Whether the note left this open. */
  open: (draft: QuestionDraft) => boolean;
};

export const MAX_QUESTIONS = 3;

const DECEASED = /falecid[oa]/i;

export const QUESTION_POOL: OnboardingQuestion[] = [
  {
    id: 'deceased',
    factKind: 'biography',
    label: 'Quem já se foi',
    prompt: 'Alguém importante para ela já faleceu? Quem, e como ela se referia a essa pessoa?',
    placeholder: 'O marido, Jorge. Ela ainda fala "o Jorge" como se fosse ontem.',
    open: (d) => !d.people.some((p) => DECEASED.test(p.relation)),
  },
  {
    id: 'boundary',
    factKind: 'boundary',
    label: 'O que nunca tocar',
    prompt: 'Tem algum assunto que nunca devemos tocar com ela?',
    placeholder: 'A briga com o irmão. E dinheiro, ela fica aflita.',
    open: (d) => d.boundaries.every((b) => !b.trim()),
  },
  {
    id: 'anchor',
    factKind: 'anchor',
    label: 'O que ela adora contar',
    prompt: 'O que ela adora contar, de novo e de novo?',
    placeholder: 'A viagem de navio em 1968. E como ela conheceu o Jorge no baile.',
    open: (d) => Object.values(d.anchors).filter((a) => a.trim()).length < 2,
  },
  {
    id: 'tone',
    factKind: 'tone',
    label: 'O seu jeito carinhoso',
    prompt: 'Quando ela repete uma história que você já ouviu, como você costuma responder?',
    placeholder: 'Brinco com ela de leve e pergunto o detalhe que ela esqueceu da última vez.',
    open: (d) => !d.tone.trim(),
  },
  {
    id: 'language',
    factKind: 'language',
    label: 'Palavras só de vocês',
    prompt: 'Que apelidos, expressões ou piadinhas são só de vocês dois?',
    placeholder: 'Eu chamo ela de Nunu. Ela chama todo plano bom de plano de domingo, mesmo na terça.',
    open: () => true,
  },
];

/** The questions still open for this family, in order, three at most. */
export function openQuestions(draft: QuestionDraft): OnboardingQuestion[] {
  return QUESTION_POOL.filter((q) => q.open(draft)).slice(0, MAX_QUESTIONS);
}
