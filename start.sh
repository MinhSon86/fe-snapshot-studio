#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
  echo "[1/2] Đang cài đặt thư viện lần đầu..."
  npm install
fi
node server/index.js
