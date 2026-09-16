FROM node:24-bookworm-slim@sha256:713cfbf4a0ac19f40e1bb9919893e126b74a5c8cf5d0623c9f89515c8f74c6fa

RUN npm install --global pnpm@10.14.0
WORKDIR /app
RUN mkdir -p /data && chown node:node /app /data
COPY --chown=node:node package.json pnpm-lock.yaml ./
USER node
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
