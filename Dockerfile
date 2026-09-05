FROM ghcr.io/puppeteer/puppeteer:latest

USER root
RUN mkdir -p /app && chown -R pptruser:pptruser /app
USER pptruser

WORKDIR /app

COPY --chown=pptruser:pptruser package*.json ./
RUN npm install

COPY --chown=pptruser:pptruser . .

# Render Web Service needs a port to bind to
EXPOSE 3000
CMD ["node", "index.js"]
