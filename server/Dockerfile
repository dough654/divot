FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

RUN npm install typescript && npm run build && npm remove typescript

EXPOSE 3000

CMD ["npm", "start"]
