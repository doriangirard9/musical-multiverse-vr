FROM node:lts-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY package*.json ./
RUN npm install
COPY . .

ARG VITE_SERVER_NAME
ENV VITE_SERVER_NAME=$VITE_SERVER_NAME

ARG VITE_SIGNALING_SERVER
ENV VITE_SIGNALING_SERVER=$VITE_SIGNALING_SERVER

RUN npm run build:prod

FROM node:lts-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite.config.js ./

# Use HTTPS
COPY --from=builder /app/localhost.crt ./
COPY --from=builder /app/localhost.key ./

EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]