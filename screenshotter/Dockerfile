# Screenshot service of Watcher: a headless Chromium behind a tiny HTTP server (see server.py).
FROM python:3.12-slim-bookworm

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

# The version of the library is the one of the browser it downloads
RUN pip install --no-cache-dir playwright==1.64.1 \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Not root: the pages the browser visits are not trusted
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin shot

WORKDIR /app
COPY guard.py server.py ./

USER shot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=3)" || exit 1
CMD ["python", "server.py"]
