#!/bin/bash
cd -- "$(dirname -- "$0")"
bash check.sh "$@"
studio_result=$?
printf '\nPress Enter to close...'
read -r
exit "$studio_result"
