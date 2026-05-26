module github.com/stefanogebara/twin-me/bridge

go 1.22

// Pseudo-versions below are placeholders. After cloning, run:
//   go mod tidy
// which will resolve each `latest` pseudo-version to the current commit-
// based version. whatsmeow doesn't tag releases, so pseudo-versions are
// the canonical form.
//
// Pinned ranges:
//   whatsmeow      — v0.0.0+ (latest commit), API used: sqlstore.New with ctx,
//                    GetAllDevices(ctx), client.SendMessage, GetQRChannel,
//                    events.{Message,PairSuccess,Disconnected,LoggedOut,QR}.
//   skip2/go-qrcode — v0.0.0-20200617195104-da1b6568686e (latest tagged)
//                    Used to encode QR codes as PNG data URLs.
//   lib/pq         — v1.10.9 (Postgres driver for whatsmeow's sqlstore).
//   joho/godotenv  — for local .env loading (autoload).

require (
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.10.9
	github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e
	go.mau.fi/whatsmeow v0.0.0-20250901000000-000000000000
	google.golang.org/protobuf v1.34.2
)
