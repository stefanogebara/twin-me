# Multi-stage build for the TwinMe voice bridge.
# Final image is ~25 MB, runs on Fly.io's smallest machine class.

FROM golang:1.22-alpine AS build

WORKDIR /src

# Copy module manifests first for cache friendliness
COPY go.mod go.sum* ./
RUN go mod download

# Copy source
COPY . .

# Build a static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/bridge .

# Runtime
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/bridge /bridge

EXPOSE 8080
USER nonroot:nonroot

ENTRYPOINT ["/bridge"]
