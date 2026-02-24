FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/public ./dist/public
COPY src/db/migrations ./dist/db/migrations
EXPOSE 24001
CMD ["node", "dist/index.js"]
