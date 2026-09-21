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

> **Passada de 2026-09-21 (money twin, Instinct teardown).** Fonte única: o teardown
> do Instinct escrito pelo Stefano em 21/09 (Claude Doc `3uCiDnABuBYdker1Ce4EHx`; seis
> pesquisadores, DNS, certificados, bundle público, sem nada atrás de login), lido inteiro
> e cruzado com o repositório. Quatorze movimentos triados: 2 PROTOTIPAR (em
> `BACKLOG.md`: `entradas-tipadas`, `setup-por-oferta`), 2 DISCUTIR (abaixo), 7 REGISTRAR
> (Radar), 3 DESCARTAR (Stripe Link só nos EUA; iMessage sem vendedor na UE; sandbox
> E2B, nada aqui navega). A pergunta do endereço de recibos (14/09, abaixo) continua
> aberta e o teardown só a reforça: o e-mail do Instinct é SES inbound + envio.

> **Passada de 2026-09-21 (varredura semanal — feed do resumo matinal preso em 2026-08-22,
> tratado como vazio; 6 `intel-scout` em paralelo, ~44 candidatos crus, 26 lidos a fundo).**
> STATE.md reescrito (28 dias, 50 commits: money virou o produto de fato, gêmeo legado
> estacionado em produção). Uma linha inequívoca acrescentada a `settled` em
> `intel.config.json` (money-first é fato em produção). 3 PROTOTIPAR novos em `BACKLOG.md`
> (`fidelidade-minimal-facts`, `dinheiro-por-telefonema`, `supabase-health-via-mcp`), 3
> DISCUTIR novos (abaixo), 2 pernas fundidas em spikes já abertos (`mcp-contexto-portatil`,
> `dia-hurdle`), 11 REGISTRAR (Radar), 3 DESCARTAR, mais os candidatos que não passaram do
> gate de escopo. Divergência nova em `STATE.md`: `one_line`/`bets` do config ainda
> descrevem o gêmeo digital como o produto; `CLAUDE.md` diz o oposto desde 19/09.

### [DISCUTIR 10/15] O número do dia chega onde a pessoa já está (WhatsApp), ou fica na página?
**Data:** 2026-09-21 · **Fonte:** teardown (seção "Reception", "What TwinMe can take"); atualizado na varredura semanal com [preço exato da Meta a partir de 1/10/2026](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages) e [Félix (US$200M Série C, WhatsApp financeiro para a diáspora latina)](https://news.crunchbase.com/venture/fintech-whatsapp-remittance-startup-felix-raises-200m-a16z-general-catalyst/) · **Eixos:** P3 A2 D2 E1 L2
**O que é:** o que os usuários do Instinct elogiam é o que chega sem pedir (follow-up de fio largado, relatório diário) num canal que já abrem; o Meta Muse fez o mesmo em 8/09. O teardown conclui que a forma defensável na UE é um assistente de dinheiro no WhatsApp em que a IA é acessória ao serviço (a categoria que a política da Meta permite), com pagamentos feitos pela pessoa. Félix prova, em escala (US$8bi processados, 6M+ pessoas), que banking inteiro roda nativamente dentro do WhatsApp para um público leigo/imigrante — mesmo canal, produto mais pesado (banking licenciado vs. ledger que nunca move dinheiro).
**Correção de números (varredura semanal):** a tarifa de 1/10 só atinge mensagem de **serviço** dentro da janela de 24h aberta pelo usuário — 1.000 grátis por número por mês, ~€0,0166/mensagem depois disso (não os US$0,0200 citados na primeira leitura). Uma mensagem de **template** (push frio, sem o usuário ter escrito antes) já era paga antes de outubro e continua na mesma tarifa — a novidade de outubro é irrelevante se o desenho for manter a janela de 24h aberta por uso diário do twin, e o free tier provavelmente cobre folgadamente um piloto de 3 pessoas (~90 mensagens de serviço/mês).
**Por que toca este projeto:** o número do dia (`allowance.js`), a cobrança de amanhã (`chargesSoon`) e o prazo de devolução (`returns.js`) só existem em `/money`; ninguém recebe nada. As rotas de WhatsApp do gêmeo antigo existem (`api/routes/cron-morning-briefing.js`, `api/services/messageRouter.js:deliverInsight`) mas estão atrás de `LEGACY_TWIN_ENABLED=false` e falam do gêmeo, não do dinheiro. O `settled` do `intel.config.json` ainda diz "captura financeira é por WhatsApp" (linha velha, ver passada de 14/09).
**A pergunta:** uma mensagem por manhã ("Hoje: 14,60 EUR; Higgsfield cai amanhã") no WhatsApp para você e os dois amigos, medindo abertura de `/money` e custo por mensagem, ou a página continua sendo o único lugar? E, se sim: o design mantém a janela de 24h aberta (o usuário conversa com o twin todo dia, a mensagem matinal entra como resposta, free tier cobre a escala atual) ou é push frio de template (sempre pago, com ou sem 1/10 — nesse desenho Telegram já era mais barato, sem prazo)?

### [DISCUTIR 9/15] O telefone diz onde a pessoa está, e a viagem entra sozinha na agenda?
**Data:** 2026-09-21 · **Fonte:** teardown (Features: localização ao vivo por iMessage, gatilhos de chegada e saída, perguntas de histórico, controle de apagar; post do fundador de 5/09) · **Eixos:** P2 A2 D2 E1 L2
**O que é:** o Instinct recebe a localização ao vivo e reage a chegar e sair de um lugar; a pessoa pode apagar o histórico.
**Por que toca este projeto:** hoje a viagem entra por frase ("vou a Bilbao de sexta a domingo", `when.js`, PR #452) e a banda do dia só alarga com um dia marcado como fora (`calendar.js`, ideia 7 esperando dado: 1 dia fora em 75). O app Android já lê notificações do banco (`twinme-phone-capture`); localização é uma permissão a mais e um canal a mais, e o produto vende privacidade como feature.
**A pergunta:** o telefone pode mandar "estou fora de Madrid" (só a cidade, só quando muda), para a viagem contar sem ninguém digitar, ou a localização fica fora por princípio?

### [DISCUTIR 10/15] O gateway de LLM vale um roteamento EU-only, ou é teatro de compliance?
**Data:** 2026-09-21 · **Fonte:** [OpenRouter — in-region routing (US) + tier Business self-serve](https://openrouter.ai/blog/announcements/us-in-region-routing/) (2026-09-09) · **Eixos:** P3 A2 D2 E2 L1
**O que é:** OpenRouter estende o roteamento in-region (já existia para a UE) aos EUA, e o tier Business (residência de dados garantida por região) virou self-serve — sem contrato, sem mínimo mensal, fee de 8% sobre compra de crédito contra 5,5% no Standard. Sem fallback cross-region: se nenhum provedor in-region serve o modelo pedido, a chamada falha com 404 em vez de cair para infraestrutura global.
**Por que toca este projeto:** `api/services/llmGateway.js` é o gateway único de LLM do TwinMe, cliente direto do `baseURL` global da OpenRouter (linha 235). O produto atende estudantes na Espanha, mas não há hoje nenhum requisito de residência de dados na UE registrado no projeto, e GDPR aceita transferência com salvaguardas contratuais — não exige fisicamente manter dados na UE. O 404 sem fallback contraria o desenho atual do gateway, que investe em circuit breaker e retries para nunca cair; e não está confirmado que o DeepSeek V3.2 (modelo padrão) tem provedor in-region na UE.
**A pergunta:** vale pagar 8% (vs 5,5%) e aceitar chamadas sem fallback só para poder dizer "os dados de inferência não saem da UE" — ou isso é teatro de compliance sem exigência legal real por trás, já que nenhum cliente ou regulador pede isso hoje?

### [DISCUTIR 8/15] Vale trocar CDN por preço fixo, mesmo sem saber o consumo real?
**Data:** 2026-09-21 · **Fonte:** [Vercel — Flat Rate CDN GA para times Pro](https://vercel.com/changelog/flat-rate-cdn-is-now-ga-for-pro-teams) (2026-09-08) · **Eixos:** P1 A2 D2 E2 L1
**O que é:** Vercel troca a fatura de CDN por uso (requests, Fast/Blob/Sandbox Data Transfer) por um valor fixo por tier: incluído no Pro até 1M requests/1TB, depois US$20/mês (10M/50TB), US$100/mês (50M/50TB), US$300/mês (150M/50TB); tráfego acima da capacidade não sobe de tier nem degrada, sujeito a fair-use.
**Por que toca este projeto:** `CLAUDE.md` tem uma seção "Vercel Cost Rules" inteira por causa do estouro de US$375 de março de 2026 — mas a causa raiz documentada (`tests/goals/vercel-cost-rules.goal.test.js`) foi cron mais frequente que */15 e `maxDuration` acima de 60s, ou seja, **compute (GB-hora)**, não CDN; as duas regras já estão em conformidade hoje. Sem visibilidade do consumo real de CDN do TwinMe (app signed-in, não site de alto tráfego público), não dá para saber se isto mudaria a fatura.
**A pergunta:** vale conferir `vercel usage` antes de decidir se liga o Flat Rate CDN, ou esse gasto é irrelevante perto do que já causou o estouro histórico?

### [DISCUTIR 8/15] Decompor a incerteza do juiz do chat vale a construção de um dataset de rótulos?
**Data:** 2026-09-21 · **Fonte:** [Decomposing LLM-Judge Uncertainty to Target Expert Labels, arXiv 2609.06444](https://arxiv.org/abs/2609.06444) (2026-09-06, Composo AI) · **Eixos:** P2 A2 D1 E2 L1
**O que é:** separar a incerteza epistêmica (o juiz não sabe) da aleatória (desacordo real, nenhum rótulo reduz) num juiz-LLM, via regressão bayesiana leve sem chamadas extras, corta 83% mais erro que rotear por incerteza total — mas o próprio autor admite que, no único dataset de desacordo humano real testado (ChaosNLI), uma heurística trivial (escalar os itens menos rotulados) empata esse resultado.
**Por que toca este projeto:** `scripts/money/chat-eval.mjs` é o harness ativo (65+ cenários) com um único juiz LLM de pergunta binária; `docs/roadmap/PROGRESS.md` documenta em quase toda rodada (2, 5, 6, 9, 10, 11) falsos-negativos desse juiz único em respostas corretas, e o código comenta que o DeepSeek "flipped between 2 and 0 on the same reply across runs".
**A pergunta:** vale montar um dataset estruturado dos rótulos históricos (as releituras manuais de "judge-0" já feitas em cada rodada) para testar se a decomposição epistêmica corta releitura abaixo do que já é gasto revisando toda falha — ou o harness é pequeno demais para o ganho compensar o trabalho de construir a calibração?


> **Passada de 2026-09-14 (money twin).** Rodada a partir da revisão de pesquisa de 13/09
> (cinco agentes; página em https://claude.ai/code/artifact/39ccecb0-ffdd-4cc9-a177-e09a48eb3043),
> um analista por item, seis itens. Manutenção: `intel.config.json` ainda diz em `settled`
> que "agregadores bancários estão fora; captura financeira é por WhatsApp (4a74a4d6)". O
> money twin lê o Santander pelo Enable Banking em produção desde 2026-09-08 e o endereço
> de recibos recebe os alertas do banco desde 13/09. Um dos analistas raciocinou a partir
> da linha velha. **Cabe ao Stefano reabrir e reescrever essa entrada; ela não foi editada.**

### [DISCUTIR 10/15] O charge-ahead quer ser o alerta da FCA, ou é uma linha de orçamento com citação emprestada?
**Data:** 2026-09-14 · **Fonte:** [FCA Occasional Paper 36](https://www.fca.org.uk/publication/occasional-papers/occasional-paper-36.pdf) · **Eixos:** P2 A2 D3 E2 L1
**O que é:** dois bancos britânicos auto-inscreveram 1,5 milhão de clientes em SMS na manhã em que um débito não tem saldo, ou na manhã seguinte ao saldo cair abaixo de zero. Efeitos fixos em três vias: tarifas de item devolvido -21% a -24%, descoberto não autorizado -25%, episódios de 2+ dias -19,7%; usuários raros -27% a -51%, pesados -10% a -20% e muitas vezes não significativo. Nenhum efeito em saldo médio ou logins: o mecanismo é antecipar uma transação no próprio dia (54% resolvem no mesmo dia), não mudar hábito. Não é ITT, dados confidenciais, e a fonte **não cobre** um aviso dias antes da cobrança.
**Por que toca este projeto:** `api/services/money/nudges.js` (PR #332) cita este paper para a linha "charge ahead", que compara as cobranças dos próximos 7 dias com o que sobra do mês, sem saldo (`allowance.js:7`) e recusando qualquer "pague agora". Nenhum dos três ingredientes medidos (saldo real, mesmo dia, ação que fecha o buraco antes do corte) está lá. Nota do mesmo analista: a regra de aposentar uma linha silenciada lê `money_readings.verdict`, e nada em `src/` nem em `api/routes/money.js` escreve esse campo desde que os controles True / Not me saíram; a regra está ligada e inerte.
**A pergunta:** a linha é o alerta da FCA (então o spike é um sinal de saldo, a coluna "saldo" do extrato Santander em `importer.js:128` ou o que o feed devolve, e janela de um dia) ou é uma linha de orçamento (então a citação sai e o comentário para de prometer um quarto a menos de tarifas)? E o mute: um "Not me" quieto na linha, ou a não-ação como sinal?

### [DISCUTIR 10/15] Emprestar força: pooling entre usuários é código morto com um ledger só. Muda de eixo?
**Data:** 2026-09-14 · **Fontes:** [Bai e Chu, TSB hierárquico](https://arxiv.org/abs/2511.12749) · [Zhang et al., IBM/WageGoal 2018](https://arxiv.org/abs/1806.05362) · **Eixos:** P3 A2 D2 E2 L1 (fundidos: dois itens, o mesmo movimento)
**O que é:** o TSB-HB encolhe cada série intermitente para o prior do seu grupo com peso n/(n+phi), phi estimado por empirical Bayes; RMSE -5,5% sobre o TSB no UCI Online Retail, mas MAE +3,5% e RMSSE -0,3%, sem teste de significância. O paper da IBM (19 usuários, 25 janelas, sem código) mostra que uma média aparada com recorrentes fixados nos seus dias bate Prophet e ARMA, e que o pooling por sequência entre usuários só paga em contas com ritmo de salário, exigindo dezenas de históricos de saldo.
**Por que toca este projeto:** `api/services/money/priors.js` (PR #331) implementa exatamente o n/(n+phi) com PHI = 4 fixado à mão e `MIN_POOL_USERS = 2`, leave-one-out; em produção há um ledger, então o prior cruzado é inerte até haver o segundo usuário. O paper faz a taxonomia dentro de um só histórico (classes ADI/CV²), o que funcionaria hoje por `money_places.category`. `projection.js` usa medianas por dia da semana onde a IBM usa média aparada do decil superior; `calibration.js` já pontua previsões diárias, então a comparação cabe numa tarde.
**A pergunta:** o money twin será multiusuário cedo o bastante para valer estimar phi por empirical Bayes entre pessoas, ou o pooling muda de eixo agora, comerciantes de um mesmo usuário encolhidos para a categoria dele? E vale a checagem barata primeiro: média aparada da IBM contra a mediana por dia da semana, pontuada com os `day_total` que já existem no seu ledger?

### [DISCUTIR 8/15] O endereço de recibos fica só leitura, ou ganha um lado de envio?
**Data:** 2026-09-14 · **Fonte:** [Noah Shinn, 8/set](https://x.com/noahrshinn/status/2097443132816396649) · **Eixos:** P2 A1 D2 E1 L2
**O que é:** cada Instinct recebe um endereço em mail.instinct.com (vivo, 302 para app.instinct.com/mailbox) com o qual cria contas, confirma reservas e contata negócios em nome da pessoa; "primeiro passo para o Instinct possuir e operar as próprias contas", encadeado com Vault/1Password (4/set), Stripe Link com cartão de uso único (28/ago) e TOTP (11/set). Copy de lançamento, zero números.
**Por que toca este projeto:** o money twin shipou o mesmo primitivo uma semana depois (`api/services/money/inbox.js`, PR #324: `r-<hex>@in.twinme.me` por pessoa) com semântica oposta: só lê o que a pessoa ou o banco mandam, não envia nada, e `PrivacyPolicy.tsx` promete isso. O Instinct usa o endereço para agir e por isso vê a compra na origem.
**A pergunta:** o endereço fica só leitura por desenho (o leitor de recibos que não age) ou ganha envio: responder a um aviso de aumento de preço, pedir a fatura, cancelar a assinatura que a leitura apontou? A segunda exige reescrever a linha de privacidade e decidir se o twin fala com terceiros em nome da pessoa, o que hoje não está em `settled` nem em `bets`.

> Dois itens desta seção foram **decididos em 2026-08-25** e estão marcados
> DECIDIDO no corpo: o número público de fidelidade e o vocabulário "digital
> twin". Ficam aqui para registro do raciocínio; não precisam ser rediscutidos.

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

**DECIDIDO em 2026-08-25 (PR #266) — opção (a).** O número fica e ficou honesto: o
payload publica `normalized_fidelity` quando existe, com `self_consistency`, n, wave e
data, sob "Not a clinical measure"; o bruto virou fallback rotulado.

A investigação achou algo pior que a legenda. `wave` reinicia em 1 a cada revisão de
bateria, e as duas leituras ordenavam só por `wave` — com as três checagens reais empatadas
em wave 1, o Postgres escolhia. A página pública servia **0.825 da bateria v1 aposentada
(20 itens, 3/ago)** enquanto a v3 corrente media **0.610 (12/ago)**: o maior dos três, de
uma versão que não existe mais, sem data até a correção da legenda. As duas queries agora
ordenam `battery_version, wave, created_at`, com teste de regressão que grava as chamadas
de `order()`.

(b) tirar o número e (c) aceitar o risco continuam disponíveis — o bloco está a um delete
de (b). (a) foi escolhida por ser a única que não exige juízo de negócio: torna a afirmação
verdadeira em vez de removê-la ou defendê-la.

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

**DECIDIDO em 2026-08-25 (PR #266).** "digital twin" saiu da UI — 11 strings viraram
"your twin" / "soul signature" em notificações, waitlist, onboarding, progresso e privacidade.

Ficou deliberadamente em dois lugares: **Terms e Privacy**, onde é a definição em linguagem
simples do que o serviço faz (reescrever definição legal para ganhar discussão de
posicionamento deixa o documento menos exato, não mais atual), e nos **prompts de LLM**
(`TWIN_BASE_INSTRUCTIONS` etc.), que nenhum usuário lê e onde mudar texto é mudar
comportamento — deve ao harness de fidelidade uma rodada, e a regra de `settled` é que flag
só entra se mover o score. Se o termo sair dos prompts, que seja de carona numa mudança que
já vá ser avaliada.

---

### [DISCUTIR 10/15] A faixa do dia deve ser uma largura que se vê, nunca um selo de "confiável"
**Fonte:** [Reyes, Massoumi, Batmaz, Kersten-Oertel — Shades of Uncertainty, 2026](https://arxiv.org/abs/2602.01264) (dois estudos, N=37 e N=10) · corroborado por [Srivastava et al., 2026](https://arxiv.org/abs/2602.00248) noutro domínio.
**Mecanismo:** codificação contínua da incerteza (uma faixa com largura) melhora a confiança *calibrada* e faz o leigo notar os limites do modelo; codificação binária (presente/ausente, confiável/não) aumenta a confiança sem aumentar a precisão dela. P2 A3 D2 E2 L1.
**Onde toca:** `src/pages/money/figures/Fortnight.tsx` e `DayGlobe.tsx` desenham a faixa; `readingWords.ts` diz "a faixa acertou em 0 dos últimos 3 dias"; `calibration.js` marca `trusted` aos 60 dias — um selo binário, exatamente o que o paper diz que engana.
**Pergunta para o Stefano:** o "trusted" some da página e a faixa passa a ser mostrada só como largura em euros (e o quanto ela mudou), sem nenhuma palavra de confiança?

### [DISCUTIR 9/15] O aviso do dia sai do app para o canal que o aluno já olha?
**Fonte:** [Rocket Money — Rowan, set. 2026](https://www.rocketmoney.com/rowan): o assistente fala por SMS, propõe uma ação e nada acontece sem resposta de confirmação. P2 A2 D2 E1 L2.
**Mecanismo:** o produto abandona a tela como lugar do aviso; o canal é a thread de mensagens, com confirmação explícita. O TwinMe já tem o celular como fonte (captura de notificação, `captureParser.js`) e infraestrutura de WhatsApp (`api/routes/whatsapp-*-webhook.js`), e o número do dia é computado, não gerado — o que Rowan não tem.
**Pergunta para o Stefano:** o número do dia (e o "amanhã cobra o Spotify, sobram 8 EUR") vai para o WhatsApp do aluno de manhã, ou o produto fica só na página? Se vai, é uma mensagem por dia, no máximo, e nunca com um botão que mova dinheiro.

### [DISCUTIR 9/15] O Ask devolve feedback sobre a meta em vez de sugerir perguntas?
**Fonte:** [Schimpf et al. — Supporting Effective Goal Setting with LLM-Based Chatbots, 2026](https://arxiv.org/abs/2602.08636), RCT N=543. P2 A2 D2 E2 L1.
**Mecanismo:** entre orientação, sugestões e feedback como alavancas de um chatbot de metas, é o *feedback sobre o progresso* que melhora a qualidade da meta; sugestões não. O Ask hoje abre com cinco perguntas prontas (`chat.js`, `OFFERS`) e o fato `goal` (`context.js`) é uma escolha entre três palavras sem número.
**Pergunta para o Stefano:** a meta passa a ter um número e uma data, e o Ask devolve toda semana onde ela está — em vez de oferecer perguntas?

## Fila de trabalho
- [PROTOTIPAR 14/15] Conformal PID: banda de gasto que aprende com os erros → `BACKLOG.md#banda-conformal-pid` (2026-09-14)

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

Novos em 2026-09-19 (varredura de três batedores: produtos, papers, o que as pessoas dizem):

- [PROTOTIPAR 13/15] O dia como dois passos: "vai custar algo?" e "quanto, se custar" → `BACKLOG.md#dia-hurdle`
  · âncora: `api/services/money/calibration.js` (dayForecast), `scripts/money/evaluate-day-forecast.mjs`
- **Fundido** em `BACKLOG.md#banda-conformal-pid` (perna 2): calibrar a faixa pelos resíduos dos dias *parecidos* (mesmo dia da semana, mesma distância do pagamento) em vez de todos — [Jin et al., Retrieval-Corrected Conformal Prediction for Time Series, 2026](https://arxiv.org/abs/2608.10553), 12/15.
- **Fundido** em `BACKLOG.md#mcp-contexto-portatil`: o Copilot Money expõe o ledger por MCP desde maio de 2026 ([changelog](https://www.copilot.money/changelog)); o item ganha uma perna "o dinheiro por MCP" com âncora em `api/mcp-server/src/server.ts` e `api/services/money/forecastService.js`.

Novos em 2026-09-21 (varredura semanal, 6 `intel-scout` + 26 `intel-analyst`):

- [PROTOTIPAR 13/15] Fidelidade: um braço "só demografia" para testar se a profundidade de ingestão compra acurácia → `BACKLOG.md#fidelidade-minimal-facts`
  · âncora: `twin-research/fidelity-eval.js`, `intel.config.json` (bets[1])
- [PROTOTIPAR 12/15] Ativar o `place_call` já construído para um caso ancorado no ledger → `BACKLOG.md#dinheiro-por-telefonema`
  · âncora: `api/services/callService.js`, `api/routes/webhook-vapi.js`, `api/services/money/recurring.js`
- [PROTOTIPAR 12/15] O agente de saúde da própria Supabase, testado contra um incidente real → `BACKLOG.md#supabase-health-via-mcp`
  · âncora: `.github/workflows/agentic-loop.yml`, `scripts/agentic/loop.mjs`
- **Fundido** em `BACKLOG.md#mcp-contexto-portatil` (perna 3): dois servidores MCP de terceiros sobre Enable Banking (`bank-mcp`, `bankmcp`) — um vira conferência cruzada dos campos ainda não verificados em `enableBanking.js`, o outro é o desenho de OAuth 2.1 escopado que falta em `api/routes/api-keys.js`, 11/15.
- **Fundido** em `BACKLOG.md#dia-hurdle` (citação de apoio): gradient boosting isolado perde para híbrido ocorrência×quantidade em demanda intermitente ([Kislinskii, Hameed, arXiv 2609.14718](https://arxiv.org/abs/2609.14718)) — mesmo mecanismo do spike já aberto, evidência mais fraca (domínio incompatível), 8/15.

## Radar
- `2026-09-21` **Quartz (Londres, £2,75M pre-seed, ex-Revolut/N26) lança agregador PSD2 + IA "Charlie"** para pensões/ISAs/investimentos no UK — mesma retórica "personal banker for everyone" do money twin, mas nicho de riqueza vs. o gasto diário de estudante na Espanha; sem licença de aconselhamento, sem benchmark publicado. [tech.eu](https://tech.eu/2026/09/16/quartz-launches-with-ps275m-to-build-a-personal-banker-for-everyone/) · 7/15
- `2026-09-21` **Ledger (Emmanuelzyronis, v1.0.0): reconciliação com evidência append-only e versionamento por supersessão** — `money_transactions`/`money_sightings` do TwinMe ainda são mutados in-place (UPDATE/UPSERT em `commit_money_ingestion`), sem trilha de auditoria equivalente; gap real, mas não escrito em known_gaps. [GitHub](https://github.com/Emmanuelzyronis/Ledger) · 7/15
- `2026-09-21` **PRISM: juiz de fidelidade de persona decomposto em Task Framing/Stance/Estilo** — números não verificáveis na leitura, mas ecoa a instabilidade já documentada do juiz único de `chat-eval.mjs` (não do harness de persona, que nem usa juiz LLM e está parado desde D1). [arXiv 2608.26674](https://arxiv.org/abs/2608.26674) · 7/15
- `2026-09-21` **Perplexity conecta a Flanks** (AISP do Banco da Espanha/BCE, ~€43bi agregados) para consultar holdings de patrimônio em linguagem natural — repete o padrão dos conectores Gemini/ChatGPT já DISCUTIDO em 2026-08-22, mas em wealth management B2B, fora do domínio de gasto/PSD2 do TwinMe Money. [fintech.global](https://fintech.global/2026/08/26/perplexity-taps-flanks-to-power-ai-driven-wealth-management/) · 7/15
- `2026-09-21` **REALM: grafo cognitivo com reconsolidação por LLM a cada retrieval** (75,97% LoCoMo / 65,11% LongMemEval) — mecanismo é geração, não aritmética, então não serve ao money twin (`settled`: computed, not generated) nem ao gêmeo legado, parado desde D1. [arXiv 2609.16053](https://arxiv.org/abs/2609.16053) · 6/15
- `2026-09-21` **Predição conformal multi-fonte/multi-alvo (MS-RLCP, Scaling-Score CP)** — split-conformal em lote com exchangeability entre fontes/alvos; nenhum ataca o atraso de liquidação de 4 dias que hoje zera o alargamento da banda do dia. O spike `banda-conformal-pid` já cobre a frente certa. [arXiv 2609.14531](https://arxiv.org/abs/2609.14531) · [arXiv 2609.17091](https://arxiv.org/abs/2609.17091) · 6/15
- `2026-09-21` **Comportamento simulado por LLM: priors estatísticos acertam a distribuição agregada mas fragmentam rotina e achatam variabilidade individual** (43h de câmera em escritório) — tema afim ao fidelity-eval do TwinMe, sem overlap direto de dado/stack. [arXiv 2609.01257](https://arxiv.org/abs/2609.01257) · 6/15
- `2026-09-21` **II-42/psql_bm25s: terceiro motor BM25 nativo para Postgres** — mesmo bloqueio já discutido para ParadeDB/pg_textsearch (extensão C fora da lista de ~30 da imagem gerenciada do Supabase); a resposta ao DISCUTIR 8/15 de 24/08 não muda. [GitHub](https://github.com/Intelligent-Internet/psql_bm25s) · 5/15
- `2026-09-21` **reconforge (0.0.4, protótipo sintético local): reconciliação com fatos/possibilidades separadas** — mesmo princípio de evidência-antes-de-conclusão que `ledger.js`/`chat.js` já aplicam em produção, com mais maturidade (fuzzy matching, dado real). [GitHub](https://github.com/SamanGharagozlou/reconforge) · 5/15
- `2026-09-21` **openrecon: CLI de reconciliação ledger-vs-processador por id, depois valor+data** — resolve um problema estruturalmente mais fácil (id compartilhado) que o de TwinMe (multi-canal sem id comum); `ledger.js` já é mais completo na dimensão que importaria (match por comerciante). [GitHub](https://github.com/Naresh-Paturi-Community/openrecon) · 5/15
- `2026-09-21` **Enable Banking: changelog de agosto** (dashboard de indisponibilidade por ASPSP, Klarna em 9 países incl. Espanha, conta devedora SEPA para bancos Redsys) — nenhuma mudança de API que `enableBanking.js` precise absorver; não responde a pergunta pendente sobre Plaid/US friends. [Enable Banking](https://enablebanking.com/blog/2026/09/09/changelog-august-2026) · 5/15
- `2026-09-21` **Split Pay levanta US$125M (Khosla/Thrive/Levchin) para adiantar até 50% do aluguel por 30 dias** — valida a dor que "a Bizum que é o aluguel" (`context.js`, #462) já lê, mas do lado do crédito/float, território que o `settled` fecha explicitamente (nunca reter nem adiantar saldo). [Axios](https://www.axios.com/2026/09/08/split-pay-khosla-125-million) · 5/15
- `2026-09-21` **Félix levanta US$200M (a16z/General Catalyst): banking inteiro dentro do WhatsApp** para a diáspora latina — reforça, sem responder sozinho, a pergunta DISCUTIR de hoje sobre levar o número do dia pro WhatsApp (ver acima). [Crunchbase News](https://news.crunchbase.com/venture/fintech-whatsapp-remittance-startup-felix-raises-200m-a16z-general-catalyst/) · 7/15
- `2026-09-21` **Instinct: memória com agente de chat só-leitura, compactação diária, correções datadas** (teardown, sonda da Supermemory): 13.000 tokens por turno, busca exata por palavra, uma preferência levou 23 h 16 min para valer. O money twin já tem a forma (o chat lê `money_facts` e `money_readings`; `cron-money-learn` escreve à noite, sem modelo) e é mais rápido: um "remember" vale no turno seguinte. A única lacuna: uma correção apaga o fato (`deleteFact`) em vez de deixar a entrada datada que o substitui.
- `2026-09-21` **Instinct: segredo por link de uso único, preenchido no servidor, nunca pelo chat** (teardown, Vault): não se aplica hoje, o money twin nunca pede senha (PSD2 por redirecionamento, extrato por upload); vira regra se um dia baixar extrato por login.
- `2026-09-21` **Instinct: cartão de aprovação que carrega o plano + arquivo de autonomia por usuário** (teardown): as ofertas do chat já são isso (nada muda sem toque; `assembleReply`); o "quanto perguntar" é o orçamento de perguntas ainda aberto no plano de 13/09.
- `2026-09-21` **Instinct: rede de pessoas de confiança, agente a agente, chaveada por telefone** (teardown, INFERRED bus próprio): o Presence (companheiro, convites, PR #427) é a mesma forma; para o dinheiro, o uso seria acertar uma divisão (`bizum.js`) com o gêmeo do colega. Sem alavanca até haver dois ledgers.
- `2026-09-21` **Instinct treina nos dados do usuário por padrão, com opt-out só daqui para frente** (termos revisados em 26/08): posicionamento, não código. O ledger do TwinMe nunca treina nada (OpenRouter, sem retenção); vale uma linha na política de privacidade e na landing.
- `2026-09-21` **Instinct: cadência de lançamento, uma interrupção removida por post, um número, um exemplo** (posts de 4 a 18/09): já anotado em 13/09; continua sendo o molde para os posts do money twin.
- `2026-09-21` **Instinct: cada incidente documentado é agir sem confirmar ou tratar texto de fora como instrução** (TechCrunch 24/08): o money twin não age (só oferece), mas lê texto de fora (`inbox.js`, assunto do recibo em `raw_text` no contexto do chat). Spike em `BACKLOG.md` (`entradas-tipadas`).
- `2026-09-19` **YNAB casa o pagamento do cartão com a compra** (ago. 2026, [what's new](https://www.ynab.com/whats-new)): uma saída da conta corrente ligada ao lançamento da fatura por valor e proximidade de data, para não contar duas vezes. É o problema F6/B3 da revisão de 18/09; a heurística é copiável em `api/services/money/ledger.js`.
- `2026-09-19` **YNAB só troca a categoria de um comércio quando 2 das últimas 3 concordam** (ago. 2026): filtro de ruído sem modelo. Cabe em `places.js`/`setPlaceCategory` para quando provedor e pessoa discordam.
- `2026-09-19` **Fintonic passa a conectar o Revolut** (ago. 2026, [blog](https://www.fintonic.com/blog/)): o incumbente espanhol trata o Revolut como conta de primeira classe — o mesmo pressuposto multi-banco do TwinMe.
- `2026-09-19` **Monarch: cenários "e se" sobre o histórico real** (abr. 2026, [what's new](https://www.monarch.com/whats-new)); sem nenhuma alegação de acurácia publicada.
- `2026-09-19` **Visa Research: embeddings de LLM para texto de comércio, gerados uma vez e destilados** ([Fan et al., 2025](https://arxiv.org/abs/2601.05271)): o custo do LLM pago offline, não por transação — o padrão certo para a cauda longa de `money_places`.
- `2026-09-19` **HMM de dois regimes sobre open banking** ([Medina-Olivares, Calabrese, 2023/26](https://arxiv.org/abs/2306.01749)): separa endividamento ocasional de persistente em fluxo PSD2 individual; candidato a "mês ruim" como regime, não como alerta.
- `2026-09-19` **Lembretes que nomeiam o gasto futuro aumentam a poupança** ([Karlan et al., NBER w16205](https://www.nber.org/papers/w16205), o resultado-âncora do campo): sustenta "amanhã cobra o Spotify" contra um nudge genérico.
- `2026-09-19` **Splitwise: o que se ama (divisão por item) e o que se odeia (paywall, dinheiro "pendente" por dias)** ([reviews](https://apps.apple.com/us/app/splitwise-split-expenses/id458023433?see-all=reviews)): qualquer divisão no TwinMe rotula o Bizum que já saiu, nunca segura dinheiro.
- `2026-09-19` **Santander/imagin: o código do Bizum some antes de copiar; Revolut: bloqueios sem explicação** ([ES reviews](https://apps.apple.com/es/app/santander-espa%C3%B1a/id408043474?see-all=reviews), [Revolut](https://apps.apple.com/es/app/revolut-m%C3%A1s-que-un-banco/id932493382?see-all=reviews)): o contexto de confiança em que a conexão bancária do TwinMe vai aparecer.
- `2026-09-19` **Cleo: a voz que "roasta" é o que mais se ama e o que mais se odeia quando os números não são confiáveis** ([reviews](https://apps.apple.com/us/app/cleo-ai-cash-advance-budget/id1447274646?see-all=reviews)): tom com número computado é um espaço vazio.
- `2026-09-14` BBVA AI Factory (ICAIF 2024): separar as cobranças de um beneficiário em sub-séries (memo, valor, periodicidade) antes de prever data e valor, mediana de intervalos com tolerância por cadência; já adotado em parte em `recurring.js` (#328); paper inacessível (403), write-up sem números, teto REGISTRAR. [fonte](https://www.bbvaaifactory.com/financial-habits-analysis/)

- `2026-08-24` **Supabase passa a ignorar VERSION em CREATE EXTENSION** — entrada de 22/07, vigente 05/08; a versão pedida é ignorada e a default do projeto é instalada, com warning. Nenhuma das três árvores de migração do TwinMe pina versão, então nada muda aqui — resta confirmar que a default do projeto é pgvector ≥ 0.8.2, que corrigiu o CVE-2026-3172 no build paralelo de HNSW. [changelog](https://supabase.com/changelog) · 7/15

- `2026-08-22` **Twin1 AI capta US$ 20 mi para gêmeos de knowledge worker** — seed co-liderada por Bessemer, Tribeca e Aramco; monta o gêmeo a partir de e-mail, reuniões e documentos; roda em Linklaters, Orrick e Dechert, onde os twins respondem por 30–50% das tarefas de comunicação. Mesmo problema, público oposto ao seu — sinal de que o dinheiro está indo pro enterprise hetero-referente. [SiliconANGLE](https://siliconangle.com/2026/08/20/twin1-ai-raises-20m-to-put-an-ai-twin-behind-every-knowledge-worker/) · 6/15

## Arquivo

- `2026-09-21` **[DISCUTIR 10/15] Um traço de persona é um slot com um valor corrente?**
  (aberto 2026-08-24) — envelheceu sem decisão. O braço técnico já foi fundido em
  `mcb-portao-escrita`; a pergunta de negócio (traço como slot vs. distribuição) segue sem
  resposta, mas o gêmeo legado onde `behavioral_evidence` vive está estacionado desde D1
  (2026-09-20) — a pergunta perde urgência até haver decisão de reativar o gêmeo.
- `2026-09-21` **[DISCUTIR 9/15] O gateway de LLM e o billing viraram a mesma empresa**
  (aberto 2026-08-24) — envelheceu sem decisão. O deal Stripe/OpenRouter não fechou nem
  apareceu de novo em nenhuma das três varreduras seguintes (14/09, 19/09, 21/09); sem
  novidade, a pergunta ("extrair a env var do gateway, rodar contra um segundo provedor
  uma vez") fica arquivada até o deal fechar ou um novo sinal aparecer.
