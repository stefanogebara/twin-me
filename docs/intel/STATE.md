# Estado do repositório — TwinMe

> Reescrito pela passada do `/intel` em 2026-09-07. Janela: 2026-08-24 →
> 2026-09-07 (14 dias, 44 commits em `main`, incluindo os já cobertos pelo
> PR #273 nunca mergeado — ver nota abaixo). HEAD `2d4bdca0`, branch `main`.
> Zero candidatos novos de mercado nesta passada — ver `INTEL.md`.

> **Sobre o PR #273.** A passada de 2026-08-31 rodou, escreveu `STATE.md` e
> `INTEL.md` corretamente, e abriu PR — mas ficou aberta, em draft, sem
> merge, por 7 dias. O código que ela descrevia (`truth(portfolio)`, a
> correção do Inngest) **está em `main`**; só a documentação do `/intel`
> nunca chegou lá. Esta passada absorve o conteúdo do #273 (as duas
> resoluções por código, arquivadas abaixo) e reconstrói o resto da janela
> por cima. #273 deveria ser fechada quando este PR mergear — não fechei
> sozinho.

## O parágrafo

Duas semanas sem intel de fora que valesse a pena (o feed do resumo matinal
segue travado em 22/08, mesmos oito itens, terceira semana seguida — ver
nota no rodapé) e uma dentro que contradiz uma decisão já `settled`: o
vertical de dinheiro foi **reconstruído do zero em EUR/PSD2** com um
adaptador de **Enable Banking** — um agregador bancário, categoria idêntica
a Pluggy/Plaid/TrueLayer, que o `settled[4]` deste config marca como "fora"
desde junho. Não é o mesmo fornecedor nem a mesma decisão de arquitetura
(abandona a tabela antiga inteira, não estende), mas é a mesma forma:
OAuth num banco, sessão, pull agendado. Ver Divergências. Ao lado disso, o
resto do app trocou de pele: Nocturne substitui Claura como sistema de
design em quatro PRs e ~271 arquivos, com dois bugs de especificidade CSS
que fizeram a ponte de compatibilidade perder a maioria dos tokens que
definia sem sintoma visível até alguém abrir a página certa. No meio das
duas coisas, uma semana inteira — 26/08 a 03/09 — sem um commit sequer, a
primeira pausa dessa duração desde que este arquivo existe. E três PRs
abertos há muito tempo sem revisão (26, 13 e 12 dias), um deles carregando
um risco de produção nomeado pelo próprio autor — um `needs_reauth` que
hoje é sempre no-op porque a migração que o habilita nunca foi aplicada.

## O que shipou

- **Nocturne — sistema de design do zero, depois virado padrão** (`6d6e343a`
  #274, `3f480ea6` #275, `58a9ff15` #276, `877c6c6b` #268). Cinco leis, três
  vozes (Fraunces/Inter/Roboto Mono), cinco tiles de assinatura, zero
  imagem estática — tudo pintado em código. A ponte
  `nocturne-bridge.css` remapeia toda a superfície legada sem editar
  arquivo por arquivo. **Dois bugs de especificidade encontrados depois do
  flip, não antes:** a ponte perdia 43 dos 50 tokens que define (Tailwind
  hoisting batendo o `@import`, corrigido com `:root:root`) e
  `tailwind.config.ts` mais 160 literais inline de `fontFamily` ignoravam
  a ponte inteiramente porque Tailwind emite stack literal, não variável
  CSS — nenhum guard existente podia pegar isso. Guards novos:
  `bridgePrecedence.test.ts`, `retiredPalette.test.ts`.
- **Money v2 — reconstruído do zero, não estendido** (`2d4bdca0`,
  `aac7083d`, `641fdbb5`, `3a5f516b`). Decisão do Stefano registrada no
  commit: a versão de abril está abandonada porque ele mudou de banco
  (Santander España, PSD2/EUR) — nada importa de `api/services/transactions`
  ou `user_transactions`. Cinco tabelas novas (`money_*`): sightings,
  ledger, frames, episodes, forecasts. `POST /api/money/capture` aceita
  notificação verbatim do telefone (via `X-TwinMe-Key`, já que um Shortcut
  não tem sessão) ou evento estruturado; reconciliação por 1%/36h. Adaptador
  de **Enable Banking** (PSD2) para o feed bancário: `connect` → `callback`
  → `accounts` → `pull`, quatro puxadas por dia, SCA a cada 180 dias. 33
  testes. Migração `20260907_money_twin_v2.sql` está **commitada, não
  aplicada** (nota do próprio autor no commit) — as duas menores que vieram
  depois (`money_accounts.session_id`/`last_pulled_at`) dizem "applied to
  the live project".
- **`truth(portfolio)` e vocabulário** (`6bcf030`, `555f12d`) — já
  registrado no #273, confirmado mergeado. `/p/:userId` passa a liderar com
  `normalized_fidelity` com n/wave/data em vez do `twin_accuracy` cru; bug
  de ordenação que servia o maior de três scores de uma bateria aposentada,
  corrigido. "Digital twin" sai de 11 strings de UI.
- **Inngest — a camada durável nunca tinha rodado** (`46bc500`, `14a6312`,
  `7e7ee6a`) — já registrado no #273, confirmado mergeado. Assinatura v3
  contra SDK v4 fazia todo `sanitizeTriggers()` devolver `[]`; era o
  fallback inline do cron que sustentava a ingestão desde sempre, inclusive
  no "apagão" de 20/06–13/07 que uma teoria de plan-cap explicava errado.

## O que está em voo

- **PR #267** (13 dias, aberto 25/08) corrige três tabelas
  onde o schema do código diverge do Postgres vivo (`personality_scores`
  ausente, `department_budgets.budget_month` ausente,
  `platform_connections.status` sem `needs_reauth`). O próprio autor
  documenta no PR: duas das três migrações foram aplicadas e verificadas;
  **a terceira não** — `20260825_platform_connections_status_needs_reauth.sql`
  segue sem aplicar, então a correção do Whoop "ships as a no-op" até
  alguém rodar essa migração. Zero atividade desde a abertura.
- **PR #272** (12 dias, `fix/inngest-step-split`) — divide o step de
  enriquecimento do upsert e corrige a narrativa de plan-cap nos artefatos
  de auditoria (não reescreve os antigos, que ficam como registro do que se
  acreditava na hora). Zero atividade desde a abertura.
- **PR #254** (26 dias, o mais velho aberto) — corrige a janela de captura
  do Google Calendar (`timeMin: now` perdia eventos já encerrados no dia) e
  no processo corrige a própria alegação do PR #253 anterior, que tinha
  superestimado o buraco de cobertura. Zero atividade desde a abertura.
- **PR #273** (draft, o `/intel` de 2026-08-31) — ver nota no topo. Deveria
  fechar quando este PR mergear.
- Migração `20260907_money_twin_v2.sql` não aplicada — ver acima.
- Uma semana inteira sem commits (26/08 → 03/09) — sem explicação no
  histórico; pode ser só ausência do Stefano, mas é o primeiro hiato desse
  tamanho que este arquivo registra.

## O que morreu

- **Claura como sistema de design ativo** — segue existindo como camada de
  compatibilidade (`nocturne-bridge.css`) até cada superfície ser portada
  para `n-*` diretamente; `CLAUDE.md` já foi reescrito para Nocturne.
- `CosmicHero.tsx` (411 linhas) e `styles/landing.css` — zero importadores
  depois do reveal virar a hero (`877c6c6b`). Os sets de imagem
  cosmic/cosmic-v2 (13.6MB) ficam, ainda referenciados por rotas de preview
  dev-only.
- `DiscoverLanding.tsx` e nove componentes de `discover/` — substituídos
  pela dobra em `/` no flip do Nocturne.
- **PR #257 e #255** (o "Claura adoption sweep" de 13/08) — fechados sem
  merge em 03/09, superseded pela correção real de tokens em `#275`: "its
  diff is superseded; its TEST is not" — o teste de tokens-fantasma de
  #255 foi salvo, o resto descartado.
- A trava de estado de 24/08 continua valendo: reranker, temporal spine,
  roteador por neurotransmissor e agregador bancário **por Pluggy/Plaid/
  TrueLayer especificamente** seguem fora de cogitação — mas ver
  Divergências: a forma geral "agregador bancário" voltou por outra porta.

## Áreas quentes

`api/routes/money.js` (4) · `src/styles/nocturne-bridge.css` (3) ·
`src/pages/VoiceSetupPage.tsx` (3) · `src/pages/Settings.tsx` (3) ·
`src/pages/MoneyPage.tsx` (3) · `database/supabase/migrations/20260907_money_twin_v2.sql` (novo) ·
`api/services/money/store.js` (3) · `api/server.js` (3) ·
`src/styles/nocturne.css` (2) · `api/routes/auth-simple.js` (5, herdado da
janela anterior) · `src/pages/CustomAuth.tsx` (5).

## Divergências com o config

Nenhuma foi aplicada sozinha. `bets` e `settled` só o Stefano mexe.

1. **NOVA — `settled[4]` diz "agregadores bancários estão fora; captura
   financeira é por WhatsApp" (`4a74a4d6`, 2026-06-12). O código shipado
   nesta janela contradiz isso.** `api/services/money/feeds/enableBanking.js`
   implementa um adaptador PSD2 completo: `POST /api/money/bank/connect`
   inicia autorização no banco, `GET /api/money/bank/callback` recebe o
   retorno, `POST /api/money/bank/pull` puxa o extrato quatro vezes ao dia.
   É a mesma forma funcional de Pluggy/Plaid/TrueLayer — OAuth num banco,
   sessão de consentimento, pull agendado — só que via Enable Banking
   (fornecedor europeu, PSD2) em vez dos três fornecedores citados no
   `deprecated`. O commit (`2d4bdca0`) registra a decisão do Stefano de
   abandonar o vertical antigo porque ele mudou de banco/país, não uma
   decisão sobre agregadores em si — mas o efeito líquido é que a captura
   financeira deixou de ser só WhatsApp. **Decisão pendente do Stefano:**
   `settled[4]` deveria virar "agregadores bancários genéricos (Pluggy/
   Plaid/TrueLayer) estão fora; Enable Banking via PSD2 para o próprio banco
   do usuário é a exceção", ou o item deveria ser reaberto de vez? A
   diferença prática entre "agregador multi-banco" e "PSD2 direto no banco
   do usuário" é real (menos superfície de terceiro, escopo por consentimento
   do próprio usuário) mas não estava escrita em lugar nenhum antes deste
   código existir.
2. As seis divergências registradas em 24/08 continuam de pé sem alteração
   de mérito nesta janela — não repetidas aqui, ver histórico do arquivo via
   git. Nenhum dos quatro spikes de `BACKLOG.md` teve arquivo-âncora tocado
   neste período.

---

> **Nota operacional, não é intel de mercado:** o feed em `feed_url`
> continua devolvendo `"generated": "2026-08-22"` — os mesmos oito itens da
> primeira passada, todos já em `seen.jsonl`. Esta é a terceira semana
> seguida com o mesmo carimbo. Se o resumo matinal deveria estar gerando um
> feed novo por semana e não está, vale checar o pipeline dele fora deste
> repositório — o `/intel` aqui só consome a URL, não a gera.
