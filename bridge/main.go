// Package main — TwinMe WhatsApp Voice Bridge
// =============================================
// Phase 1 of the voice-first surface (askjo.ai-inspired, audit-2026-05-19).
//
// What this is:
//   - A long-lived Go service that holds WhatsApp Web connections for
//     TwinMe users via go.mau.fi/whatsmeow.
//   - Each user links their WhatsApp once (QR code in /settings/voice),
//     and forever after, voice messages they send to THEMSELVES on
//     WhatsApp get transcribed and routed through the twin chat
//     pipeline. The twin's text reply lands back in the same chat.
//
// What this is NOT:
//   - Not a Vercel serverless function. whatsmeow keeps an open
//     WebSocket per user; serverless cold-starts would break that.
//     Designed to run on Fly.io (or any always-on host).
//   - Not multi-tenant in the legal sense. Each WhatsApp account holder
//     is acting as themselves — this bridge just wraps WhatsApp Web
//     the same way Beeper / Mautrix-WhatsApp do.
//
// Endpoints:
//   POST /link/start              — begin a new link for a TwinMe user
//   GET  /link/status/:userId     — poll link status, returns QR if pending
//   POST /link/cancel/:userId     — abandon a pending link
//   POST /reply/:userId           — TwinMe API tells bridge to send a reply
//   GET  /health                  — liveness
//
// Voice flow (inbound):
//   1. User sends a voice message to themselves on WhatsApp
//   2. whatsmeow EventHandler fires with *events.Message containing audio
//   3. Bridge downloads + decrypts the audio (whatsmeow does this)
//   4. POST to TwinMe API: /api/voice/inbound { userId, oggBytes, sender, msgId }
//   5. TwinMe transcribes (Whisper), runs the chat handler, returns text
//   6. TwinMe API calls back: POST bridge /reply/:userId { text }
//   7. Bridge sends the text via whatsmeow.SendMessage
//
// Auth between bridge ↔ TwinMe API: BRIDGE_SHARED_SECRET in headers.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------

type config struct {
	Port                string // bridge HTTP port
	TwinMeAPIBaseURL    string // e.g. https://www.twinme.me/api
	BridgeSharedSecret  string // shared HMAC for bridge ↔ TwinMe auth
	DatabaseURL         string // Postgres connection string (Supabase pooler)
	WhatsmeowLogLevel   string // INFO | DEBUG | WARN | ERROR
}

func loadConfig() (*config, error) {
	cfg := &config{
		Port:               getenv("PORT", "8080"),
		TwinMeAPIBaseURL:   getenv("TWINME_API_BASE_URL", "https://www.twinme.me/api"),
		BridgeSharedSecret: os.Getenv("BRIDGE_SHARED_SECRET"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		WhatsmeowLogLevel:  getenv("WHATSMEOW_LOG_LEVEL", "WARN"),
	}
	if cfg.BridgeSharedSecret == "" {
		return nil, fmt.Errorf("BRIDGE_SHARED_SECRET is required")
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required (use Supabase pooler URL)")
	}
	return cfg, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ---------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------
//
// We keep per-user whatsmeow.Client instances in memory. On startup we
// load all status='linked' rows from whatsapp_links and re-connect each
// (whatsmeow's sqlstore lets us resume sessions without re-scanning QR).
//
// pendingLinks holds the QR-pairing state for users who started a link
// but haven't completed it. These live in memory only — if the bridge
// restarts mid-link, the user has to start over.

type bridge struct {
	cfg            *config
	mu             sync.RWMutex
	clients        map[string]*userClient   // user_id → connected client
	pendingLinks   map[string]*pendingLink  // user_id → current pairing state
	httpClient     *http.Client
}

type userClient struct {
	userID   string
	jid      string
	// In a real implementation: holds *whatsmeow.Client + event handler refs.
	// Skeleton elides the whatsmeow types so this file compiles without the
	// dependency tree resolved.
}

type pendingLink struct {
	userID    string
	qrCode    string    // current QR data URL or text
	expiresAt time.Time
	cancel    context.CancelFunc
}

func newBridge(cfg *config) *bridge {
	return &bridge{
		cfg:          cfg,
		clients:      make(map[string]*userClient),
		pendingLinks: make(map[string]*pendingLink),
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

// ---------------------------------------------------------------------
// HTTP endpoints
// ---------------------------------------------------------------------

func (b *bridge) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", b.handleHealth)
	mux.HandleFunc("/link/start", b.requireAuth(b.handleLinkStart))
	mux.HandleFunc("/link/status/", b.requireAuth(b.handleLinkStatus))
	mux.HandleFunc("/link/cancel/", b.requireAuth(b.handleLinkCancel))
	mux.HandleFunc("/reply/", b.requireAuth(b.handleReply))
	return mux
}

func (b *bridge) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Bridge-Secret")
		if got == "" || got != b.cfg.BridgeSharedSecret {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (b *bridge) handleHealth(w http.ResponseWriter, r *http.Request) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"linked_clients": len(b.clients),
		"pending_links":  len(b.pendingLinks),
		"uptime_seconds": int(time.Since(startedAt).Seconds()),
	})
}

// POST /link/start  Body: { "userId": "uuid" }
// Returns: { "qrCode": "...", "expiresAt": "RFC3339" }
//
// Behavior:
//   1. Validate userId
//   2. Cancel any existing pending link for this user
//   3. Start a whatsmeow pairing flow; the library produces a series of
//      QR codes (rotates every ~20s). We surface the first one.
//   4. Background goroutine watches for pairing success → upsert
//      whatsapp_links row with status='linked'.
func (b *bridge) handleLinkStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if req.UserID == "" {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	// TODO: cancel existing pending link if any
	// TODO: start whatsmeow pairing — see whatsmeow.Client.GetQRChannel()
	// TODO: store pendingLink in b.pendingLinks under lock
	// TODO: kick off a goroutine that waits for *events.PairSuccess,
	//       upserts whatsapp_links via the TwinMe API, and starts the
	//       per-user client.

	log.Printf("[link/start] userId=%s — STUB, not yet implemented", req.UserID)
	writeJSON(w, http.StatusNotImplemented, map[string]any{
		"error":        "not_implemented",
		"phase":        "1-skeleton",
		"todo":         "whatsmeow pairing flow",
		"userId":       req.UserID,
	})
}

// GET /link/status/:userId
// Returns: { "status": "pending|linked|none", "qrCode": "...", "expiresAt": "..." }
func (b *bridge) handleLinkStatus(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimPrefix(r.URL.Path, "/link/status/")
	if userID == "" {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	if _, ok := b.clients[userID]; ok {
		writeJSON(w, http.StatusOK, map[string]string{"status": "linked"})
		return
	}
	if pl, ok := b.pendingLinks[userID]; ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "pending",
			"qrCode":    pl.qrCode,
			"expiresAt": pl.expiresAt.Format(time.RFC3339),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "none"})
}

// POST /link/cancel/:userId
func (b *bridge) handleLinkCancel(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimPrefix(r.URL.Path, "/link/cancel/")
	b.mu.Lock()
	defer b.mu.Unlock()
	if pl, ok := b.pendingLinks[userID]; ok {
		pl.cancel()
		delete(b.pendingLinks, userID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// POST /reply/:userId  Body: { "text": "..." }
// TwinMe API calls this to deliver the twin's reply back to the user's WhatsApp.
func (b *bridge) handleReply(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimPrefix(r.URL.Path, "/reply/")
	var req struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	b.mu.RLock()
	client, ok := b.clients[userID]
	b.mu.RUnlock()
	if !ok {
		http.Error(w, "user not linked", http.StatusNotFound)
		return
	}

	// TODO: client.SendMessage(client.JID, &waE2E.Message{Conversation: &req.Text})
	log.Printf("[reply] userId=%s jid=%s text=%q — STUB, not yet implemented",
		userID, client.jid, truncate(req.Text, 80))
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued"})
}

// ---------------------------------------------------------------------
// Inbound voice → TwinMe API
// ---------------------------------------------------------------------
//
// Called from whatsmeow event handler when a voice message arrives.
// Phase 1 stub: structure only, no real whatsmeow types yet.

type inboundVoicePayload struct {
	UserID            string `json:"userId"`
	WhatsappMessageID string `json:"whatsappMessageId"`
	SenderJID         string `json:"senderJid"`
	OggBase64         string `json:"oggBase64"`
	DurationSeconds   float64 `json:"durationSeconds"`
}

func (b *bridge) forwardVoiceToTwinMe(ctx context.Context, payload *inboundVoicePayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/voice/inbound", b.cfg.TwinMeAPIBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Bridge-Secret", b.cfg.BridgeSharedSecret)

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("twinme api returned %d", resp.StatusCode)
	}
	return nil
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

var startedAt = time.Now()

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	br := newBridge(cfg)

	// TODO: initialize whatsmeow's sqlstore.Container against DATABASE_URL
	// TODO: list status='linked' whatsapp_links rows and resume each session

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      br.routes(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown on SIGTERM/SIGINT (Fly.io sends SIGINT on deploy)
	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
		sig := <-ch
		log.Printf("received %v, shutting down", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	log.Printf("twin-me voice bridge listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server: %v", err)
	}
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
