FROM node:20-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --production

# Copy client package files and build
WORKDIR /app
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ ./
RUN npm run build

# Copy server source
WORKDIR /app
COPY server/ ./server/

# Set production env
ENV NODE_ENV=production
EXPOSE 5000

WORKDIR /app/server
CMD ["node", "index.js"]
