FROM node:24-alpine AS builder
WORKDIR /app

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
RUN pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml* ./
COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm prune --prod \
  && mkdir -p dist/node_modules && cp -a node_modules dist/

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=80

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/dist ./

USER app
EXPOSE 80
CMD ["node", "server/entry.mjs"]

