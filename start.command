#!/bin/bash
cd -- "$(dirname -- "$0")"
bash start.sh "$@"
studio_result=$?
if [ "$studio_result" -ne 0 ]; then printf '\nPress Enter to close...'; read -r; fi
exit "$studio_result"
