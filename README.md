# Trading Fee For Reward Script

## Run locally

1. Copy .env.example to .env and fill up the PRIVATE_KEY

```
cp .env.example .env
```

2. Install dependencies

```
npm install
```

3. Run the Script

```
node index.js
```

## Build Docker

1. Copy .env.example to .env and fill up the PRIVATE_KEY

```
cp .env.example .env
```

2. Build Docker image

```
docker/build.sh
```

3. Run Docker container with Docker image build in step 2

```
docker/run.sh
```
