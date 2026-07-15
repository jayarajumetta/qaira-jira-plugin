#!/usr/bin/env bash
# Apply Qaira feature availability from an external JSON file to Jira project properties.
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURE_FLAGS_FILE="${FEATURE_FLAGS_FILE:-$ROOT_DIR/admin/qaira-feature-flags.json}"
PROJECT_KEYS="${PROJECT_KEYS:-ALL}"
DRY_RUN="${DRY_RUN:-true}"
CONFIRM_ALL_PROJECTS="${CONFIRM_ALL_PROJECTS:-false}"
API_RETRIES="${API_RETRIES:-5}"
JIRA_AUTH_MODE="${JIRA_AUTH_MODE:-basic}"

: "${JIRA_BASE_URL:?Set JIRA_BASE_URL, for example https://your-domain.atlassian.net}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN to a Jira admin API token or OAuth bearer token}"
if [[ "$JIRA_AUTH_MODE" == "basic" ]]; then
  : "${JIRA_EMAIL:?Set JIRA_EMAIL when JIRA_AUTH_MODE=basic}"
fi

for binary in curl jq node; do
  command -v "$binary" >/dev/null 2>&1 || { echo "ERROR: Required binary not found: $binary" >&2; exit 1; }
done

[[ -f "$FEATURE_FLAGS_FILE" ]] || { echo "ERROR: Feature flag file not found: $FEATURE_FLAGS_FILE" >&2; exit 1; }
[[ "$DRY_RUN" == "true" || "$DRY_RUN" == "false" ]] || { echo "ERROR: DRY_RUN must be true or false" >&2; exit 1; }
[[ "$JIRA_AUTH_MODE" == "basic" || "$JIRA_AUTH_MODE" == "bearer" ]] || { echo "ERROR: JIRA_AUTH_MODE must be basic or bearer" >&2; exit 1; }

PROPERTY_KEY="$(jq -er '.propertyKey | select(type == "string" and length > 0)' "$FEATURE_FLAGS_FILE")"
jq -e '
  .schema == "qaira.feature-flags.config.v1"
  and (.flags | type == "object" and length > 0)
  and ([.flags[] | select(type != "boolean")] | length == 0)
' "$FEATURE_FLAGS_FILE" >/dev/null || {
  echo "ERROR: $FEATURE_FLAGS_FILE must use qaira.feature-flags.config.v1 and contain only boolean flags" >&2
  exit 1
}

cd "$ROOT_DIR"
EXPECTED_KEYS="$(node --input-type=module -e "import { DEFAULT_FEATURE_FLAGS } from './src/qairaAccess.js'; console.log(JSON.stringify(Object.keys(DEFAULT_FEATURE_FLAGS).sort()))")"
CONFIG_KEYS="$(jq -c '.flags | keys | sort' "$FEATURE_FLAGS_FILE")"
if [[ "$CONFIG_KEYS" != "$EXPECTED_KEYS" ]]; then
  echo "ERROR: External feature keys do not match the runtime feature catalog. Run npm run verify for details." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
AUTH_CONFIG="$TMP_DIR/curl-auth.conf"
PROJECT_FILE="$TMP_DIR/projects.txt"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$JIRA_AUTH_MODE" == "basic" ]]; then
  printf 'user = "%s:%s"\n' "$JIRA_EMAIL" "$JIRA_API_TOKEN" > "$AUTH_CONFIG"
else
  printf 'header = "Authorization: Bearer %s"\n' "$JIRA_API_TOKEN" > "$AUTH_CONFIG"
fi
chmod 600 "$AUTH_CONFIG"

api() {
  local method="$1" path="$2" body="${3:-}" output="$TMP_DIR/response.json" status attempt
  for attempt in $(seq 1 "$API_RETRIES"); do
    if [[ -n "$body" ]]; then
      status="$(curl --silent --show-error --config "$AUTH_CONFIG" -X "$method" -H 'Accept: application/json' -H 'Content-Type: application/json' --data "$body" -o "$output" -w '%{http_code}' "${JIRA_BASE_URL%/}${path}" || true)"
    else
      status="$(curl --silent --show-error --config "$AUTH_CONFIG" -X "$method" -H 'Accept: application/json' -o "$output" -w '%{http_code}' "${JIRA_BASE_URL%/}${path}" || true)"
    fi
    if [[ "$status" =~ ^2 ]]; then
      jq -c . "$output" 2>/dev/null || printf '{}\n'
      return 0
    fi
    if [[ "$status" != "429" && ! "$status" =~ ^5 && "$status" != "000" ]]; then
      break
    fi
    sleep "$attempt"
  done
  echo "ERROR: $method $path failed with HTTP ${status:-000}: $(tr '\n' ' ' < "$output" | cut -c1-600)" >&2
  return 1
}

api_optional() {
  local path="$1" output="$TMP_DIR/optional.json" status body
  status="$(curl --silent --show-error --config "$AUTH_CONFIG" -X GET -H 'Accept: application/json' -o "$output" -w '%{http_code}' "${JIRA_BASE_URL%/}${path}" || true)"
  body="$(jq -c . "$output" 2>/dev/null || printf '{}')"
  jq -cn --arg status "$status" --argjson body "$body" '{status:($status|tonumber? // 0),body:$body}'
}

if [[ "$PROJECT_KEYS" == "ALL" ]]; then
  if [[ "$DRY_RUN" == "false" && "$CONFIRM_ALL_PROJECTS" != "true" ]]; then
    echo "ERROR: Set CONFIRM_ALL_PROJECTS=true to update every visible Jira project" >&2
    exit 1
  fi
  start_at=0
  : > "$PROJECT_FILE"
  while true; do
    response="$(api GET "/rest/api/3/project/search?startAt=$start_at&maxResults=50&orderBy=key")"
    echo "$response" | jq -r '.values[]?.key' >> "$PROJECT_FILE"
    is_last="$(echo "$response" | jq -r '.isLast // true')"
    [[ "$is_last" == "true" ]] && break
    start_at=$((start_at + 50))
  done
else
  printf '%s\n' "$PROJECT_KEYS" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk 'NF' | sort -u > "$PROJECT_FILE"
fi

[[ -s "$PROJECT_FILE" ]] || { echo "ERROR: No Jira projects matched PROJECT_KEYS=$PROJECT_KEYS" >&2; exit 1; }

flags="$(jq -c '.flags' "$FEATURE_FLAGS_FILE")"
updated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
while IFS= read -r project_key; do
  encoded_project="$(jq -rn --arg value "$project_key" '$value|@uri')"
  encoded_property="$(jq -rn --arg value "$PROPERTY_KEY" '$value|@uri')"
  existing_response="$(api_optional "/rest/api/3/project/$encoded_project/properties/$encoded_property")"
  status="$(echo "$existing_response" | jq -r '.status')"
  if [[ "$status" != "200" && "$status" != "404" ]]; then
    echo "ERROR: Cannot inspect $project_key/$PROPERTY_KEY (HTTP $status)" >&2
    exit 1
  fi
  current="$(echo "$existing_response" | jq -c 'if .status == 200 then (.body.value // {}) else {} end')"
  payload="$(jq -cn --argjson current "$current" --argjson flags "$flags" --arg schema "$PROPERTY_KEY" --arg updatedAt "$updated_at" '
    $current + {
      schema:$schema,
      version:($current.version // "1.0.0"),
      revision:(($current.revision // 0) + 1),
      flags:$flags,
      updatedAt:$updatedAt,
      updatedBy:"external-feature-flag-setup"
    }
  ')"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: would apply $(echo "$flags" | jq 'length') flags to $project_key/$PROPERTY_KEY"
  else
    api PUT "/rest/api/3/project/$encoded_project/properties/$encoded_property" "$payload" >/dev/null
    echo "Applied $(echo "$flags" | jq 'length') flags to $project_key/$PROPERTY_KEY"
  fi
done < "$PROJECT_FILE"

echo "Feature flag setup complete (dry_run=$DRY_RUN, projects=$(wc -l < "$PROJECT_FILE" | tr -d ' '))."
