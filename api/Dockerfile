FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

RUN npm install typescript && npm run build && npm remove typescript

USER app

EXPOSE 3000

CMD ["npm", "start"]
