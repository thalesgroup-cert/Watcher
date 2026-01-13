#!/usr/bin/env bash

# Function to load environment variables from a file
load_env_file() {
    if [ -f "$1" ]; then
        echo "Loading environment variables from $1..."
        export $(grep -v '^#' "$1" | xargs)
    else
        echo "Error: Environment file $1 does not exist."
        exit 1
    fi
}

load_env_file ".env"

if ! docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo "Network $NETWORK_NAME not found. Creating it..."
    docker network create --subnet=$NETWORK_SUBNET --gateway=$NETWORK_GATEWAY --ip-range=$NETWORK_IP_RANGE "$NETWORK_NAME"
    echo "Network $NETWORK_NAME created successfully."
else
    echo "Network $NETWORK_NAME already exists."
fi