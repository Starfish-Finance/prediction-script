FROM node:alpine

WORKDIR /app

# Dependencies
COPY ["./package.json", "./yarn.lock", "./"]
RUN yarn

# Run scripts
COPY . .