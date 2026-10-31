FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV UDP_PORT=3001

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./

EXPOSE 3000
EXPOSE 3001/udp

CMD ["node", "server.js"]
