#!/usr/bin/env sh
set -eu

# This script generates TLS certificates for Watcher services
# Usage: ./openssl-certificates-generator.sh ENV_NAME [--force|-f]
# Output directory structure:
# certificates/ENV_NAME/
# ├── rootcafile.pem  (Root CA)
# ├── certfile.pem    (Server cert)
# ├── keyfile.pem     (Server private key)
# ├── client.crt.pem  (Optional client cert)
# └── client.key.pem  (Optional client key)

OUTPUT_DIR="../certificates"
SERVER_DAYS_VALID=825
CA_DAYS_VALID=3650
CERT_SUBJECT="/C=COUNTRY/ST=STATE/L=CITY/O=ORGANIZATION/OU=Watcher"
ROOT_CERTIFICATE_AUTHORITY="WatcherRootCA"

generate_ssl_context() {
    ENV="$1"
    FORCE="$2"

    ENV_DIR="$OUTPUT_DIR/$ENV"

    # File paths
    ROOT_CA_CERT="$ENV_DIR/rootcafile.pem"
    ROOT_CA_KEY="$ENV_DIR/ca.key.pem"
    ROOT_CA_SERIAL="$ENV_DIR/ca.cert.srl"

    SERVER_CERT="$ENV_DIR/certfile.pem"
    SERVER_KEY="$ENV_DIR/keyfile.pem"

    CLIENT_CERT="$ENV_DIR/client.crt.pem"
    CLIENT_KEY="$ENV_DIR/client.key.pem"
    CLIENT_CSR="$ENV_DIR/client.csr.pem"

    # Check existing dir
    if [ -d "$ENV_DIR" ] && [ "$FORCE" != "1" ]; then
        echo "Error: Directory $ENV_DIR already exists. Use --force to overwrite." >&2
        exit 1
    fi

    mkdir -p "$ENV_DIR"

    echo "Generating Root CA..."
    openssl genrsa -out "$ROOT_CA_KEY" 4096
    openssl req -x509 -new -nodes -key "$ROOT_CA_KEY" \
        -sha256 -days "$CA_DAYS_VALID" \
        -out "$ROOT_CA_CERT" \
        -subj "$CERT_SUBJECT/CN=$ROOT_CERTIFICATE_AUTHORITY"

    echo "Generating Server certificate..."
    openssl genrsa -out "$SERVER_KEY" 2048
    openssl req -new -key "$SERVER_KEY" -out "$ENV_DIR/server.csr.pem" \
        -subj "$CERT_SUBJECT/CN=server.$ENV.local"

    openssl x509 -req -in "$ENV_DIR/server.csr.pem" -CA "$ROOT_CA_CERT" -CAkey "$ROOT_CA_KEY" \
        -CAcreateserial -out "$SERVER_CERT" -days "$SERVER_DAYS_VALID" -sha256

    echo "Generating optional Client certificate..."
    openssl genrsa -out "$CLIENT_KEY" 2048
    openssl req -new -key "$CLIENT_KEY" -out "$CLIENT_CSR" \
        -subj "$CERT_SUBJECT/CN=client.$ENV.local"

    openssl x509 -req -in "$CLIENT_CSR" -CA "$ROOT_CA_CERT" -CAkey "$ROOT_CA_KEY" \
        -CAcreateserial -out "$CLIENT_CERT" -days "$SERVER_DAYS_VALID" -sha256

    echo "Certificates generated in $ENV_DIR:"
    echo "  Root CA    : $ROOT_CA_CERT"
    echo "  Server cert: $SERVER_CERT"
    echo "  Server key : $SERVER_KEY"
    echo "  Client cert: $CLIENT_CERT"
    echo "  Client key : $CLIENT_KEY"
}

main() {
    if [ "$#" -lt 1 ]; then
        echo "Usage: $0 ENV_NAME [--force|-f]" >&2
        exit 1
    fi

    ENV_NAME="$1"
    FORCE_FLAG=0

    if [ "$#" -eq 2 ]; then
        case "$2" in
            --force|-f) FORCE_FLAG=1 ;;
            *) echo "Unknown option: $2" >&2; exit 1 ;;
        esac
    fi

    generate_ssl_context "$ENV_NAME" "$FORCE_FLAG"
}

main "$@"
