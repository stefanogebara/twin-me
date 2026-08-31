# Intel — TwinMe

> Atualizado por `/intel`. Config em `intel.config.json`, rubrica em
> `.claude/skills/intel/references/rubric.md`.
>
> **Nota da primeira passada (2026-08-22):** rodada sem acesso ao repositório.
> Os candidatos vieram pré-filtrados por relevância, então a proporção de score
> alto ficou acima do normal — numa varredura crua espere ~12 de 20 descartados.
>
> **Destravado em 2026-08-24.** O `/intel` rodou com o repositório aberto: os
> quatro spikes ganharam âncora real (32 caminhos verificados) e os scores
> 13/13/11/11 valem. O campo **Toca** de cada um está preenchido em
> `BACKLOG.md`, com uma nota do que a leitura do código mudou no spike. O estado
> do repositório e as divergências com o config estão em `STATE.md`.
>
> **Passada de 2026-08-31: zero candidatos novos.** O feed devolveu os mesmos
> oito itens de 22/08, todos já em `seen.jsonl` — nenhum analista foi acionado.
> A passada serviu só para o estado do repositório (`STATE.md`) e para fechar,
> por código e não por texto, dois itens que estavam em aberto — movidos pro
> Arquivo abaixo.

## Em aberto — precisa de decisão do Stefano

### [DISCUTIR 10/15] Um traço de persona é um slot com um valor corrente?
**Data:** 2026-08-24 · **Eixos:** P3 A2 D2 E2 L1
**Fonte:** [arXiv 2608.20685 — validade temporal em históricos reais](https://arxiv.org/abs/2608.20685)

**O que é:** MemStrata mantém supersessão determinística por tripla (sujeito, relação,
objeto): valor novo retira o antigo por **chave exata**, não por similaridade, porque
velho e novo têm embedding quase idêntico. Em 130 transições atômicas extraídas de 707
issues reais do SWE-bench, o RAG serve o valor superseditado **36–38% das vezes** e o
reranker não corrige; MemStrata leva a ~0 na latência do RAG.

**Por que toca este projeto:** este repo já internalizou o mecanismo em julho — tem
`superseded_by`/`superseded_at`, filtro na RPC e Tier 2b no cron de esquecimento. Por
isso o item **não vira spike novo**: foi fundido como braço de `mcp-portao-escrita`. O
valor que sobra é o número, e uma pergunta que o número expõe.

**A pergunta:** a supersessão determinística só funciona onde existe **um** valor que
substitui o anterior — e o `UNIQUE(user_id, platform, feature_name, dimension)` de
`behavioral_evidence` assume que sim, que Abertura-via-Spotify tem um valor certo por vez.
Se um traço é na verdade uma distribuição que oscila legitimamente (a pessoa estava
disciplinada em março e dispersa em julho, e as duas coisas são verdade), então versionar
por slot é a forma errada, e o `known_gaps[1]` se fecha por **confiança decrescente e
TTL**, não por supersessão. Só você decide o que o produto está afirmando — e a resposta
muda o braço do spike de "grava / verifica / pergunta" para "grava / retira / pergunta".

---

### [DISCUTIR 9/15] O gateway de LLM e o billing viraram a mesma empresa
**Data:** 2026-08-24 · **Eixos:** P2 A2 D2 E1 L2
**Fontes:** [Stripe Newsroom](https://stripe.com/newsroom/news/stripe-agrees-to-acquire-openrouter) · [blog da OpenRouter](https://openrouter.ai/blog/announcements/openrouter-is-joining-stripe/)

**O que é:** a Stripe assinou acordo para adquirir a OpenRouter, declarando que "tokens
são a moeda central" e que pretende fundir o roteamento com o produto Token Billing. A
OpenRouter promete "nada na sua integração muda" e neutralidade que "não se curva a
nenhum modelo, provedor ou empresa-mãe". Deal ainda não fechado.

**Por que toca este projeto:** a OpenRouter é o gateway **único** de LLM
(`api/services/llmGateway.js`, com `OPENROUTER_API_KEY` como env obrigatória que dá
`process.exit(1)` em `api/server.js`) e a Stripe já é o billing (`api/routes/billing.js`).
Chat, análise, extração, visão, embeddings e enriquecimento passam todos pela mesma chave.

**O que a fonte não prova:** a neutralidade é copy, não contrato — não há cláusula, prazo,
métrica nem governança. E "nada muda na sua integração" é promessa sobre a assinatura da
API, não sobre preço, política de roteamento ou retenção. Os US$ 7 bi são reporte da
Bloomberg que a Stripe se recusou a confirmar.

**A pergunta:** não é "sair da OpenRouter" — não há motivo hoje. É: vale meia hora
extraindo `https://openrouter.ai/api/v1` e o nome da chave para env
(`LLM_GATEWAY_BASE_URL` / `LLM_GATEWAY_API_KEY`) nos 13 pontos onde está hardcoded, e
rodar a harness contra um segundo gateway OpenAI-compatível **uma vez**, só pra saber o
número do custo de saída? Ou isso é ansiedade de fornecedor tomando tempo do trabalho de
fidelidade? Segunda decisão embutida: o `settled` deveria virar "todo LLM passa por **um**
gateway, hoje OpenRouter" — o que preserva a disciplina sem prender a marca?

---

### [DISCUTIR 8/15] O canal léxico tem futuro, ou morre no rescoring?
**Data:** 2026-08-24 · **Eixos:** P2 A1 D2 E2 L1
**Fontes:** [timescale/pg_textsearch](https://github.com/timescale/pg_textsearch) (licença PostgreSQL, v1.4.0 em 18/08) · [paradedb/paradedb](https://github.com/paradedb/paradedb) (AGPL-3.0, v0.25.3 em 17/08)

**O que é:** BM25 nativo em Postgres amadureceu em dois sabores — um com licença
permissiva, outro AGPL. O da Timescale implementa um access method novo
(`CREATE INDEX ... USING bm25`) com Block-Max WAND.

**Por que fecha em vez de abrir:** a checagem de viabilidade derrubou o item. **Nenhum dos
dois está entre as 30 extensões da imagem do Supabase**, e o `pg_textsearch` exige
`shared_preload_libraries`, inacessível em Postgres gerenciado. O quarto braço do spike
`desa-hibrido` morreu antes de nascer — e isso vale o registro, porque economiza horas.

**A pergunta:** o precedente do repo é contra o canal léxico —
`20260514_audit_l2_drop_unused_indexes_pass1.sql` dropou `idx_user_memories_fts` com a
justificativa explícita de que "TwinMe uses pgvector for memory retrieval, not Postgres
FTS", 0 scans em 22k linhas. Agora que BM25 nativo permissivo existe e pode chegar ao
Supabase: você quer o braço esparso do `desa-hibrido` construído com
`websearch_to_tsquery`/`ts_rank` **atrás de uma fronteira de função** — de modo que trocar
para `pg_textsearch` no dia em que o Supabase adotar seja trocar só o operador de score —
ou aceita que o canal léxico fica sendo o `BM25_BLEND_WEIGHT = 0.10` em JS, nunca validado
pelo eval, e o spike roda com dois braços?

---

### [DISCUTIR 10/15] Incumbentes ocupam a camada de agregação pessoal
**Data:** 2026-08-22 · **Eixos:** P2 A1 D2 E2 L3
**Fontes:** [blog do Google, 12/ago](https://blog.google/innovation-and-ai/products/gemini-app/new-connected-apps-services-gemini-august-2026/) · [notas de versão do ChatGPT, 14/ago](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
*(dois itens fundidos — mesmo movimento, score do maior)*

**O que é:** o Gemini abriu ~14 apps conectados novos de uma vez — Granola,
Otter.ai, Pandora, iHeartRadio, OpenTable, Zocdoc — cobrindo produtividade,
música, saúde e lazer. Na mesma semana a OpenAI passou a montar sugestões na
home a partir do histórico de conversas somado às ferramentas conectadas. Os
dois assistentes que já vêm instalados no telefone das pessoas passaram a
agregar vida digital como feature de plataforma.

**Por que toca este projeto:** vai direto na aposta nº 2 do
`intel.config.json` — *"profundidade de ingestão (30+ plataformas) é o fosso,
não a qualidade do modelo"*. Se a agregação vira commodity distribuída de
graça por quem já está no aparelho, o fosso muda de lugar: deixa de ser
*quantos conectores* e passa a ser *o que se faz com o grafo depois* — a
proveniência do traço, a leitura sobre si, a posse local do dado.

**O que a fonte não prova:** nenhum dos dois expõe leitura sobre o usuário —
são conectores para responder pergunta, não para construir persona. A distância
entre "eu leio seus apps" e "eu te digo quem você é" continua aberta. Por
enquanto.

**A pergunta:** o fosso do TwinMe continua sendo o número de conectores, ou
você reposiciona para proveniência + posse local e passa a tratar ingestão
como custo de entrada? Isso muda o que entra na home page e o que entra no
roadmap dos próximos 30 dias.

---

## Fila de trabalho

Spikes escritos em `BACKLOG.md`, os quatro com âncora preenchida em 2026-08-24.

**Cinco itens desta passada foram fundidos neles em vez de virar spike novo**, pela trava
da rubrica — o que cada fusão acrescenta está registrado dentro do spike correspondente no
`BACKLOG.md`, não aqui. Um deles (a compilação de claims na ingestão) entrou como **perna 0
de `pgmem-proveniencia`**, a ser rodada antes da perna de render: se a taxa de aterramento
reprovar, o spike de render herda a resposta e economiza um dia. E um braço de
`desa-hibrido` foi **fechado antes de nascer** por inviabilidade de stack.


- [PROTOTIPAR 13/15] Proveniência de traço OCEAN (PGMem) → `BACKLOG.md#pgmem-proveniencia`
  · âncora: `api/services/evidenceGeneratorService.js`, `src/pages/components/soul-signature/BigFivePanel.tsx`
- [PROTOTIPAR 13/15] Busca híbrida assimétrica no pgvector (DESA) → `BACKLOG.md#desa-hibrido`
  · âncora: `api/services/memoryStreamService.js`, `api/services/bm25Service.js`
- [PROTOTIPAR 11/15] Portão de escrita de memória (MCB) → `BACKLOG.md#mcb-portao-escrita`
  · âncora: `api/services/evidenceGeneratorService.js`, `database/migrations/20260527_create_twin_directives.sql`
- [PROTOTIPAR 11/15] Vazamento de persona e ingestão local (AntiSkillBench) → `BACKLOG.md#antiskill-local`
  · âncora: `desktop/src-tauri/src/sync.rs`, `api/routes/observations-clip.js`

Novos em 2026-08-24:

- [PROTOTIPAR 13/15] Migrar análise e extração para `deepseek-v4-flash` → `BACKLOG.md#deepseek-v4-flash`
  · âncora: `api/config/aiModels.js`, `twin-research/fidelity-eval.js`
- [PROTOTIPAR 13/15] Podar a extensão até caber no propósito declarado → `BACKLOG.md#extensao-single-purpose`
  · âncora: `browser-extension/manifest.json`, `src/pages/PrivacyPolicy.tsx`
- [PROTOTIPAR 11/15] Servir o gêmeo por MCP e medir se o retrato é o produto → `BACKLOG.md#mcp-contexto-portatil`
  · âncora: `api/mcp-server/src/server.ts`, `api/routes/api-keys.js`

## Radar

- `2026-08-24` **Supabase passa a ignorar VERSION em CREATE EXTENSION** — entrada de 22/07, vigente 05/08; a versão pedida é ignorada e a default do projeto é instalada, com warning. Nenhuma das três árvores de migração do TwinMe pina versão, então nada muda aqui — resta confirmar que a default do projeto é pgvector ≥ 0.8.2, que corrigiu o CVE-2026-3172 no build paralelo de HNSW. [changelog](https://supabase.com/changelog) · 7/15

- `2026-08-22` **Twin1 AI capta US$ 20 mi para gêmeos de knowledge worker** — seed co-liderada por Bessemer, Tribeca e Aramco; monta o gêmeo a partir de e-mail, reuniões e documentos; roda em Linklaters, Orrick e Dechert, onde os twins respondem por 30–50% das tarefas de comunicação. Mesmo problema, público oposto ao seu — sinal de que o dinheiro está indo pro enterprise hetero-referente. [SiliconANGLE](https://siliconangle.com/2026/08/20/twin1-ai-raises-20m-to-put-an-ai-twin-behind-every-knowledge-worker/) · 6/15

## Arquivo

- `2026-08-31` **[Resolvido por código] Um processo mira o número de acurácia, não a
  inferência** (DISCUTIR 10/15, 24/08, gatilho: petição Surber v. Oura) — `6bcf030` e
  `555f12d` escolheram a opção (a) da própria pergunta: `/p/:userId` agora lidera com
  `normalized_fidelity` quando existe, nomeia o denominador, e mostra n/sessões/wave/data
  sob "Not a clinical measure" em vez do `twin_accuracy` cru em 40px. De quebra, corrigiu
  um bug mais grave que a pergunta não sabia que existia: os dois caminhos de leitura
  ordenavam só por `wave` — que reinicia em 1 a cada revisão de bateria — então a página
  pública servia havia dias o **maior de três scores**, de uma versão de bateria já
  aposentada (v1 0.825 contra v3 atual 0.610). Ver `STATE.md`.
- `2026-08-31` **[Resolvido por código] O autor do Generative Agents virou concorrente com
  US$ 2 bi** (DISCUTIR 10/15, 22/08, gatilho: rodada da Simile) — `6bcf030` respondeu a
  pergunta de nomenclatura: "digital twin" sai de 11 strings de UI (notificações, waitlist,
  onboarding, progresso, privacidade), fica "your twin" / "soul signature". Termos legais
  (Terms/Privacy) e prompts de sistema do LLM deliberadamente intocados — mudança de
  wording ali é mudança de comportamento, que ainda deve ao eval uma rodada.
