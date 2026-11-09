# Default Dockerfile (root). Leave "Dockerfile Location" empty to use this one.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
# Surfaced by GET /info so the Source step can be verified.
ENV BUILD_METHOD=dockerfile \
    BUILD_VARIANT=root-dockerfile \
    DOCKERFILE_PATH=Dockerfile
EXPOSE 3000
CMD ["node", "src/index.js", "--label=root-dockerfile-cmd"]
