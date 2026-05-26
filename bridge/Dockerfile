# Multi-stage build for the TwinMe voice bridge.
# Final image is ~25 MB, runs on Fly.io's smallest machine class.
#
# Build strategy: go.mod is minimal (no version pins). The build stage
# runs `go mod tidy` first which scans the imports and resolves them to
# the latest compatible versions from the module proxy. This avoids the
# pseudo-version-pin maintenance burden for whatsmeow (which doesn't tag
# releases). The resulting go.sum is generated inside the container —
# we don't currently commit it, but the trade-off is acceptable for a
# v1 single-developer project. Re-add `COPY go.sum` + a committed
# go.sum if/when build reproducibility becomes critical.

FROM golang:1.25-alpine AS build

# git is needed for go modules to resolve from VCS sources
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Copy the minimal go.mod first for Docker layer caching
COPY go.mod ./

# Copy source
COPY *.go ./

# Resolve all imports and build a static binary
RUN go mod tidy \
 && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/bridge .

# Runtime
FROM gcr.io/distroless/static-debian12:nonroot

# whatsmeow makes outbound HTTPS calls to WhatsApp servers — needs CA bundle.
# The distroless static image includes a CA bundle by default.

COPY --from=build /out/bridge /bridge

EXPOSE 8080
USER nonroot:nonroot

ENTRYPOINT ["/bridge"]
