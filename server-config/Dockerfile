FROM node:lts-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY . .

FROM node:lts-alpine

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "server.js"]

