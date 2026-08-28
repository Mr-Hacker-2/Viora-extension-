#!/usr/bin/env bash
set -euo pipefail

container_name="nim-server"
local_nim_cache="${LOCAL_NIM_CACHE:-$HOME/.cache/nim}"
mkdir -p "$local_nim_cache"

if docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
  echo "Viora NIM is already running."
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$container_name"; then
  docker start "$container_name"
  exit 0
fi

echo "Starting Viora NIM..."
docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --runtime=nvidia --gpus all \
  -p 8000:8000 \
  -v "$local_nim_cache:/opt/nim/.cache/" \
  nvcr.io/nim/wan-ai/wan2.2-animate-2-14b:latest

echo "Viora NIM started at http://localhost:8000."
