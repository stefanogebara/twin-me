# TwinMe WhatsApp Voice Bridge

Phase 1 of the voice-first surface (askjo.ai-inspired).

A long-running Go service that bridges WhatsApp Web (via `whatsmeow`) ↔ the TwinMe chat API. Users link their WhatsApp once with a QR code, then any voice message they send themselves gets transcribed and routed through the twin chat pipeline. The twin's reply lands back in the same chat.

## Architecture

```
┌─────────────┐     QR scan     ┌──────────────┐
│  User's     ├────────────────▶│  Bridge      │
│  WhatsApp   │                 │  (Go,        │
│  on phone   │◀────────────────│   whatsmeow) │
└─────────────┘  voice + text   └──────┬───────┘
                                        │ HTTP
                       voice payload    │
                                        ▼
                          ┌─────────────────────────┐
                          │  /api/voice/inbound     │
                          │  (TwinMe Express on     │
                          │   Vercel)               │
                          │                         │
                          │   1. Whisper transcribe │
                          │   2. /chat/message      │
                          │   3. text reply         │
                          └─────────────┬───────────┘
                                        │ POST /reply/:userId
                                        ▼
                              (back to Bridge → user)
```

## What's in this directory

| File | Purpose |
|---|---|
| `main.go` | HTTP server + skeleton link/reply endpoints + bridge state |
| `go.mod` | Go module (run `go mod tidy` after clone) |
| `Dockerfile` | Multi-stage build, ~25 MB final image |
| `fly.toml` | Fly.io machines deployment config |

## Status: Phase 1 — Skeleton

What works:
- HTTP server with auth-gated routes
- Health endpoint
- Endpoint shapes match what `/api/voice/*` expects

What's STUBBED (next session):
- whatsmeow client initialization + sqlstore wiring
- QR-pair flow (`GetQRChannel`, `PairSuccess` event handling)
- Voice message event handler + audio download
- `client.SendMessage` for outbound replies
- Resume linked sessions on startup

See `// TODO:` comments in `main.go` for exact spots.

## Local development

```bash
cd bridge
go mod tidy
export DATABASE_URL="postgres://...:...@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
export BRIDGE_SHARED_SECRET="$(openssl rand -hex 32)"
export TWINME_API_BASE_URL="http://localhost:3004/api"
go run .
```

Then in another shell:

```bash
curl http://localhost:8080/health
# → {"status":"ok","linked_clients":0,...}

curl -X POST http://localhost:8080/link/start \
  -H "X-Bridge-Secret: $BRIDGE_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"167c27b5-a40b-49fb-8d00-deb1b1c57f4d"}'
# Phase 1: returns 501 not_implemented
```

## Deploying to Fly.io

```bash
fly auth login
fly launch --copy-config --name twinme-bridge --region cdg
fly secrets set \
  BRIDGE_SHARED_SECRET="$(openssl rand -hex 32)" \
  DATABASE_URL="postgres://..." \
  TWINME_API_BASE_URL="https://www.twinme.me/api"
fly deploy

# Verify
curl https://twinme-bridge.fly.dev/health
```

Then add the same `BRIDGE_SHARED_SECRET` + `BRIDGE_BASE_URL=https://twinme-bridge.fly.dev` to Vercel env so `/api/voice/*` can talk back to the bridge.

## Security notes

1. **`BRIDGE_SHARED_SECRET`** is the only auth between the Vercel API and this bridge. Rotate it on every key compromise event. Don't log it.
2. **Database access**: the bridge connects to Supabase as service_role (full DB access). The whatsmeow sqlstore tables hold encryption keys — if the DB leaks, attackers can impersonate every linked WhatsApp.
3. **TOS gray area**: WhatsApp's TOS technically restricts automated clients. `whatsmeow` uses the official Web protocol the way Beeper/Mautrix do. Individual phone numbers can be banned by Meta if pattern-detected; keep replies human-paced (≥2s).
4. **Voice payload privacy**: audio is forwarded to TwinMe's `/api/voice/inbound` and transcribed via Whisper. Don't store raw audio long-term — `whatsapp_messages.transcript` is the canonical record.

## Useful whatsmeow references

- Library: https://github.com/tulir/whatsmeow
- Examples: https://github.com/tulir/whatsmeow/tree/main/mdtest
- Event types: https://pkg.go.dev/go.mau.fi/whatsmeow/types/events
