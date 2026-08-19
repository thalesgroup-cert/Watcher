#!/usr/bin/env bash

# Function to load environment variables from a file
load_env_file() {
    if [ ! -f "$1" ]; then
        echo "Error: Environment file $1 does not exist."
        exit 1
    fi

    echo "Loading environment variables from $1..."
    
    while IFS='=' read -r key value || [ -n "$key" ]; do
        if [[ -z "$key" ]] || [[ "$key" == \#* ]]; then continue; fi
        value="${value#\"}"; value="${value%\"}"
        value="${value#\'}"; value="${value%\'}"
        export "$key=$value"
    done < "$1"
}

load_env_file ".env"

if ! docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo "Network $NETWORK_NAME not found. Creating it..."
    docker network create --subnet=$NETWORK_SUBNET --gateway=$NETWORK_GATEWAY --ip-range=$NETWORK_IP_RANGE "$NETWORK_NAME"
    echo "Network $NETWORK_NAME created successfully."
else
    echo "Network $NETWORK_NAME already exists."
fi