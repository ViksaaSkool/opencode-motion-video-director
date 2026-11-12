#!/usr/bin/env bash
# with-env.sh — run a command with the project's .env loaded into the environment.
#
# Why: OpenCode MCP config `{env:NAME}` placeholders read OpenCode's *process*
# environment, not the project `.env`. Point the MCP command at this wrapper so
# keys stay in `.env` and out of your config:
#
#   "firecrawl": {
#     "type": "local",
#     "command": ["bash", "scripts/with-env.sh", "npx", "-y", "firecrawl-mcp"]
#   }
#
# Usage: with-env.sh <command> [args…]
# Loads ./.env if present (without exporting it into logs), then execs the command.
set -e
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec "$@"
