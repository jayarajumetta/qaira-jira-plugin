#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${JIRA_BASE_URL:?Set JIRA_BASE_URL, e.g. https://your-domain.atlassian.net or https://api.atlassian.com/ex/jira/<cloudId>}"
: "${JIRA_EMAIL:?Set JIRA_EMAIL}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN}"
JIRA_AUTH_MODE="${JIRA_AUTH_MODE:-basic}" # basic | bearer
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS:-10}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-120}"
require_bin() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
require_bin curl
require_bin jq
BASE="${JIRA_BASE_URL%/}"
AUTH_CONFIG="$(mktemp)"
trap 'rm -f "$AUTH_CONFIG"' EXIT
if [[ "$JIRA_EMAIL" == *$'\n'* || "$JIRA_EMAIL" == *$'\r'* || "$JIRA_EMAIL" == *'"'* || "$JIRA_EMAIL" == *\\*
  || "$JIRA_API_TOKEN" == *$'\n'* || "$JIRA_API_TOKEN" == *$'\r'* || "$JIRA_API_TOKEN" == *'"'* || "$JIRA_API_TOKEN" == *\\* ]]; then
  echo "Jira credentials contain characters that cannot be safely represented in the temporary curl config." >&2
  exit 1
fi
case "$JIRA_AUTH_MODE" in
  basic) printf 'user = "%s:%s"\n' "$JIRA_EMAIL" "$JIRA_API_TOKEN" > "$AUTH_CONFIG" ;;
  bearer) printf 'header = "Authorization: Bearer %s"\n' "$JIRA_API_TOKEN" > "$AUTH_CONFIG" ;;
  *) echo "Unsupported JIRA_AUTH_MODE=$JIRA_AUTH_MODE. Use basic or bearer." >&2; exit 1 ;;
esac
chmod 600 "$AUTH_CONFIG"
call() {
  local label="$1" path="$2" out status
  out=$(mktemp)
  status=$(curl --silent --show-error --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" --max-time "$CURL_MAX_TIME_SECONDS" --config "$AUTH_CONFIG" -H 'Accept: application/json' -o "$out" -w '%{http_code}' "$BASE$path" || true)
  printf '\n=== %s: HTTP %s ===\n' "$label" "$status"
  cat "$out" | jq . 2>/dev/null || cat "$out"
  rm -f "$out"
}

echo "JIRA_BASE_URL=$BASE"
echo "JIRA_EMAIL=$JIRA_EMAIL"
echo "JIRA_AUTH_MODE=$JIRA_AUTH_MODE"
echo "Token length=${#JIRA_API_TOKEN}"
call "Authenticated user" "/rest/api/3/myself"
call "Visible projects" "/rest/api/3/project/search?maxResults=50&orderBy=key"
call "Administer Jira permission" "/rest/api/3/mypermissions?permissions=ADMINISTER"
cat <<'EOF'

Notes:
- For a normal Atlassian account API token, use:
    JIRA_BASE_URL=https://your-site.atlassian.net
    JIRA_AUTH_MODE=basic
- For a scoped account/service-account token that requires the Atlassian API gateway, use:
    JIRA_BASE_URL=https://api.atlassian.com/ex/jira/<cloudId>
    JIRA_AUTH_MODE=basic or bearer
- Do not use Organization API keys from admin.atlassian.com/o/<orgId>/api-keys for this Jira setup script. Those keys are for Atlassian Admin APIs, not Jira product REST configuration APIs.
- If Authenticated user is not HTTP 2xx, fix token type, endpoint, or auth mode first.
- If visible projects total is 0, the token user cannot see projects on this Jira site.
EOF
