set dotenv-load := true

port := env_var_or_default("ARROWSAPP_PORT", "8080")

default:
    just --list

install:
    npm install

dev:
    npm run dev -- --host 127.0.0.1

dev-lan:
    npm run dev -- --host 0.0.0.0

build:
    npm run build

preview:
    npm run preview -- --host 127.0.0.1

preview-lan:
    npm run preview -- --host 0.0.0.0

docker-build:
    docker compose build

docker-up:
    docker compose up --build

docker-up-detached:
    docker compose up --build -d

docker-down:
    docker compose down

docker-logs:
    docker compose logs -f arrowsapp

docker-url:
    @echo "http://localhost:{{port}}"

check: build

status:
    git status -sb

