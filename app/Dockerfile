# Stage 1: Build the React/Vite application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build 

# Stage 2: Serve using Node.js + Express
FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled static assets and server script
COPY --from=builder /app/dist ./dist
COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
