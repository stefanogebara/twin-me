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

## Em aberto — precisa de decisão do Stefano

### [DISCUTIR 10/15] Um processo mira o número de acurácia, não a inferência
**Data:** 2026-08-24 · **Eixos:** P2 A2 D2 E2 L2
**Fonte:** [petição inicial, Surber v. Oura, 3:26-cv-08686 N.D. Cal.](https://clarksonlawfirm.com/wp-content/uploads/2026/08/COMPLAINT-26-cv-08686-Surber-v.-Oura-Inc.-et-al.pdf) · [TechCrunch](https://techcrunch.com/2026/08/21/oura-faces-lawsuit-accusing-it-of-misleading-consumers-about-sleep-tracking-accuracy/)

**O que é:** ação de sete counts (fraude, UCL, FAL, CLRA, garantia expressa, Song-Beverly)
ajuizada em 20/08. A teoria não é "você inferiu algo sobre a pessoa" — é mais estreita e
mais perigosa: a Oura anunciou **números falsificáveis de acurácia** ("95% Sleep Staging
Accuracy", "79% agreement with polysomnography") contra um gold standard reconhecido, e
estudos independentes medem ~50%. O segundo pilar é categórico: o anel não tem EEG/EOG,
então aplica "a proprietary, undisclosed machine learning algorithm" a sinal periférico e
vende, no texto da petição, "faulty AI-based inference as reliable science".

**Por que toca este projeto:** duas superfícies concretas.
1. `src/pages/PortfolioPage.tsx` renderiza o `twin_accuracy` **cru** em 40px, com a
   legenda "measured by a blind test-retest battery", servido **sem auth** por
   `/p/:userId` a quem tiver o UUID — enquanto o denominador honesto,
   `normalized_fidelity` (`twin_accuracy / self_consistency`), está gravado na mesma
   linha em `api/services/fidelityBatteryService.js` e é descartado no payload. A bateria
   tem 25 itens de autorrelato, n=1, uma wave, e o gabarito é a própria resposta do
   usuário.
2. `api/services/evidenceGeneratorService.js` **fabrica** números específicos a partir do
   valor normalizado (`raw.avg_tempo = Math.round(60 + val * 140)`, `raw.hrv_avg = 30 +
   val * 70`) e os interpola em texto do tipo "{avg_tempo} BPM avg". Número inventado
   apresentado como medição — literalmente a teoria do caso. Hoje é inócuo porque
   `behavioral_evidence` é write-only; **vira risco no dia em que o spike
   `pgmem-proveniencia` abrir o caminho de leitura.** Entrou como critério de aceite lá.

**O que a fonte não prova:** é petição inicial, nada adjudicado, sem certificação de
classe; a Oura respondeu citando quatro estudos próprios validados contra PSG. E a
analogia é imperfeita — Big Five não tem equivalente de polissonografia, então a perna
mais forte do caso (contradição contra gold standard) não transfere. O que transfere é a
perna do claim quantificado autoproduzido.

**A pergunta:** o `/p/:userId` é a única superfície hetero-referente do produto e é
justamente ela que carrega o número para terceiros sem auth — enquanto a `bets[0]` diz que
o valor é o usuário se entender. Você quer (a) manter o número e blindá-lo publicando
`normalized_fidelity` com n e data, (b) manter o portfólio e tirar o número, ou (c)
aceitar que a vitrine pública é aposta de crescimento e vale o risco? É exatamente a zona
cinzenta que o `STATE.md` pediu para escrever em `settled[0]`.

---

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

### [DISCUTIR 10/15] O autor do Generative Agents virou concorrente com US$ 2 bi
**Data:** 2026-08-22 · **Eixos:** P3 A1 D3 E1 L2
**Fonte:** [TechCrunch, 30/jul](https://techcrunch.com/2026/07/30/synthetic-user-startup-simile-raises-200m-at-2b-valuation-5-months-after-100m-series-a/)

**O que é:** a Simile, fundada por Joon Sung Park — autor do paper de
Generative Agents em que a arquitetura do TwinMe se apoia —, levantou US$ 200
milhões liderados pela Greenoaks a US$ 2 bilhões, cinco meses depois de um
Series A de US$ 100 milhões. Meta declarada: simular "todas as 8 bilhões de
pessoas" via gêmeos agênticos.

**Por que toca este projeto:** não invalida a aposta nº 1 — a Simile é
hetero-referente (gêmeos sintéticos para pesquisa e teste de produto), o
TwinMe é auto-referente. A separação que você apostou continua de pé, e agora
tem um player de US$ 2 bi provando que o outro lado dela é grande. O custo é
de linguagem: "gêmeo digital" e "generative agents" passam a significar
publicamente a coisa da Simile.

**O que a fonte não prova:** é reportagem de rodada, não benchmark. Nada sobre
qualidade da simulação nem sobre roadmap de produto ao consumidor.

**A pergunta:** vale continuar chamando de "gêmeo digital" quando o termo
está sendo capturado por um player de US$ 2 bi fazendo o oposto do que você
faz — ou "soul signature" passa a ser o nome de tudo, e "gêmeo digital" some
do copy?

---

## Fila de trabalho

Spikes escritos em `BACKLOG.md`, os quatro com âncora preenchida em 2026-08-24:

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

_vazio_
