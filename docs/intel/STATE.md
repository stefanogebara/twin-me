# Estado do repositório — TwinMe

> Reescrito pela passada do `/intel` em 2026-08-31. Janela: 2026-08-24 →
> 2026-08-31 (35 commits). HEAD `b853241`, branch `main`. Sem candidatos novos
> de mercado nesta passada — o feed devolveu os oito itens de 22/08, já
> processados; ver `INTEL.md`.

## O parágrafo

A semana não trouxe intel de fora — trouxe uma descoberta de dentro maior que
qualquer paper: **o Inngest nunca rodou uma única vez** desde que foi
introduzido. Os 13 call sites usavam a assinatura v3 (`createFunction({id},
{event}, handler)`) contra um SDK que só fala v4 desde o início
(`inngest: ^4.0.2` no `package.json` desde a introdução) — todo evento virava
zero triggers, toda função ficava "Active" no dashboard do Inngest sem nunca
ter sido chamada. A ingestão sobreviveu inteira pelo fallback inline do cron,
inclusive durante o "apagão de 3 semanas" de junho que uma teoria de
plan-cap explicava errado. Corrigido em três passes na mesma semana
(assinatura, timeout de step insuficiente, socket morto lido como falha),
com um PR de follow-up (#272) ainda pendurado. Em paralelo, dois itens que
estavam em "Em aberto" no `INTEL.md` desde 22/08 foram respondidos pelo
próprio código, não por decisão em texto — o número de fidelidade público
ganhou denominador e data, e "gêmeo digital" saiu da UI. O resto da semana foi
reconstrução de front door (onboarding, auth, landing), sem tocar os gaps de
proveniência, esquecimento de persona ou canal léxico que os quatro spikes
abertos endereçam.

## O que shipou

- **O Inngest nunca executou uma função — corrigido (`46bc500`).** A
  assinatura v3 usada nos 13 call sites contra o SDK v4 instalado fazia
  `options.fn["fn"]` ser chamado como handler (um objeto, não uma função) e
  `sanitizeTriggers()` devolver `[]` — nenhum evento podia bater trigger
  algum. Confirmado em produção em 26/08 por invocação direta: `TypeError:
  this.userFnToRun is not a function`. **É a causa real do apagão de
  ingestão de 20/06 a 13/07** que a teoria de plan-cap (6→5 de concorrência)
  tinha sido escrita para explicar — a ingestão só funcionou, sempre, pelo
  fallback inline do cron. `#272` (aberto) corrige a própria narrativa nos
  artefatos de auditoria que ainda a repetiam, sem reescrever o registro
  histórico do que se acreditava na hora.
- **Timeout de step insuficiente (`14a6312`)** — `/api/inngest` não tinha
  entrada no ternário de timeout de `server.js` e herdava `DEFAULT_TIMEOUT`
  (30s) para um step de enriquecimento que leva ~50s em produção (Gravatar,
  GitHub, WMN, Brave, PDL, duas passadas de LLM). Extraído para
  `api/config/requestTimeouts.js` como função pura, testada, com o teto de
  58s (abaixo do corte de container da Vercel) pinado por rota.
- **Socket morto lido como falha do Inngest (`7e7ee6a`)** — três
  `res.json(...)` dentro do try de fan-out escreviam depois que a Vercel já
  fechara a resposta no teto de 60s; o `catch` interpretava
  `ERR_HTTP_HEADERS_SENT` como falha do Inngest e disparava um **segundo**
  fan-out completo — LLM e chamadas de API pagas duplicadas — sobre o mesmo
  socket morto. `sendOnce` centraliza a escrita fora do try e ignora quando
  `headersSent` já é verdade.
- **`truth(portfolio)` (`6bcf030`, `555f12d`) — dois itens que este repositório
  tinha em aberto no `INTEL.md`, fechados por código:**
  1. Resposta à pergunta sobre o número da Oura: opção (a) da própria
     pergunta. `/p/:userId` agora lidera com `normalized_fidelity` quando
     existe, nomeia o denominador, mostra n/sessões/wave/data sob "Not a
     clinical measure" — em vez do `twin_accuracy` cru em 40px sem contexto,
     servido sem auth. Bug mais grave encontrado por baixo: os dois caminhos
     de leitura ordenavam só por `wave`, que reinicia em 1 a cada revisão de
     bateria — a página pública vinha servindo o **maior de três scores**, de
     uma versão de bateria já aposentada (v1 20 itens 0.825 vs v3 atual, 25
     itens, 0.610). Corrigido para ordenar por `battery_version` → `wave` →
     `created_at`, com teste de regressão pinando a ordem (invisível nas
     linhas retornadas).
  2. Resposta à pergunta de nomenclatura sobre a Simile: "digital twin" sai de
     11 strings de UI (notificações, waitlist, onboarding, progresso,
     privacidade) — fica "your twin" / "soul signature". Termos
     legais (Terms/Privacy) e os prompts de sistema do LLM deliberadamente
     intocados, porque mudar wording ali é mudar comportamento e isso ainda
     deve uma rodada ao eval.
- **Front door reconstruído em Claura:** `/discover` some, dobra em `/`
  (`b923339`); o reveal vira card story (`0d90d35`, `6e45ee0`); onboarding
  pós-auth ganha sequenciamento e "o gêmeo responde de volta" (`bcfdade`,
  `1592929`); a paleta "parchment" morre (`ada1138`); a auth page é
  redesenhada (`bead9d1`, `2ebff9b`); o envio de magic link levou três
  correções em sequência até o teste sob jsdom ficar verde de novo
  (`eda109d`, `dd1bb7f`, `d883a4a`).
- **Higiene de branch, sem commit que a documente:** das ~40 branches remotas
  não podadas registradas em 24/08, só `main` restou.

## O que está em voo

- **PRs abertos, dois grupos com idade muito diferente.**
  - Novos (`#272`, `#268`, `#267`, 25–26/08): `#272` (`mergeable_state:
    clean`) é o follow-up direto do trabalho de Inngest desta semana — divide
    o step de enriquecimento do upsert (para que um retry de save não pague
    de novo Brave/PDL/LLM) e corrige a narrativa do plan-cap nos artefatos de
    auditoria. Parado há 5 dias sem merge.
  - Antigos (`#257`, `#255`, `#254`, 12–13/08): **agora com 18–19 dias
    abertos**, os mesmos três já registrados em 24/08. `#257` (Claura
    adoption sweep, 62 arquivos, empilhado sobre `#255`) tem o checklist de
    revisão visual explicitamente incompleto — "only eyes prove it's
    beautiful."
- Risco anotado pelo próprio autor em `#272`: `enrichFromEmail` continua um
  step único de ~19–40s por dentro; decompor exigiria exportar fronteiras de
  estágio de um serviço de 648 linhas "num caminho que só começou a funcionar
  hoje" — adiado deliberadamente, não esquecido.
- Os quatro spikes de `BACKLOG.md` (proveniência, busca híbrida, portão de
  escrita, ingestão local) seguem intocados nesta janela — nenhum
  arquivo-âncora deles aparece entre os mais tocados da semana.

## O que morreu

- Nenhuma feature nova morreu nesta janela — só código de landing sem uso:
  `DiscoverLanding.tsx` e nove componentes de `discover/`, substituídos pela
  dobra em `/`.
- A trava de estado de 24/08 continua valendo: reranker, temporal spine,
  roteador por neurotransmissor e agregador bancário seguem fora de
  cogitação para qualquer item de intel futuro.

## Áreas quentes

`api/routes/auth-simple.js` (5) · `src/pages/CustomAuth.tsx` (3) ·
`api/services/emailService.js` (3) ·
`src/pages/onboarding/components/RevealPhase.tsx` (2) ·
`src/pages/onboarding/NewDiscoverFlow.tsx` (2) · `src/pages/Index.tsx` (2) ·
`src/components/landing/ClauraHero.tsx` (2) ·
`api/routes/portfolio-public.js` (2) ·
`api/routes/onboarding-calibration.js` (2) ·
`api/inngest/functions/profileEnrichment.js` (2).

## Divergências com o config

Nenhuma nova esta semana — nada em `bets`, `settled` ou `known_gaps` foi
tocado pelo código no período (`platformConfigs.js`, `CLAUDE.md` e
`intel.config.json` não mudaram desde 24/08, fora a própria instalação do
`/intel`). As seis divergências registradas em 24/08 continuam de pé sem
alteração de mérito — não repetidas aqui, ver histórico do arquivo via git.
Uma atualização factual sobre uma delas: a limpeza de branches que a
divergência sobre `bets[1]` citava como pendente ("~40 branches remotas, a
maioria já mergeada e não podada") **aconteceu** — restou 1.
