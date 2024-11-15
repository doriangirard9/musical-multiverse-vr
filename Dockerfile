FROM node:alpine

WORKDIR /app

COPY package*.json ./
COPY bin/ ./bin/
COPY localhost.crt localhost.key ./

RUN npm install

EXPOSE 443

CMD ["node", "bin/server.js"]