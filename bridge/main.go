// Package main — TwinMe WhatsApp Voice Bridge
// =============================================
// Phase 2 of the voice-first surface (askjo.ai-inspired, audit-2026-05-19).
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
//   4. POST to TwinMe API: /api/voice-bridge/inbound
//      { userId, whatsappMessageId, senderJid, oggBase64, durationSeconds }
//   5. TwinMe transcribes (Whisper), runs the chat handler, returns text
//   6. TwinMe API calls back: POST bridge /reply/:userId { text }
//   7. Bridge sends the text via whatsmeow.SendMessage to the user's own JID
//
// Persistence:
//   whatsmeow's sqlstore handles its own tables (whatsmeow_device,
//   whatsmeow_session, whatsmeow_*) in the same Postgres DB. On startup
//   we GetAllDevices() and reconnect each one, so Fly.io restarts don't
//   force re-pairing.
//
// Auth between bridge ↔ TwinMe API: BRIDGE_SHARED_SECRET in headers.

package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	_ "github.com/lib/pq"
	qrcode "github.com/skip2/go-qrcode"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------

type config struct {
	Port               string // bridge HTTP port
	TwinMeAPIBaseURL   string // e.g. https://www.twinme.me/api
	BridgeSharedSecret string // shared HMAC for bridge ↔ TwinMe auth
	DatabaseURL        string // Postgres connection string (Supabase pooler)
	WhatsmeowLogLevel  string // INFO | DEBUG | WARN | ERROR
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

type bridge struct {
	cfg          *config
	container    *sqlstore.Container
	mu           sync.RWMutex
	clients      map[string]*userClient  // user_id → connected client
	pendingLinks map[string]*pendingLink // user_id → current pairing state
	httpClient   *http.Client
	clientLog    waLog.Logger
}

type userClient struct {
	userID string
	jid    string
	client *whatsmeow.Client
}

type pendingLink struct {
	userID    string
	qrCode    string // PNG data URL we expose to the frontend
	expiresAt time.Time
	cancel    context.CancelFunc
	// The whatsmeow client being paired. We hold it on this struct so the
	// /cancel handler can Disconnect() and so we can transfer it into
	// b.clients atomically on PairSuccess.
	client *whatsmeow.Client
}

func newBridge(cfg *config, container *sqlstore.Container, clientLog waLog.Logger) *bridge {
	return &bridge{
		cfg:          cfg,
		container:    container,
		clients:      make(map[string]*userClient),
		pendingLinks: make(map[string]*pendingLink),
		httpClient:   &http.Client{Timeout: 60 * time.Second},
		clientLog:    clientLog,
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
// Returns: { "status": "pending", "qrCode": "data:image/png;base64,...", "expiresAt": "RFC3339" }
//
// Behavior:
//   1. Cancel any existing pending link for this user
//   2. Disconnect any existing linked client (user is re-pairing)
//   3. Create a fresh whatsmeow device + client
//   4. Subscribe to GetQRChannel — receive a sequence of QR codes
//   5. Background goroutine watches for events.PairSuccess → upserts
//      whatsapp_links via the TwinMe API + promotes pendingLink → client
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

	// Cancel any in-flight pending link for this user
	b.cancelPending(req.UserID)

	// Disconnect any linked client (user is intentionally re-pairing)
	b.mu.Lock()
	if existing, ok := b.clients[req.UserID]; ok {
		existing.client.Disconnect()
		delete(b.clients, req.UserID)
	}
	b.mu.Unlock()

	// Fresh device — whatsmeow stores it via the container as soon as
	// pairing completes (via PairSuccess handler).
	device := b.container.NewDevice()
	client := whatsmeow.NewClient(device, b.clientLog)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)

	pl := &pendingLink{
		userID:    req.UserID,
		expiresAt: time.Now().Add(120 * time.Second),
		cancel:    cancel,
		client:    client,
	}
	b.mu.Lock()
	b.pendingLinks[req.UserID] = pl
	b.mu.Unlock()

	// Wire handlers BEFORE Connect — whatsmeow guarantees atomic handler
	// registration but only delivers events that occur after the call.
	// If we connected first, a fast PairSuccess (cached creds) could miss
	// the handler entirely.
	var handlerID uint32
	handlerID = client.AddEventHandler(func(evt any) {
		switch e := evt.(type) {
		case *events.PairSuccess:
			b.onPairSuccess(req.UserID, client, e)
			client.RemoveEventHandler(handlerID)
			// Register the long-running event handler for voice + lifecycle.
			b.attachClientHandlers(req.UserID, client)
		}
	})

	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		b.cancelPending(req.UserID)
		log.Printf("[link/start] GetQRChannel failed userId=%s err=%v", req.UserID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "qr_channel_failed"})
		return
	}
	if err := client.Connect(); err != nil {
		b.cancelPending(req.UserID)
		log.Printf("[link/start] Connect failed userId=%s err=%v", req.UserID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "connect_failed"})
		return
	}

	// Background goroutine: pump QR codes into pendingLink.qrCode + handle
	// timeout/error exit conditions.
	go b.pumpQRChannel(req.UserID, qrChan)

	// Wait briefly so the first QR lands in state before we return — frontend
	// can render immediately rather than seeing an empty pending state.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		b.mu.RLock()
		hasCode := pl.qrCode != ""
		b.mu.RUnlock()
		if hasCode {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	b.mu.RLock()
	defer b.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "pending",
		"qrCode":    pl.qrCode,
		"expiresAt": pl.expiresAt.Format(time.RFC3339),
	})
}

// pumpQRChannel iterates qr events from whatsmeow and re-renders each new
// code into a PNG data URL stored on the pendingLink.
func (b *bridge) pumpQRChannel(userID string, qrChan <-chan whatsmeow.QRChannelItem) {
	for evt := range qrChan {
		switch evt.Event {
		case "code":
			pngBytes, err := qrcode.Encode(evt.Code, qrcode.Medium, 256)
			var dataURL string
			if err != nil {
				log.Printf("[qr] encode failed userId=%s err=%v", userID, err)
				dataURL = evt.Code // fallback to raw text
			} else {
				dataURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
			}
			b.mu.Lock()
			if pl, ok := b.pendingLinks[userID]; ok {
				pl.qrCode = dataURL
				pl.expiresAt = time.Now().Add(time.Duration(evt.Timeout) * time.Second)
			}
			b.mu.Unlock()
		case "timeout", "err-client-outdated", "err-scanned-without-multidevice":
			log.Printf("[qr] terminal event userId=%s event=%s", userID, evt.Event)
			b.cancelPending(userID)
			return
		case "success":
			// PairSuccess handler does the actual promotion; we just stop
			// pumping the channel.
			return
		}
	}
}

// onPairSuccess is fired by whatsmeow when the user finishes scanning. The
// client is now associated with a real WhatsApp JID. We promote the pending
// link into the active clients map and notify the TwinMe API so the
// whatsapp_links row gets the linked status.
func (b *bridge) onPairSuccess(userID string, client *whatsmeow.Client, e *events.PairSuccess) {
	deviceJID := e.ID.String()
	pushName := e.BusinessName
	if pushName == "" {
		pushName = client.Store.PushName
	}

	// Promote pendingLink → client. We deliberately do NOT call pl.cancel()
	// because that cancels the context whatsmeow used inside GetQRChannel,
	// and whatsmeow may still be flushing pair-success state via that ctx.
	// The 120s deadline expires naturally — no leak.
	b.mu.Lock()
	delete(b.pendingLinks, userID)
	b.clients[userID] = &userClient{
		userID: userID,
		jid:    deviceJID,
		client: client,
	}
	b.mu.Unlock()

	log.Printf("[pair] success userId=%s jid=%s pushName=%q", userID, deviceJID, pushName)

	// Notify TwinMe API so whatsapp_links flips to status='linked'
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	body, _ := json.Marshal(map[string]any{
		"userId":      userID,
		"jid":         deviceJID,
		"displayName": pushName,
		"phoneNumber": phoneFromJID(deviceJID),
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/voice-bridge/link/complete", b.cfg.TwinMeAPIBaseURL),
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Bridge-Secret", b.cfg.BridgeSharedSecret)

	resp, err := b.httpClient.Do(req)
	if err != nil {
		log.Printf("[pair] link/complete POST failed userId=%s err=%v", userID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("[pair] link/complete returned %d userId=%s", resp.StatusCode, userID)
	}
}

// attachClientHandlers registers the persistent event handler for a
// connected client. Called once per client after pairing or on resume.
func (b *bridge) attachClientHandlers(userID string, client *whatsmeow.Client) {
	client.AddEventHandler(func(evt any) {
		switch v := evt.(type) {
		case *events.Message:
			b.handleIncomingMessage(userID, client, v)
		case *events.Disconnected:
			log.Printf("[ws] disconnected userId=%s — whatsmeow will reconnect", userID)
		case *events.LoggedOut:
			log.Printf("[ws] LoggedOut userId=%s — removing client", userID)
			b.mu.Lock()
			if uc, ok := b.clients[userID]; ok {
				uc.client.Disconnect()
				delete(b.clients, userID)
			}
			b.mu.Unlock()
		}
	})
}

// handleIncomingMessage filters to voice notes (PTT messages) sent to self,
// downloads the encrypted OGG, and forwards it to the TwinMe API.
//
// We only process AudioMessage with PTT=true (push-to-talk = voice note).
// Regular audio file attachments are ignored — askjo's UX is voice-note-
// driven and processing every audio attachment is noisy.
//
// "Sent to self" filter: we currently process ALL voice notes from chats
// the user participates in. Future hardening: ignore messages where the
// chat JID isn't the user's own JID. For Phase 2 we trust the user to
// send self-voice-notes when interacting with their twin.
func (b *bridge) handleIncomingMessage(userID string, client *whatsmeow.Client, evt *events.Message) {
	audio := evt.Message.GetAudioMessage()
	if audio == nil || !audio.GetPTT() {
		return // not a voice note
	}

	// Restrict to messages where the chat (peer) is the user themselves —
	// voice-to-self pattern. This is what jo's UX maps to.
	if client.Store.ID == nil {
		return
	}
	selfJID := client.Store.ID.ToNonAD()
	chatJID := evt.Info.Chat.ToNonAD()
	if chatJID.String() != selfJID.String() {
		log.Printf("[voice] ignoring voice in non-self chat userId=%s chat=%s self=%s",
			userID, chatJID.String(), selfJID.String())
		return
	}

	log.Printf("[voice] inbound userId=%s msgId=%s seconds=%d",
		userID, evt.Info.ID, audio.GetSeconds())

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	data, err := client.Download(audio)
	if err != nil {
		log.Printf("[voice] download failed userId=%s msgId=%s err=%v",
			userID, evt.Info.ID, err)
		return
	}

	payload := &inboundVoicePayload{
		UserID:            userID,
		WhatsappMessageID: evt.Info.ID,
		SenderJID:         evt.Info.Sender.String(),
		OggBase64:         base64.StdEncoding.EncodeToString(data),
		DurationSeconds:   float64(audio.GetSeconds()),
	}

	if err := b.forwardVoiceToTwinMe(ctx, payload); err != nil {
		log.Printf("[voice] forward failed userId=%s msgId=%s err=%v",
			userID, evt.Info.ID, err)
		return
	}
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
	b.cancelPending(userID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// cancelPending tears down a pending pairing. Idempotent — safe to call
// even if no pending link exists.
func (b *bridge) cancelPending(userID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	pl, ok := b.pendingLinks[userID]
	if !ok {
		return
	}
	if pl.client != nil {
		pl.client.Disconnect()
	}
	pl.cancel()
	delete(b.pendingLinks, userID)
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
	if strings.TrimSpace(req.Text) == "" {
		http.Error(w, "empty text", http.StatusBadRequest)
		return
	}

	b.mu.RLock()
	uc, ok := b.clients[userID]
	b.mu.RUnlock()
	if !ok {
		http.Error(w, "user not linked", http.StatusNotFound)
		return
	}

	if uc.client.Store.ID == nil {
		http.Error(w, "client not paired", http.StatusServiceUnavailable)
		return
	}
	recipient := uc.client.Store.ID.ToNonAD()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	resp, err := uc.client.SendMessage(ctx, recipient, &waProto.Message{
		Conversation: proto.String(req.Text),
	})
	if err != nil {
		log.Printf("[reply] SendMessage failed userId=%s err=%v", userID, err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "send_failed"})
		return
	}

	log.Printf("[reply] sent userId=%s msgId=%s len=%d", userID, resp.ID, len(req.Text))
	writeJSON(w, http.StatusOK, map[string]string{
		"status":   "sent",
		"messageId": resp.ID,
	})
}

// ---------------------------------------------------------------------
// Inbound voice → TwinMe API
// ---------------------------------------------------------------------

type inboundVoicePayload struct {
	UserID            string  `json:"userId"`
	WhatsappMessageID string  `json:"whatsappMessageId"`
	SenderJID         string  `json:"senderJid"`
	OggBase64         string  `json:"oggBase64"`
	DurationSeconds   float64 `json:"durationSeconds"`
}

func (b *bridge) forwardVoiceToTwinMe(ctx context.Context, payload *inboundVoicePayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/voice-bridge/inbound", b.cfg.TwinMeAPIBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
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
// Session resume on startup
// ---------------------------------------------------------------------
//
// whatsmeow's sqlstore keeps device + session keys across restarts. On
// every boot we list every device the store knows about, look up the
// matching user_id via the TwinMe API (whatsapp_links), and reconnect.
//
// If we can't resolve the user_id for a device (e.g. user deleted from
// TwinMe but whatsmeow row still exists), the device is left orphaned.
// A periodic cron in the Vercel API will surface these as a metric.

func (b *bridge) resumeAll(ctx context.Context) error {
	devices, err := b.container.GetAllDevices(ctx)
	if err != nil {
		return fmt.Errorf("GetAllDevices: %w", err)
	}
	if len(devices) == 0 {
		log.Printf("[resume] no devices in store")
		return nil
	}

	// We need user_id for each JID. Ask the TwinMe API to look them up.
	type linkRow struct {
		UserID string `json:"userId"`
		JID    string `json:"jid"`
	}
	url := fmt.Sprintf("%s/voice-bridge/links/active", b.cfg.TwinMeAPIBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Bridge-Secret", b.cfg.BridgeSharedSecret)
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("links/active fetch: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("links/active returned %d", resp.StatusCode)
	}
	var parsed struct {
		Links []linkRow `json:"links"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return fmt.Errorf("decode: %w", err)
	}

	// Build jid → userId map
	jidToUser := make(map[string]string, len(parsed.Links))
	for _, lr := range parsed.Links {
		jidToUser[lr.JID] = lr.UserID
	}

	resumed := 0
	for _, device := range devices {
		if device.ID == nil {
			continue
		}
		jid := device.ID.String()
		userID, ok := jidToUser[jid]
		if !ok {
			// Try non-AD form too (with/without device id suffix)
			userID, ok = jidToUser[device.ID.ToNonAD().String()]
		}
		if !ok {
			log.Printf("[resume] orphan device jid=%s — no matching TwinMe user", jid)
			continue
		}

		client := whatsmeow.NewClient(device, b.clientLog)
		b.attachClientHandlers(userID, client)
		if err := client.Connect(); err != nil {
			log.Printf("[resume] Connect failed userId=%s jid=%s err=%v", userID, jid, err)
			continue
		}
		b.mu.Lock()
		b.clients[userID] = &userClient{userID: userID, jid: jid, client: client}
		b.mu.Unlock()
		resumed++
	}

	log.Printf("[resume] reconnected %d/%d devices", resumed, len(devices))
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

	dbLog := waLog.Stdout("Database", cfg.WhatsmeowLogLevel, true)
	container, err := sqlstore.New(context.Background(), "postgres", cfg.DatabaseURL, dbLog)
	if err != nil {
		log.Fatalf("sqlstore.New: %v", err)
	}
	// whatsmeow uses a global store DeviceProps for its initial pair message
	store.DeviceProps.Os = proto.String("TwinMe Bridge")

	clientLog := waLog.Stdout("Client", cfg.WhatsmeowLogLevel, true)
	br := newBridge(cfg, container, clientLog)

	// Resume any previously-linked sessions BEFORE we open the HTTP port
	// so we don't accept /link/start requests with stale in-memory state.
	resumeCtx, resumeCancel := context.WithTimeout(context.Background(), 60*time.Second)
	if err := br.resumeAll(resumeCtx); err != nil {
		log.Printf("[startup] resumeAll failed (non-fatal): %v", err)
	}
	resumeCancel()

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      br.routes(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 90 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown on SIGTERM/SIGINT (Fly.io sends SIGINT on deploy)
	shutdownCh := make(chan struct{})
	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
		sig := <-ch
		log.Printf("received %v, shutting down", sig)

		// Disconnect all clients first — whatsmeow flushes session state.
		br.mu.RLock()
		for _, uc := range br.clients {
			uc.client.Disconnect()
		}
		br.mu.RUnlock()

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(shutdownCh)
	}()

	log.Printf("twin-me voice bridge listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server: %v", err)
	}
	<-shutdownCh
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// phoneFromJID extracts the E.164-ish number from a whatsmeow JID.
// JID format: "5511999999999@s.whatsapp.net" or "5511999999999:5@s.whatsapp.net"
// We strip the @suffix and any :device-id suffix.
func phoneFromJID(jid string) string {
	if at := strings.IndexByte(jid, '@'); at >= 0 {
		jid = jid[:at]
	}
	if colon := strings.IndexByte(jid, ':'); colon >= 0 {
		jid = jid[:colon]
	}
	return "+" + jid
}

