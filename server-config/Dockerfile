FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

FROM node:lts-alpine

WORKDIR /app

COPY --from=builder /app /app

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server.js"]
