FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

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
