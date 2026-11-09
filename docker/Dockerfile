# Alternate Dockerfile. Enter "docker/Dockerfile" in "Dockerfile Location".
# Differs visibly from the root one: Node 22 and a different BUILD_VARIANT / CMD label.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
ENV BUILD_METHOD=dockerfile \
    BUILD_VARIANT=docker-dir-dockerfile \
    DOCKERFILE_PATH=docker/Dockerfile
EXPOSE 3000
CMD ["node", "src/index.js", "--label=docker-dir-dockerfile-cmd"]
