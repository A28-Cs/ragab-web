# Worker + migrate image (§49). Runs the BullMQ worker or the migrator (compose picks
# the command). Multi-stage: install deps once, run with tsx (no build step needed for
# the server's TS, which tsx executes directly).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
# Install only what the server workspace needs.
RUN npm ci --omit=dev --workspace @ragab/server --include-workspace-root || npm install --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
# tsx is a dev dependency; install it in the runtime image for direct TS execution.
RUN npm i -g tsx@4
# Drop privileges.
USER node
CMD ["tsx", "packages/server/src/jobs/worker.ts"]
