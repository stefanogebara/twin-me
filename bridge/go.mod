module github.com/stefanogebara/twin-me/bridge

go 1.25

// Dependencies resolved by `go mod tidy` during Docker build.
// To regenerate locally: `go mod tidy` (requires network access).
// Imports used (see main.go):
//   - go.mau.fi/whatsmeow                  WhatsApp Web protocol client
//   - go.mau.fi/whatsmeow/proto/waE2E      protobuf message types
//   - go.mau.fi/whatsmeow/store/sqlstore   Postgres-backed session storage
//   - go.mau.fi/whatsmeow/types/events     event types for the handler
//   - go.mau.fi/whatsmeow/util/log         whatsmeow's logger interface
//   - github.com/lib/pq                    Postgres driver for sqlstore
//   - github.com/skip2/go-qrcode            QR code PNG encoder
//   - github.com/joho/godotenv/autoload    .env loader for local dev
//   - google.golang.org/protobuf/proto     proto.String helper
