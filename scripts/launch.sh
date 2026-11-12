#!/usr/bin/env bash
set -euo pipefail
studio_mode="${1:-setup}"
shift || true
case "$studio_mode" in setup|check|start) ;; *) echo '[ERROR] Use setup, check or start.' >&2; exit 1 ;; esac
studio_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$studio_root"
if [ "$studio_mode" != check ]; then
  for studio_launcher in setup.sh start.sh check.sh setup.command start.command check.command; do
    chmod u+x "$studio_root/$studio_launcher"
  done
fi
printf '\n  [ FE ] SNAPSHOT STUDIO\n  Local design workspace | Setup & launcher\n\n'
studio_node_ok() {
  command -v "$1" >/dev/null 2>&1 && "$1" -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)' >/dev/null 2>&1
}
studio_node=''
if studio_node_ok node && command -v npm >/dev/null 2>&1; then
  studio_node="$(command -v node)"
else
  for studio_candidate in "$studio_root"/.tools/node/node-*/bin/node; do
    if studio_node_ok "$studio_candidate" && [ -x "$(dirname "$studio_candidate")/npm" ]; then studio_node="$studio_candidate"; break; fi
  done
fi
if [ -z "$studio_node" ]; then
  if [ "$studio_mode" = check ]; then echo '[ERROR] Node >=20 + npm is missing. Run bash setup.sh first.' >&2; exit 1; fi
  case "$(uname -s)" in Darwin) studio_os=darwin ;; Linux) studio_os=linux ;; *) echo '[ERROR] This launcher supports macOS/Linux. Windows: use setup.bat.' >&2; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) studio_arch=x64 ;; arm64|aarch64) studio_arch=arm64 ;; *) echo '[ERROR] x64 or arm64 is required.' >&2; exit 1 ;; esac
  command -v tar >/dev/null 2>&1 || { echo '[ERROR] tar is required to unpack Node.' >&2; exit 1; }
  studio_fetch() {
    if command -v curl >/dev/null 2>&1; then curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 30 --max-time 600 --retry 2 --output "$2" "$1"
    elif command -v wget >/dev/null 2>&1; then wget --https-only --timeout=60 --tries=2 -O "$2" "$1"
    else echo '[ERROR] curl or wget is required to download Node.' >&2; return 1; fi
  }
  studio_hash() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
    elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
    else echo '[ERROR] SHA256 verification needs sha256sum, shasum or openssl.' >&2; return 1; fi
  }
  mkdir -p -- "$studio_root/.tools/node"
  studio_stage="$(mktemp -d "$studio_root/.tools/node/download-XXXXXXXX")"
  studio_cleanup() { case "$studio_stage" in "$studio_root"/.tools/node/download-*) rm -rf -- "$studio_stage" ;; esac; }
  trap studio_cleanup EXIT
  studio_base='https://nodejs.org/dist/latest-v24.x'
  echo '[SETUP] Downloading portable Node.js 24 from nodejs.org...'
  studio_fetch "$studio_base/SHASUMS256.txt" "$studio_stage/checksums.txt"
  studio_entry="$(awk -v suffix="-$studio_os-$studio_arch.tar.gz" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-/ && substr($2,length($2)-length(suffix)+1)==suffix {print; exit}' "$studio_stage/checksums.txt")"
  [ -n "$studio_entry" ] || { echo '[ERROR] No matching archive in the official checksum manifest.' >&2; exit 1; }
  studio_expected="$(printf '%s\n' "$studio_entry" | awk '{print $1}')"
  studio_archive="$(printf '%s\n' "$studio_entry" | awk '{print $2}')"
  [[ "$studio_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-(darwin|linux)-(x64|arm64)\.tar\.gz$ ]] || { echo '[ERROR] Invalid archive name.' >&2; exit 1; }
  studio_fetch "$studio_base/$studio_archive" "$studio_stage/$studio_archive"
  [ "$(studio_hash "$studio_stage/$studio_archive")" = "$studio_expected" ] || { echo '[ERROR] Node archive checksum mismatch. Nothing was extracted.' >&2; exit 1; }
  tar -xzf "$studio_stage/$studio_archive" -C "$studio_stage"
  studio_folder="${studio_archive%.tar.gz}"
  studio_destination="$studio_root/.tools/node/$studio_folder"
  [ ! -e "$studio_destination" ] || { echo '[ERROR] Runtime directory exists but is unusable; no files were overwritten.' >&2; exit 1; }
  mv -- "$studio_stage/$studio_folder" "$studio_destination"
  studio_node="$studio_destination/bin/node"
  studio_node_ok "$studio_node" || { echo '[ERROR] Portable Node cannot run on this OS version. Update the OS or install a compatible Node >=20.' >&2; exit 1; }
  studio_cleanup
  trap - EXIT
fi
export PATH="$(dirname "$studio_node"):$PATH"
exec "$studio_node" "$studio_root/scripts/bootstrap.mjs" "$studio_mode" "$@"
