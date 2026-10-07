# کیت دمو روی همان ایمیج API ساخته می‌شود تا seed پایه همان نسخه اپ (dist/db/seed.js) در دسترس باشد.
#   docker build --build-arg API_IMAGE=madreseh-api:1.4.0 -t rasa-demo-kit kit
ARG API_IMAGE=madreseh-api:latest
FROM ${API_IMAGE}
USER root
WORKDIR /kit
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
RUN mkdir -p /data /state && chown -R node:node /data /state
USER node
ENV NODE_ENV=production DATA_DIR=/data PORT=8090 SEED_COMMAND="node /app/apps/api/dist/db/seed.js"
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
