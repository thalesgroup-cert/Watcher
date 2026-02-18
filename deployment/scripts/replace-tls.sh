#!/usr/bin/env bash
set -Eeuo pipefail
source .env

update_tls_yaml() {
    local tls_file="${TRAEFIK_PATH}/dynamic/tls.yaml"

    if [ -f "$tls_file" ]; then
        if [ -z "$DOMAIN_CORP" ]; then
            echo "→ DOMAIN_CORP is not set, cannot update tls.yaml"
            return 1
        fi

        local tmp_file="${tls_file}.tmp"
        sed "s/Host(\`watcher\`)/Host(\`${DOMAIN_CORP}\`)/" "$tls_file" > "$tmp_file"
        mv "$tmp_file" "$tls_file"
        echo "→ tls.yaml updated with DOMAIN_CORP=${DOMAIN_CORP}"
    else
        echo "→ tls.yaml not present in Traefik dynamic path"
    fi
}

update_tls_yaml
