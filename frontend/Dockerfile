# syntax=docker/dockerfile:1

# ---------- build stage ----------
# Same major Node version as CI, so the image builds exactly what CI verifies.
FROM node:22-alpine AS build

WORKDIR /src

# Manifests first, same reason as the backend: this layer, and the slow npm ci
# below it, are reused until a dependency actually changes. npm ci installs
# exactly what package-lock.json pins and fails if the two disagree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# BUILD-TIME config. Vite replaces import.meta.env.VITE_API_URL with this
# literal string inside the bundle, so the finished image only ever talks to
# this one API origin. Override with --build-arg VITE_API_URL=...
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---------- runtime stage ----------
# The unprivileged variant runs nginx as uid 101 and listens on 8080. The
# official nginx:alpine runs its master process as root.
FROM nginxinc/nginx-unprivileged:alpine

# RUN-TIME config, substituted into the CSP when the container starts. The
# default keeps a forgotten variable from leaving a literal ${API_ORIGIN} in
# the header, which would make the browser block every API call.
ENV API_ORIGIN=http://localhost:8080

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Only the compiled static files cross over. Node, npm, node_modules and the
# source all stay behind in the build stage.
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 8080
