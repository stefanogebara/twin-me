/**
 * GitHub project-type classification.
 *
 * The bug (found 2026-08-13 while checking the fidelity-eval verdict log):
 * the twin's memory stream asserted "Working on 17 public, 13 private GitHub
 * repos, primarily focused on data science / ML" for an account whose repo mix
 * is TypeScript 16 / JavaScript 10 / Python 1.
 *
 * Every one of the seven repos that produced that label matched on the single
 * token `ai`:
 *
 *   restaurant-ai-mcp  pauta-ai  ai-olympics  ai-flight-agent
 *   condoos ("AI-powered")  instagram-dashboard ("Inner AI")
 *   gauntlet-fixture-hello ("AI Olympics")
 *
 * Zero matched pytorch, pandas, sklearn, kaggle or notebook. In 2026 an "ai"
 * in a repo name says the product CALLS a model, not that the author trains
 * one, so the label came out backwards on the strongest evidence available.
 *
 * The contract pinned here: language votes alongside name/description, `ai`
 * and `data` no longer imply ML on their own, and the classifier returns null
 * — letting the caller fall back to the plain "Active on GitHub with N
 * repositories" — rather than guess when the evidence is thin or split.
 */
import { describe, it, expect } from 'vitest';
import { detectGitHubProjectType } from '../../../../api/services/observationFetchers/githubProjectType.js';

const r = (name, language, description) => ({ name, language, description });

/** The live /user/repos response that produced the wrong label. */
const PRODUCTION_REPOS = [
  r('racha', 'JavaScript', null),
  r('twin-me', 'JavaScript', null),
  r('squad-checkout', 'TypeScript', 'Checkout e fechamento de vendas Squad.com — wizard de 5 passos, contrato com aceite eletrônico e pagamento Stripe'),
  r('restaurant-ai-mcp', 'JavaScript', 'AI Restaurant Phone Receptionist MCP Server - Handles reservations via ElevenLabs voice agent'),
  r('cockpit-vendas', 'TypeScript', 'Cockpit de vendas — plataforma de acompanhamento de metas e lançamentos de vendas (Next.js + Prisma)'),
  r('ECC', null, 'The agent harness performance optimization system. Skills, instincts, memory, security, and research-first development'),
  r('roca', 'TypeScript', 'Stevi — assistente agronômico brasileiro no WhatsApp. Triagem, não prescrição.'),
  r('pauta-ai', 'TypeScript', null),
  r('brandbook-builder', 'JavaScript', 'Ferramenta para montar brand books e gerar posts — Vitoria + Stefano'),
  r('instagram-dashboard', 'TypeScript', 'Dashboard local de ranking de posts do Instagram (Squad e Inner AI), lendo direto do Google Sheets'),
  r('ai-olympics', 'TypeScript', 'AI Olympics - Competitive entertainment platform where AI agents compete in real-world internet tasks'),
  r('condoos', 'TypeScript', 'AI-powered condominium OS — packages, visitors, amenities, voting, AI-drafted proposals & meeting summaries.'),
  r('midia-paga', 'TypeScript', 'Recreation of the Squad Midia Paga v2 module (Google Ads management)'),
  r('ai-flight-agent', 'Python', null),
  r('gauntlet-fixture-hello', null, 'Fixture repository for AI Olympics Real Tasks Gauntlet'),
];

describe('detectGitHubProjectType — the production regression', () => {
  it('calls this account web development, not data science / ML', () => {
    expect(detectGitHubProjectType(PRODUCTION_REPOS)).toBe('web development');
  });

  it('is not swayed by the bare token "ai" in a product name', () => {
    // Four AI-branded products, all TypeScript/JavaScript web apps.
    expect(detectGitHubProjectType([
      r('restaurant-ai-mcp', 'JavaScript', 'AI Restaurant Phone Receptionist MCP Server'),
      r('pauta-ai', 'TypeScript', null),
      r('ai-olympics', 'TypeScript', 'AI Olympics - competitive platform where AI agents compete'),
      r('condoos', 'TypeScript', 'AI-powered condominium OS'),
    ])).not.toBe('data science / ML');
  });

  it('still recognises genuine ML work', () => {
    expect(detectGitHubProjectType([
      r('kaggle-titanic', 'Jupyter Notebook', 'EDA and a gradient boosting baseline'),
      r('pytorch-experiments', 'Python', 'PyTorch training loops'),
      r('pandas-utils', 'Python', 'dataset cleaning helpers'),
    ])).toBe('data science / ML');
  });

  it('recognises mobile from language even with a terse description', () => {
    expect(detectGitHubProjectType([
      r('grocery', 'Swift', null),
      r('grocery-android', 'Kotlin', null),
      r('shared-ui', 'Dart', 'Flutter widgets'),
    ])).toBe('mobile');
  });
});

describe('detectGitHubProjectType — declines to guess', () => {
  it('returns null when two categories are evenly split', () => {
    // Saying "primarily" of a 50/50 split is a claim the data cannot support.
    expect(detectGitHubProjectType([
      r('shop', 'TypeScript', 'react storefront'),
      r('ml-pipeline', 'Jupyter Notebook', 'pytorch training'),
    ])).toBeNull();
  });

  it('returns null when there is no signal at all', () => {
    expect(detectGitHubProjectType([
      r('notes', null, null),
      r('scratch', null, null),
    ])).toBeNull();
  });

  it('returns null on thin evidence — one weak repo is not a focus', () => {
    expect(detectGitHubProjectType([r('sandbox', 'TypeScript', null)])).toBeNull();
  });

  it('handles empty and malformed input', () => {
    expect(detectGitHubProjectType([])).toBeNull();
    expect(detectGitHubProjectType(null)).toBeNull();
    expect(detectGitHubProjectType(undefined)).toBeNull();
    expect(detectGitHubProjectType([null, {}, { name: 42 }])).toBeNull();
  });
});

describe('detectGitHubProjectType — stability', () => {
  it('is deterministic regardless of repo order', () => {
    const forward = detectGitHubProjectType(PRODUCTION_REPOS);
    const reversed = detectGitHubProjectType([...PRODUCTION_REPOS].reverse());
    expect(forward).toBe(reversed);
  });

  it('does not mutate its input', () => {
    const snapshot = JSON.stringify(PRODUCTION_REPOS);
    detectGitHubProjectType(PRODUCTION_REPOS);
    expect(JSON.stringify(PRODUCTION_REPOS)).toBe(snapshot);
  });
});
