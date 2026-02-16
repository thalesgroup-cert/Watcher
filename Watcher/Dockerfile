#################################################
#                                               #
#   DOCKERFILE – Watcher                        #
#                                               #
#################################################

#################################################
#               BUILD ARGS                      #
#################################################
ARG PYTHON_VERSION=3.11.14
ARG DEBIAN_SUITE=bookworm
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

#################################################
#                FRONTEND BUILD                #
#################################################
FROM node:18-bookworm-slim AS frontend-builder

WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .

# Install ReactJs dependencies
RUN npm install

#################################################
#                BACKEND BUILD                 #
#################################################
FROM python:3.11-slim-bookworm AS backend-builder

ENV http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Build-time dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libssl-dev \
        libldap2-dev \
        libsasl2-dev \
        libmariadb-dev \
        curl \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (pinned)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

COPY requirements.txt .

# Install dependencies directly into system python
RUN uv pip install --system --no-cache -r requirements.txt

# PyTorch (CPU pinned)
RUN uv pip install --system --extra-index-url https://download.pytorch.org/whl/cpu torch==2.2.0 torchvision==0.17.0 torchaudio==2.2.0

# NLTK data
RUN python - <<EOF
import nltk
nltk.download("punkt", download_dir="/usr/local/share/nltk_data")
nltk.download("stopwords", download_dir="/usr/local/share/nltk_data")
EOF


#################################################
#                   RUNTIME                    #
#################################################
FROM python:3.11-slim-bookworm

LABEL title='Watcher' \
        description='Watcher is a Django & React JS automated platform for discovering new potentially cybersecurity threats targeting your organisation.' \
        documentation='https://thalesgroup-cert.github.io/Watcher/' \
        source='https://github.com/thalesgroup-cert/Watcher' \
        maintainer='ygalnezri@icloud.com'

ENV http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Runtime-only libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
        libldap-common \
        libsasl2-2 \
        libmariadb3 \
        libssl3 \
        curl \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Rust (build only)
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy Python environment from builder
COPY --from=backend-builder /usr/local /usr/local

# Copy NLTK data
COPY --from=backend-builder /usr/local/share/nltk_data /usr/local/share/nltk_data

# Copy application code
COPY . .

# Copy frontend build output
COPY --from=frontend-builder /frontend/ /app/Watcher/static

WORKDIR /app/Watcher

# Collect static files for production purpose
RUN python manage.py collectstatic --noinput


EXPOSE 9002

CMD ["python", "manage.py", "runserver", "0.0.0.0:9002"]
