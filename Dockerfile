FROM node:20-alpine AS web-build

WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim

ENV PLANNER_DB_PATH=/data/planner.db \
    PROJECT_MGMT_DB_PATH=/data/project_mgmt.db \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app_planner ./app_planner
COPY app_projmgmt ./app_projmgmt
COPY --from=web-build /build/web/dist ./web/dist

RUN pip install --no-cache-dir \
  "fastapi>=0.111.0" \
  "pydantic>=2.11.3" \
  "uvicorn>=0.29.0"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"

CMD ["uvicorn", "app_planner.api:app", "--host", "0.0.0.0", "--port", "8000"]
