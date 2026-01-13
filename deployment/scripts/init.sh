#!/usr/bin/env sh
set -eu

echo "============================================"
echo "      WATCHER – CHECKLIST"
echo "============================================"

# -------------------------------------------------
# 1. Required binaries
# -------------------------------------------------
echo "[1/5] Checking required binaries..."

# Check for docker binary
if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Missing required binary: docker"
fi

# Check that docker supports the compose subcommand
if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: Docker Compose is not available (docker compose subcommand required)"
fi

echo "→ OK"

# -------------------------------------------------
# 2. Ensure .env exists
# -------------------------------------------------
echo "[2/5] Checking .env..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "→ .env created from .env.example"
    else
        echo "ERROR: Missing both .env and .env.example"
    fi
else
    echo "→ .env present"
fi

# Load environment variables
set -a
. ./.env
set +a

# -------------------------------------------------
# 3. Directory structure check
# -------------------------------------------------
echo "[3/5] Checking directory structure..."

DIRS=(
    "${DB_WATCHER_PATH}"
    "${SEARX_PATH}"
    "${CA_PATH}"
)

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        perms=$(stat -c '%a' "$dir")
        echo "→ Directory exists: $dir (permissions: $perms)"
    else
        echo "→ Directory missing: $dir"
    fi
done

echo "→ Directory structure check complete"

# -------------------------------------------------
# 4. Check Watcher App .env and Traefik TLS config
# -------------------------------------------------
echo "[4/5] Checking application configuration..."

# WATCHER .env
if [ ! -f "${WATCHER_PATH}/.env" ]; then
    if [ -f "${WATCHER_PATH}/.env.example" ]; then
        cp "${WATCHER_PATH}/.env.example" "${WATCHER_PATH}/.env"
        echo "→ .env created from .env.example"
    else
        echo "ERROR: Missing both .env and .env.example"
    fi
else
    echo "→ .env present"
fi

# Traefik TLS file
TLS_FILE="${TRAEFIK_PATH}/dynamic/tls.yaml"
if [ -f "$TLS_FILE" ]; then
    if [ -n "${DOMAIN_CORP:-}" ]; then
        TMP_FILE="${TLS_FILE}.tmp"
        sed "s/Host(\`watcher\`)/Host(\`${DOMAIN_CORP}\`)/" "$TLS_FILE" > "$TMP_FILE"
        mv "$TMP_FILE" "$TLS_FILE"
        echo "→ tls.yaml updated with DOMAIN_CORP=${DOMAIN_CORP}"
    else
        echo "→ DOMAIN_CORP not set; tls.yaml not updated"
    fi
else
    echo "→ tls.yaml not present in Traefik dynamic path"
fi


# -------------------------------------------------
# 5. Certificates
# -------------------------------------------------
echo "[5/5] Checking certificates..."
CERTFILE="$CA_PATH/certfile.pem"
KEYFILE="$CA_PATH/keyfile.pem"
ROOTCAFILE="$CA_PATH/rootcafile.pem"

if [ ! -f "$CERTFILE" ] || [ ! -f "$KEYFILE" ] || [ ! -f "$ROOTCAFILE" ]; then
    echo "→ Missing certificates, generating..."
    ./scripts/openssl-certificates-generator.sh default --force
    mv ./certificates/default/certfile.pem "$CERTFILE"
    mv ./certificates/default/keyfile.pem "$KEYFILE"
    mv ./certificates/default/rootcafile.pem "$ROOTCAFILE"
    echo "→ Certificates generated in $CA_PATH"
else
    echo "→ Certificates already present"
fi


# -------------------------------------------------
# 6. Completion
# -------------------------------------------------
echo "============================================"
echo "    CHECKLIST COMPLETED"
echo "    All required components are in place."
echo "    You can now modify / check :"
echo "        - ${WATCHER_PATH}/.env"
echo "        - ${TRAEFIK_PATH}/dynamic/tls.yaml"
echo "============================================"
