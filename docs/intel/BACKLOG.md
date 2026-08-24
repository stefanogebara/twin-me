# Backlog de intel — TwinMe

**Destravados em 2026-08-24.** Os quatro itens estavam `aguardando âncora` — a
rubrica não deixa passar de DISCUTIR sem nomear arquivo real do repositório. A
primeira passada do `/intel` com o repo aberto encontrou âncora para os quatro
(32 caminhos verificados com `ls`), então os scores 13/13/11/11 valem e os
spikes estão abertos. Ver `STATE.md` para o estado do repositório.

---

### pgmem-proveniencia — Cada traço OCEAN aponta pra evidência que o gerou
**Origem:** INTEL 2026-08-22 · **Veredito:** PROTOTIPAR 13/15 (P3 A2 D3 E2 L3)
**Fonte:** [PGMem, arXiv 2608.01708, 03/ago](https://arxiv.org/abs/2608.01708) — Choi et al., Korea University

**O mecanismo:** grafo heterogêneo com nós de evento e nós de persona ligados
por arestas tipadas de proveniência e evidência. A recuperação não faz
similaridade pura: expande a partir dos nós relevantes à query e prioriza por
força de evidência. Ganho cresce conforme o histórico cresce, e funciona com
modelos pequenos.

**Ataca o gap:** `known_gaps[0]` — *"traços OCEAN não apontam de volta pra
evidência que os gerou; soul signature é afirmação sem rastro."*

**Hipótese:** se cada traço OCEAN carregar arestas para os eventos que o
sustentam, a soul signature deixa de ser afirmação e vira algo que o usuário
pode auditar — e a taxa de "isso não sou eu" na primeira sessão cai.

**Spike (1 dia):** pegar um usuário de teste com histórico real. Modelar em
Postgres duas tabelas de aresta sobre o que já existe: `trait_evidence`
(traço → evento, com peso) e `event_source` (evento → plataforma de origem).
Popular só para Abertura e Conscienciosidade. Renderizar a soul signature com
os três eventos de maior peso embaixo de cada traço.

**Medir:** para 10 traços gerados, quantos têm ≥3 eventos de suporte que um
humano lendo aceita como justificativa. Sucesso: 7 de 10.

**Parar se:** a maioria dos traços só se justifica por agregado difuso
("ouviu 400 artistas diferentes") e não por evento nomeável — nesse caso o
grafo não é o gargalo, a geração do traço é.

**Toca:**
- Escrita da evidência hoje: `api/services/evidenceGeneratorService.js` (grava em `behavioral_evidence`), `api/services/behavioralEvidencePipeline.js`
- Geração do traço: `api/services/bigFiveAssessmentService.js`, `api/services/soulSignatureService.js`, `api/services/reflectionEngine.js`, `api/services/twinEvolutionService.js`
- Schema já existente: `database/supabase/migrations/20260114_behavioral_evidence.sql` (é a `trait_evidence` do spike, só que ligada a *feature* e não a *evento*), `database/supabase/migrations/20250124_soul_signature_schema.sql`, `database/supabase/migrations/20260222_add_memory_stream_vector_search.sql`
- Leitura que falta criar: `api/routes/soul-signature.js` e `api/routes/twin-portrait.js` leem `personality_scores` e **nunca** `behavioral_evidence`
- Render: `src/pages/components/soul-signature/BigFivePanel.tsx` (hoje sem uma única menção a evidência ou fonte)
- Padrão de UI para reaproveitar: `src/pages/insights/components/EvidenceSection.tsx` e `src/components/chat/MessageList.tsx` (os recibos do chat, commit `9da39ded`)

**Nota da primeira passada:** o spike ficou mais barato do que o escrito em
22/08. A tabela de proveniência **já existe e já é escrita** — o buraco é que
ela é *write-only*: nenhuma rota e nenhum arquivo de `src/` a lê de volta. O
experimento deixa de ser "modelar duas tabelas de aresta" e passa a ser "ligar
o que já está gravado ao render, e ver se a evidência agregada basta". A
condição de parada original continua valendo e fica **mais provável**: a
evidência gravada é *feature* (`feature_name` + valor normalizado), não evento
nomeável.

**Status:** aberto

---

### desa-hibrido — Busca híbrida assimétrica no pgvector + full-text
**Origem:** INTEL 2026-08-22 · **Veredito:** PROTOTIPAR 13/15 (P3 A3 D2 E3 L2)
**Fonte:** [DESA, arXiv 2608.15851, 16/ago](https://arxiv.org/abs/2608.15851)

**O mecanismo:** expandir a query de forma simétrica quebra busca híbrida. O
DESA trata cada canal em separado — no denso, a passagem gerada por LLM entra
como expansão residual ortogonal; no esparso, ancoragem por produto de scores
sem alargar o suporte lexical. Resultado em 7 datasets do BEIR: +3,82% nDCG@10,
+2,38% Recall@20, com ~37% menos profundidade de acesso nos dois canais.

**Ataca o gap:** `known_gaps[2]` — recuperação hoje é embedding puro, sem
híbrido.

**Hipótese:** se a busca sobre a vida digital usar denso + full-text com
expansão assimétrica, a recuperação melhora **e** o I/O cai — o que importa
mais no Supabase, onde profundidade de acesso é conta no fim do mês.

**Spike (4h):** montar 30 queries reais sobre um perfil de teste ("o que eu
ouvia quando estava estudando pra prova"). Rodar três configurações: só denso
(hoje), híbrido ingênuo com RRF, DESA. Julgamento manual de relevância nos
top-10.

**Medir:** nDCG@10 nas três, mais linhas lidas por query. Sucesso: DESA bate
o denso puro em ≥5% de nDCG **sem** aumentar linhas lidas.

**Parar se:** híbrido ingênuo com RRF já pegar a maior parte do ganho — aí
implementa o simples e o DESA vira nota no Radar.

**Toca:**
- Camada de retrieval: `api/services/memoryStreamService.js` (o blend léxico está nas linhas ~1321-1333; o filtro por tipo passa pela ~1691)
- Canal léxico atual: `api/services/bm25Service.js` — BM25 em JS, peso `BM25_BLEND_WEIGHT = 0.10` em `twin-research/twin-config.js`
- Geração do vetor: `api/services/embeddingService.js`
- RPCs e índices: `database/supabase/migrations/20260222_add_memory_stream_vector_search.sql` (`search_memory_stream` + HNSW), `database/migrations/20260804_two_phase_mmr.sql`, `database/migrations/20260804_partial_hnsw_conversation.sql`
- O índice full-text que existe e ninguém usa: `database/supabase/migrations/20260204_create_user_memories.sql` cria `idx_user_memories_content_gin` com `to_tsvector`, e **nenhuma RPC do repo usa `to_tsquery`/`websearch_to_tsquery`**
- Harness pronta para as 30 queries: `twin-research/memory-eval.js`, `twin-research/multi-run-eval.js`

**Nota da primeira passada:** o repo já tem rescoring léxico, mas **não tem
canal esparso independente** — o BM25 roda sobre candidatos que o canal denso
já trouxe. A comparação do spike ganha um terceiro braço óbvio e barato: usar
o índice GIN que já está criado como canal esparso de verdade. Atenção ao
precedente: um índice FTS irmão foi **dropado por não uso** em
`database/supabase/migrations/20260514_audit_l2_drop_unused_indexes_pass1.sql`.
E o próprio `twin-config.js` registra que o blend de 10% nunca foi validado
pelo eval — medir isso é parte do spike, não pressuposto dele.

**Status:** aberto

---

### mcb-portao-escrita — Gravar, verificar ou perguntar antes de fixar persona
**Origem:** INTEL 2026-08-22 · **Veredito:** PROTOTIPAR 11/15 (P3 A2 D2 E2 L2)
**Fonte:** [MCB, arXiv 2608.19564, 20/ago](https://arxiv.org/abs/2608.19564)

**O mecanismo:** benchmark de 140 cenários sobre a decisão de commit de
memória. Achado central é uma assimetria: os modelos verificam fatos mutáveis
com razoável confiabilidade, mas quase nunca pedem esclarecimento diante de
ambiguidade. Acurácia sobe de 0,557 para 0,771 só com few-shot, e nos modelos
Claude só 57% das decisões declaradas batem com a tool efetivamente chamada.

**Ataca o gap:** `known_gaps[1]` — sem política de esquecimento; inferência
errada de persona vira permanente.

**Hipótese:** se a escrita de traço passar por um classificador de três vias —
gravar / verificar depois / perguntar ao usuário — a taxa de traço errado
fixado cai sem que o produto fique perguntando o tempo todo.

**Spike (4h):** interceptar a escrita de persona com um passo que classifica em
`commit`, `provisional` (grava com TTL e re-checa em 30 dias) ou `ask` (vira
um card no app). Few-shot com 8 exemplos, conforme o ganho medido no paper.
Rodar sobre 50 traços já gerados.

**Medir:** dos traços que hoje entram como definitivos, quantos o classificador
mandaria pra `provisional` ou `ask` — e, desses, quantos um humano concorda
que eram frágeis. Sucesso: concordância ≥70%.

**Parar se:** mais de 40% cair em `ask`. Um produto que pergunta o tempo todo
quebra a promessa de revelar sem interrogar.

**Toca:**
- Os escritores de persona a interceptar: `api/services/evidenceGeneratorService.js` (upsert em `behavioral_evidence`), `api/services/behavioralEvidencePipeline.js`, `api/services/reflectionEngine.js`, `api/services/twinEvolutionService.js`, `api/services/soulSignatureService.js`, `api/services/bigFiveAssessmentService.js`, `api/services/personalityProfileService.js`
- Entrada genérica de memória: `addMemory` em `api/services/memoryStreamService.js`
- **O caminho `ask` já está construído — para diretivas de chat, não para traços:** `database/migrations/20260527_create_twin_directives.sql` (`twin_directives` com `status`, `reinforcement_count`, `user_edited` e proveniência por `source_message_id`; mais `twin_corrections` como trilha de auditoria) e `api/routes/twin-directives.js`
- Precedente de TTL/expiração: `database/supabase/migrations/20260728110058_add_memory_supersession.sql` e `api/routes/cron-memory-forgetting.js`

**Nota da primeira passada:** metade do spike já existe em outro lugar do
produto. O classificador de três vias pode reusar a máquina de `twin_directives`
em vez de inventar uma. O gap real que ele ataca continua aberto: o esquecimento
está resolvido para **memória** (cron de 5 tiers, supersessão, decay Ebbinghaus)
e não existe para **persona** — `behavioral_evidence` tem um `UNIQUE` que faz o
upsert sobrescrever sem versionar.

**Status:** aberto

---

### antiskill-local — Vazamento de persona destilada e o caso da ingestão local
**Origem:** INTEL 2026-08-22 · **Veredito:** PROTOTIPAR 11/15 (P3 A1 D2 E2 L3)
**Fonte:** [AntiSkillBench, arXiv 2608.03700, 04/ago](https://arxiv.org/abs/2608.03700) — Xiang et al.

**O mecanismo:** 7.500 traces de diálogo a partir de 50 perfis comportamentais,
medindo vazamento no nível da skill e divulgação de atributo mais impersonação
no nível do agente, sob três estratégias de destilação. Conclusão dura: o
vazamento não para em atributo explícito — alcança padrão de comunicação e
traço de personalidade, o suficiente pra impersonação. As quatro defesas
testadas, ativas e passivas, têm eficácia limitada e não generalizam.

**Ataca o gap:** `known_gaps[4]` — a ingestão hoje passa por servidor e a
promessa de local ainda não é verdade. Isto é o argumento técnico pra fechar
essa dívida, e de quebra a espinha de um diferencial de posicionamento.

**Hipótese:** se a inferência de persona rodar no app Tauri e só o vetor
derivado subir, o TwinMe consegue afirmar algo que Gemini e ChatGPT não podem
— e a afirmação é verificável, não marketing.

**Spike (1 dia):** mapear, no fluxo atual, exatamente que bytes saem da máquina
do usuário em cada etapa da ingestão. Desenhar a variante em que o parsing e a
inferência de traço acontecem no Tauri. Medir o que sobra pra subir e se roda
em máquina modesta com modelo pequeno.

**Medir:** tamanho e sensibilidade do payload que ainda precisa sair, e latência
da inferência local. Sucesso: nada que identifique conteúdo bruto sai, e a
inferência roda em menos de 30s numa máquina de 16 GB.

**Parar se:** a inferência local exigir modelo que não cabe no laptop mediano
do público-alvo. Aí o caminho é criptografia e retenção mínima no servidor, e
o copy muda de "local" para "efêmero".

**Toca:**
- O que sai da máquina hoje: `desktop/src-tauri/src/sync.rs` (posta para `/api/observations/clip`) e `desktop/src-tauri/src/clips.rs` (o payload tem `app_name`, `window_title` e **`content`**)
- O que o servidor aceita: `api/routes/observations-clip.js` — `MAX_CONTENT_CHARS = 8000` por clip, `MAX_CLIPS_PER_BATCH = 100`
- Outros três portões de saída: `api/routes/extension-data.js` (extensão), `api/services/observationIngestion.js`, e o caminho OAuth em `api/routes/oauth-callback.js`
- A inferência local que já compila e não está plugada: `desktop/src-tauri/src/transcribe.rs` (whisper.cpp; `transcribe_wav` marcado `#[allow(dead_code)] // wired into the capture -> transcribe pipeline in a later 5B unit`)
- O que roda server-side e precisaria de equivalente local: `api/services/embeddingService.js`, `api/services/evidenceGeneratorService.js`, `api/services/personalityProfileService.js`

**Nota da primeira passada:** o critério de sucesso escrito em 22/08 — *"nada
que identifique conteúdo bruto sai"* — **já é falso por construção**, e agora
com número: 8.000 caracteres de conteúdo bruto por clip, 100 clips por batch.
O spike não precisa mais da etapa de mapeamento; ela está feita. O que ele
tem a decidir é se whisper.cpp, já compilado no binário, consegue ser o
primeiro estágio local de verdade. Ver a divergência sobre `bets[2]` no
`STATE.md`: a promessa de "local" ainda não é feita como copy em lugar nenhum,
então ainda não há dívida pública — só uma aposta não cobrada.

**Status:** aberto

---

### deepseek-v4-flash — Migrar análise e extração para o sucessor da V3.2
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 13/15 (P3 A3 D2 E3 L2)
**Fonte:** [tabela de preços da DeepSeek](https://api-docs.deepseek.com/quick_start/pricing) · [changelog](https://api-docs.deepseek.com/updates/)

**O mecanismo:** a DeepSeek retirou `deepseek-chat` e `deepseek-reasoner` em 24/07 e hoje
lista só a família V4. A V3.2 **não quebrou aqui** — a checagem contra
`openrouter.ai/api/v1/models/deepseek/deepseek-v3.2/endpoints` mostra 14 provedores
servindo o modelo, com a própria DeepSeek ausente da lista, e por isso o preço por
horário de pico que entrou em 16/08 custa US$ 0,00 a mais neste projeto. O que muda é
outra coisa: o sucessor está no mesmo gateway a **US$ 0,055–0,14 in / US$ 0,11–0,28 out**
contra US$ 0,26 / US$ 0,38 pagos hoje, com **1.048.576 de contexto contra 163.840**.

**Ataca o gap:** `known_gaps[3]` — o orçamento de contexto é por contagem de itens porque
o contexto é curto. Seis vezes mais contexto muda o desenho do orçamento.

**Hipótese:** se `TIER_ANALYSIS` e `TIER_EXTRACTION` migrarem para
`deepseek/deepseek-v4-flash`, o custo medido por rodada da harness cai ≥50% sem o score
de fidelidade cair abaixo da baseline.

**Spike (4h):** trocar as duas entradas de análise e extração em `api/config/aiModels.js`
(mais a linha em `MODEL_PRICING`), **deixando `TIER_CHAT` e `CHAT_TIER_DEEP` em V3.2**
nesta passada para manter a conversa fora do raio de explosão. Rodar
`twin-research/fidelity-eval.js` duas vezes em cada modelo. Verificar em separado se o
formato de saída dos extratores continua parseável sem reescrever prompt.

**Medir:** delta do score ≥ 0 dentro do ruído das duas rodadas **e** queda de custo por
rodada ≥50%. Registrar p95 de latência: regressão >20% invalida o ganho, dado o risco
residual de 57s já assumido em `52b40c42`.

**Parar se:** o score cair abaixo da baseline, ou o v4-flash exigir reescrita de prompt
para manter o formato de saída dos extratores — aí deixa de ser troca de string e o
spike morre aqui.

**Toca:** `api/config/aiModels.js`, `api/services/chatRouter.js`, `api/services/llmGateway.js`, `tests/unit/chatRouterModel.test.js`, `twin-research/fidelity-eval.js`
**Status:** aberto

**Decisão que fica com o Stefano:** o `settled` fixa o *modelo* ou a *política*? Hoje diz
"DeepSeek V3.2 é o padrão inclusive no tier Deep". Poderia dizer "o padrão é o DeepSeek
mais barato que passa na harness". Só você reescreve `settled`.

---

### extensao-single-purpose — Podar a extensão até caber no propósito declarado
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 13/15 (P3 A2 D3 E2 L3)
**Fonte:** [Chrome Web Store policy updates 2026](https://developer.chrome.com/blog/cws-policy-updates-2026)

**O mecanismo:** desde 01/08 a Limited Use exige que todo dado coletado seja
"strictly necessary to the extension's disclosed single purpose", a divulgação passa a
cobrir tudo que é coletado independentemente de relação com o propósito, e mudança de
tratamento depois da instalação exige notificação proativa. Sanção é remoção da loja.

**Por que dói aqui:** a extensão v3.10.2 já foi rejeitada uma vez — `c45153f8` (05/07)
registra que a revisão automática do Chrome classificou as permissões wildcard como
"surveillance malware. Hard block." E hoje há três exposições nomeáveis:
1. `manifest.json` mantém `host_permissions` para **linkedin.com e twitch.tv**,
   plataformas cortadas do portfólio em `e2b804d2` / `d156e4b2` — permissão sem propósito.
2. `content/stress-shop-nudge.js` opera sobre iFood, Amazon BR, Mercado Livre e Shein —
   intervenção de compra é um **segundo propósito**, distinto de "seu gêmeo aprende com
   seus padrões de navegação".
3. `src/pages/PrivacyPolicy.tsx` está em "Last updated: February 23, 2026" e não menciona
   os coletores de Instagram, Discord e LinkedIn, que entraram em `000532a1` (06/06) e são
   ingeridos de fato em `api/routes/extension-data.js` — coleta não divulgada e mudança
   pós-instalação sem notificação.

**Hipótese:** se medirmos o volume ingerido por superfície nos últimos 30 dias, as
superfícies fora do propósito declarado somam <15% dos eventos — então dá para podá-las
e ficar conforme sem custo real de fosso.

**Spike (6h):** (1) query em `user_platform_data` por `platform` + `data_type` nos últimos
30 dias, cruzada com as observações geradas em `api/routes/extension-data.js`. (2) diff
literal entre as superfícies reais de coleta (`host_permissions` + `content_scripts` +
permissão `history` + `sendToBackend` em `background.js`) e o que a política declara.
(3) redigir a frase de single purpose candidata e checar cada permissão contra ela.

**Medir:** tabela de % de eventos por superfície. Sucesso: superfícies fora do propósito
somam <15% **e** a nova seção de extensão da política cobre 100% das superfícies
remanescentes — zero item de coleta sem linha correspondente.

**Parar se:** LinkedIn + Twitch + import de histórico + nudge passarem de 30% do volume
ingerido. Aí não é poda técnica, é decisão de produto sobre o que a extensão é, e sobe
para o Stefano em vez de virar PR.

**Toca:** `browser-extension/manifest.json`, `browser-extension/background.js`, `browser-extension/content/stress-shop-nudge.js`, `browser-extension/collectors/{linkedin,twitch,discord,instagram}.js`, `api/routes/extension-data.js`, `src/pages/PrivacyPolicy.tsx`
**Status:** aberto

---

### mcp-contexto-portatil — Servir o gêmeo por MCP e medir se o retrato é o produto
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 11/15 (P3 A2 D2 E1 L3)
**Fontes:** cinco produtos fundidos num movimento — [AI Passport (YC S26)](https://www.ycombinator.com/launches/St3-egoist-machines-user-owned-hyper-personalisation-infrastructure-for-web-4-0), [MemoryBox](https://www.prnewswire.com/news-releases/memoryboxai-announces-beta-launch-of-private-ai-memory-for-power-users-302844359.html), [memmy-agent](https://github.com/MemTensor/memmy-agent), [fyagent](https://github.com/fy-agent/fyagent), [Lore](https://github.com/dipakkrishnan/lore-mcp)

**O mecanismo:** cinco times independentes convergiram em três semanas na mesma forma —
armazém de contexto pessoal que o usuário controla (SQLite local, on-device ou backend
por usuário), exposto a assistentes arbitrários por serviço local ou handshake tipo OAuth
com escopo por pedaço e prazo. **O que nenhum deles faz:** inferir qualquer coisa sobre a
pessoa. Guardam e encanam contexto; não há traço, retrato, proveniência nem avaliação de
fidelidade em lugar nenhum do movimento.

**A peça que já existe e está dormente:** `api/mcp-server/` expõe seis tools
(`chat_with_twin`, `get_soul_signature`, `get_patterns`…) e quatro resources
(`twin://soul-signature`, `twin://personality`) por MCP com chave `twm_`. Está parado
desde março e ainda depende de `@anthropic-ai/sdk`, que `af69a4db` tirou do produto.

**Hipótese:** se o contexto do gêmeo for servido por MCP a um assistente de terceiros e a
fidelidade da resposta se mantiver perto da do chat nativo, o produto é o **retrato** e
não o encanamento. Se despencar, o fosso real está no prompt montado em
`twinPromptAssembly.js`, e expor contexto entrega o dado sem entregar o valor.

**Spike (1 dia):** reanimar `api/mcp-server/` (trocar o SDK da Anthropic por OpenRouter,
buildar, gerar chave). Rodar a bateria de `twin-research/fidelity-eval.js` em dois braços
sobre o mesmo usuário de teste: (a) chat nativo, (b) cliente MCP externo consumindo só
`twin://soul-signature`, `twin://personality` e `get_patterns`. Em paralelo, fechar um
buraco que as fontes tornam evidente: `POST /api/api-keys` cria chave **sem `scopes`** e
nunca preenche `expires_at`, embora a coluna exista.

**Medir:** score da harness nos dois braços. Sucesso: o braço MCP fica dentro de 10% do
nativo. Secundário: chave com escopo e `expires_at` barra `get_soul_signature` quando não
concedido, verificado por teste.

**Parar se:** buildar o `api/mcp-server/` custar mais de 4h, ou o braço MCP cair mais de
25%. Nesse caso o veredito inverte — de "expor contexto" para "nunca expor contexto cru"
— e a resposta ao movimento passa a ser a direção oposta: um parser de export de
ChatGPT/Claude em `api/services/exports/registry.js`, que hoje tem três parsers e nenhum
de conversa com assistente, apesar de `api/routes/claude-sync.js` já ler `~/.claude`.

**Toca:** `api/mcp-server/src/server.ts`, `api/mcp-server/package.json`, `api/routes/api-keys.js`, `api/routes/mcp.js`, `twin-research/fidelity-eval.js`, `api/services/exports/registry.js`
**Status:** aberto
