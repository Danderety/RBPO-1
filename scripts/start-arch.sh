#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
command -v node >/dev/null || { echo 'Install Node.js 24+ with pacman first'; exit 1; }
exec node server.mjs
