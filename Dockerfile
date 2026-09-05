FROM node:20-alpine AS web-build

WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim

ENV DATABASE_URL=postgresql://daily_planner:daily_planner@postgres:5432/daily_planner \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app_planner ./app_planner
COPY app_projmgmt ./app_projmgmt
COPY --from=web-build /build/web/dist ./web/dist

RUN pip install --no-cache-dir \
  "fastapi>=0.111.0" \
  "psycopg[binary]>=3.2.9" \
  "pydantic>=2.11.3" \
  "uvicorn>=0.29.0"

RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"

CMD ["uvicorn", "app_planner.api:app", "--host", "0.0.0.0", "--port", "8000"]
