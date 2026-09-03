FROM node:22.18.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY assets ./assets
COPY config ./config
COPY public ./public
COPY src ./src

RUN mkdir -p /var/lib/wellnot /var/backups/wellnot \
    && chown -R node:node /app /var/lib/wellnot /var/backups/wellnot

USER node
EXPOSE 3000
CMD ["pnpm", "start"]
