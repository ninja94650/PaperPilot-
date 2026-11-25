FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOME=/tmp \
    TMPDIR=/tmp \
    SAL_USE_VCLPLUGIN=svp

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress libreoffice-calc fonts-liberation fonts-noto-core \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app \
  && chown -R node:node /app

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node server.mjs archive-validation.mjs clamav.mjs queue-runner.mjs process-control.mjs queue-to-storage.integration.mjs ./

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
