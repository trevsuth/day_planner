FROM node:22-alpine AS web-build

WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS graph-build

WORKDIR /build/graph
COPY obsidian-arrow/package*.json ./
RUN npm ci
COPY obsidian-arrow/ ./
RUN npm run build:hosted

FROM node:22-alpine AS viewer-build

WORKDIR /build/viewer
COPY viewer/package*.json ./
RUN npm ci
COPY viewer/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.13.8 AS uv

FROM python:3.13-slim AS api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=bind,from=uv,source=/uv,target=/bin/uv \
    uv sync --locked --no-default-groups --no-install-project --no-cache

COPY app_planner ./app_planner
COPY app_projmgmt ./app_projmgmt
COPY app_graph ./app_graph
COPY app_viewer ./app_viewer

RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"

CMD ["uvicorn", "app_planner.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

FROM nginx:stable-alpine AS web

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/start.sh /usr/local/bin/start-web
USER 101:101
EXPOSE 8080
ENTRYPOINT ["sh", "/usr/local/bin/start-web"]

COPY deploy/nginx/web.conf /etc/nginx/routes.conf
COPY --from=web-build /build/web/dist /usr/share/nginx/html
COPY --from=graph-build /build/graph/dist-hosted /usr/share/nginx/html/graph
COPY --from=viewer-build /build/viewer/dist /usr/share/nginx/html/viewer
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/graph/ || exit 1
