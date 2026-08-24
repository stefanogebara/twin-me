# Estado do repositório — TwinMe

> Escrito pela primeira passada do `/intel` em 2026-08-24. Janela: 30 dias
> (2026-07-14 → 2026-08-13, 91 commits). HEAD `55e44d08`, branch `main`.
> Reescrito a cada `/intel`. Fonte: o git, não o config.

## O parágrafo

Os últimos 30 dias não foram de construir gêmeo — foram de **medir se o gêmeo
é fiel e consertar a memória que sustenta isso**. A harness de fidelidade virou
portão de merge (`46da9e52`: flag só passa se mover o score) e cobrou o preço
no mesmo dia: o *temporal spine*, shipado 14 dias antes, foi deletado porque o
eval reprovou. Junto veio a Grande Deleção — reranker, modos de
neurotransmissor, roteador neuropil, 15 dos 30 crons, e a IA colapsada em cinco
superfícies. Do lado da recuperação, a busca vetorial estava devolvendo zero
linhas em consulta filtrada por tipo, e a resposta foi **medir e otimizar
dentro do Postgres**, não trocar de banco: índice HNSW parcial e MMR em duas
fases, com payload 39× menor. Uma onda de honestidade atravessou os conectores:
parar de afirmar o que não foi medido. Nenhum conector novo apareceu no top-25
de arquivos tocados.

## O que shipou

- **Recuperação vetorial consertada por medição** — HNSW parcial (`1b72efa4`,
  #234: `memory_type='conversation'` ia de 0 linhas para 30 em 386ms) e MMR em
  duas fases (`fc226194`, #235: 770.610 B/662ms → 19.879 B/254ms).
- **Harness de fidelidade como portão de merge** (`46da9e52`) —
  `twin-research/fidelity-eval.js` foi o arquivo mais tocado do período (19×).
- **A Grande Deleção** — temporal spine (`a8b3314e`), reranker + neurotransmissor
  + neuropil (`01e00797`), 15 de 30 crons (`3073983f`).
- **Higiene epistêmica da memória** — o gêmeo parou de se citar como fato
  (`df8b146e`) e as reflexões pararam de comer o próprio output (`4c73e592`).
- **Onda de honestidade nos conectores** — Spotify parou de descrever pessoa
  não medida (`f711dc83`), "ai" no nome do repo deixou de ser evidência de data
  science (`27fd15db`), fetch que falhou deixou de virar fetch vazio
  (`2069f5b1`).
- **Recibos no chat** (`9da39ded`) — fontes de plataforma e confiança de
  evidência na resposta. **O padrão de UI que o spike de proveniência precisa
  já existe — só nunca foi levado para o traço.**
- Story Chapters, decay Ebbinghaus per-memory, compilador de task-brief.

## O que está em voo

- **PRs abertos:** #257 (`fix/design-tier2-claura-sweep`), #255
  (`fix/design-tier1-broken-buttons`), #254
  (`feat/phase-2-make-moat-visible`) — todos de 12–13/08.
- **Transcrição on-device compila mas não está no pipeline** —
  `desktop/src-tauri/src/transcribe.rs`, `transcribe_wav` marcado
  `#[allow(dead_code)] // wired into the capture -> transcribe pipeline in a
  later 5B unit`.
- **Risco residual assumido em commit** — `52b40c42`: o budget de 12s cobre o
  contexto, não a perna do LLM; healthy path medido em 57s.
- `f1d008da` registra que o ganho do digest de plataforma **não replicou** num
  segundo dia.
- ~40 branches remotas, a maioria já mergeada e não podada.

## O que morreu

- **Temporal spine** (`a8b3314e`, 11/08) — 14 dias de vida, morto pelo eval.
- Reranker LLM, modos de neurotransmissor, roteador neuropil (`01e00797`).
- Cron de saliency-replay e cache-warm de grafo (`00a8e241`); 15 de 30 crons
  (`3073983f`).
- Braço "spread" do eval — medido, reprovado duas vezes (`d28ccb70`,
  `3e4750fc`).
- Rotas `/preview/*` rebaixadas a dev-only.

> **Trava de estado:** item de intel que proponha ressuscitar reranker,
> temporal spine, roteador por neurotransmissor ou agregador bancário perde o
> eixo Alavanca. Foram medidos e reprovados aqui.

## Áreas quentes

`twin-research/fidelity-eval.js` (19) · `api/services/memoryStreamService.js`
(12) · `api/services/fidelityBatteryService.js` (10) ·
`tests/api/services/twinFidelity.test.js` (8) ·
`api/services/twinSystemPromptBuilder.js` (6) · `src/pages/TalkToTwin.tsx` (5) ·
`api/services/twinPromptAssembly.js` (5) ·
`api/services/observationIngestion.js` (5).

## Divergências com o config

Nenhuma foi aplicada sozinha. `bets` e `settled` só o Stefano mexe.

1. **`bets[1]` — "profundidade de ingestão (30+ plataformas) é o fosso" — o
   código foi na direção oposta.** `api/config/platformConfigs.js:12` documenta
   o corte: *"replan-2026-06-10 Track C portfolio cut: twitch, linkedin,
   reddit, notion, pinterest, steam, soundcloud removed"*. A allowlist
   canônica tem **7 keepers** (Spotify, YouTube, Discord, Whoop, Calendar,
   GitHub, Gmail) + Netflix/Instagram/Amazon via extensão. Não são 30+, são 7 —
   e plataformas foram removidas **ativamente** (`e2b804d2`, `d156e4b2`).
   Onde o código de fato aprofundou foi noutro eixo: captura ambiente (clips de
   janela, reunião, WhatsApp, Telegram, voz, biometria) e **fidelidade medida**.
   **Decisão pendente do Stefano:** o fosso ainda é largura de conectores, ou
   já virou fidelidade medida + profundidade de captura? Isso muda o que o
   `intel` considera ameaça.
   *(O item de 22/08 sobre Gemini e ChatGPT abrindo conectores já fazia essa
   pergunta pelo lado do mercado. O código a responde pelo lado de dentro.)*

2. **`bets[2]` — "processamento local no Tauri é diferencial de confiança" —
   silencioso tendendo a contradizer.** whisper.cpp está compilado no binário,
   mas `transcribe_wav` não está plugado. No mesmo binário,
   `desktop/src-tauri/src/sync.rs` posta clips para o servidor, e
   `api/routes/observations-clip.js` aceita **8.000 caracteres de conteúdo
   bruto por clip, 100 clips por batch**. Nenhuma inferência de persona roda
   local. Nem o README nem o `CLAUDE.md` fazem a afirmação de "local" como copy
   — a aposta não foi cobrada nem cumprida.

3. **`stack` dizia "Anthropic API"; a realidade é OpenRouter + DeepSeek V3.2.**
   Não existe `@anthropic-ai/sdk` no `package.json` da raiz.
   `api/config/aiModels.js:17` é explícito: *"(was Claude Sonnet 4.6;
   deliberately kept on DeepSeek for cost — audit #118)"*, com teste anti-drift.
   *Corrigido no config, mais `verdict_note` avisando a rubrica.*

4. **`settled` — nenhum violado.** `pgvector fica` é respeitado com rigor
   incomum: quando a recuperação quebrou, mediram e otimizaram dentro do
   Postgres; há até uma migration chamada
   `20260728f_embedding_cast_measured_not_a_bottleneck.sql`. Zero clientes de
   Pinecone/Weaviate/Qdrant/Chroma/Milvus fora de docs arquivados.
   **Zona cinzenta a decidir em `settled[0]`:** três rotas públicas sem auth
   expõem a soul signature de um usuário a quem tiver o UUID —
   `api/routes/soul-signature-public.js`, `api/routes/portfolio-public.js`
   (que publica os **scores OCEAN brutos**) e `api/routes/og-image.js`, com a
   rota de front `/p/:userId` comentada como *"Premium shareable profile"*.
   É exibição opt-in de um retrato, não clonagem operacional — o `settled`
   formalmente está de pé. Mas a linha está implícita, e vale escrevê-la.

5. **`known_gaps[0]` estava certo no diagnóstico e errado na causa.** A tabela
   de proveniência **já existe e é escrita** (`behavioral_evidence`,
   `evidenceGeneratorService.js:418`). O problema é que ela é **write-only**:
   nenhuma rota e nenhum arquivo de `src/` lê de volta. *Reformulado.*

6. **`known_gaps[1]` e `[2]` estavam desatualizados.** Esquecimento de
   **memória** está resolvido (cron de 5 tiers, supersessão, decay Ebbinghaus);
   o que falta é esquecimento de **persona**. E já existe BM25 no repo — só que
   como rescoring sobre candidatos do canal denso, com peso 0.10 que o próprio
   `twin-config.js` admite nunca ter sido validado. *Reformulados.*
