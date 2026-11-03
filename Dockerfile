# Works for both services. Web: default command. Worker: override the command with `npm run worker`.
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
