#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname -- "$0")/scripts/launch.sh" start "$@"
