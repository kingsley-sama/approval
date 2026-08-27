#!/usr/bin/env bash
# Puts the user's Node install on PATH (it is not there by default),
# then starts the Next dev server.
export PATH="/home/callstack/.local/node/bin:$PATH"
exec npm run dev
