FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY index.html styles.css server.js ./
COPY src ./src
COPY data ./data
COPY docs ./docs

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server.js"]
