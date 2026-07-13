# syntax=docker/dockerfile:1
# =============================================================================
# Stage 1: Build the frontend
# =============================================================================
FROM --platform=$BUILDPLATFORM oven/bun:1.3.14-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
COPY frontend/patches ./patches
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts

COPY frontend/ ./
RUN bun run build

# =============================================================================
# Stage 2: Build the backend (with embedded frontend)
# =============================================================================
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend-builder

# Provided automatically by BuildKit; used to cross-compile from the native
# build platform to each requested target platform (no QEMU emulation).
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -tags "embed_frontend,no_embedded_postgres" -o /querylane .

# =============================================================================
# Stage 3: Runtime
# =============================================================================
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=backend-builder /querylane /usr/local/bin/querylane

EXPOSE 8080

ENTRYPOINT ["querylane"]
CMD ["server", "start"]
