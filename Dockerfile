FROM node:24-bookworm-slim@sha256:713cfbf4a0ac19f40e1bb9919893e126b74a5c8cf5d0623c9f89515c8f74c6fa

RUN npm install --global pnpm@10.14.0
WORKDIR /app
RUN mkdir -p /data && chown node:node /app /data
COPY --chown=node:node package.json pnpm-lock.yaml ./
USER node
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build evaluates configuration but never connects to the runtime database.
RUN PAYLOAD_SECRET=build-only-placeholder-not-a-runtime-secret PAYLOAD_DATA_DIR=/tmp/payload-build pnpm build
ENV NODE_ENV=production PAYLOAD_DATA_DIR=/data
EXPOSE 3000
CMD ["sh", "-c", "pnpm migrate && exec pnpm exec next start --hostname 0.0.0.0 --port 3000"]
