# syntax=docker/dockerfile:1

# ---------- build stage ----------
# Alpine-based Go image: smaller pull, and the build itself needs nothing from
# glibc because we disable cgo below.
FROM golang:1.26-alpine AS build

WORKDIR /src

# Copy ONLY the manifests first, then download modules. Docker caches each
# instruction's result keyed on the files it touched, so this layer is reused
# until go.mod or go.sum actually changes. Copying everything first would
# re-download every dependency on each source edit.
COPY go.mod go.sum ./
RUN go mod download

# Now the source. Changing a .go file invalidates from here down only.
COPY . .

# CGO_ENABLED=0 produces a fully static binary. Every dependency in this module
# is pure Go, so nothing is lost, and it is what allows a runtime image with no
# libc at all.
#   -trimpath strips local filesystem paths out of the binary
#   -s -w drop the symbol table and DWARF debug info, shrinking the result
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/api .

# ---------- runtime stage ----------
# distroless/static has no shell, no package manager, and no utilities: there is
# nothing for an attacker who gains execution to pivot with. It does ship CA
# certificates, which a managed Postgres over TLS will need.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

# The migrations are compiled into the binary with go:embed, so this single file
# is the entire application. Nothing can drift between image and schema.
COPY --from=build /out/api /app/api

# The base image already defaults to the nonroot user, but stating the uid makes
# it explicit to a reader and survives a base image change. 65532 is distroless's
# nonroot uid.
USER 65532:65532

EXPOSE 8080

ENTRYPOINT ["/app/api"]