#!/usr/bin/env bash
# Qaira - Enterprise Jira Cloud setup
# Creates/reuses and reconciles Qaira issue types, fields, links, contexts, screens and project registry.
# Storage policy: Jira-only. No external DB. No Forge DB.
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_PATH="${SCHEMA_PATH:-$ROOT_DIR/schema/qaira-schema.json}"
SQL_SCHEMA_PATH="${SQL_SCHEMA_PATH:-$ROOT_DIR/schema.sql}"
PROPERTY_MODEL_PATH="${PROPERTY_MODEL_PATH:-$ROOT_DIR/schema/qaira-property-model.json}"
PROJECT_MAP_PATH="${PROJECT_MAP_PATH:-$ROOT_DIR/admin/qaira-project-map.json}"
REGISTRY_KEY="${REGISTRY_KEY:-qaira.registry.v1}"
STATE_DIR="${STATE_DIR:-$ROOT_DIR/.qaira-setup-state}"
RUN_ID="${RUN_ID:-$(date -u '+%Y%m%dT%H%M%SZ')}"
RUN_DIR="$STATE_DIR/runs/$RUN_ID"
TRACE_FILE="$RUN_DIR/api-trace.jsonl"
CREATED_FILE="$RUN_DIR/created-resources.jsonl"
SKIPPED_FILE="$RUN_DIR/skipped-resources.jsonl"
FAILURE_FILE="$RUN_DIR/failure-summary.md"
TMP_DIR="$(mktemp -d)"

: "${JIRA_BASE_URL:?Set JIRA_BASE_URL, e.g. https://your-domain.atlassian.net}"
: "${JIRA_EMAIL:?Set JIRA_EMAIL to the Jira admin email}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN to a Jira admin API token. Do not leave it blank.}"

PROJECT_KEYS="${PROJECT_KEYS:-ALL}"
DRY_RUN="${DRY_RUN:-true}"
CONFIGURE_SCREENS="${CONFIGURE_SCREENS:-true}"
CONFIGURE_FIELD_CONTEXTS="${CONFIGURE_FIELD_CONTEXTS:-true}"
ASSIGN_TO_COMPANY_MANAGED_PROJECTS="${ASSIGN_TO_COMPANY_MANAGED_PROJECTS:-true}"
STRICT_FIELD_CONTEXTS="${STRICT_FIELD_CONTEXTS:-false}"
ENABLE_REQUIREMENT_ROLLUP_FIELDS="${ENABLE_REQUIREMENT_ROLLUP_FIELDS:-true}"
ENABLE_DEFECT_ROLLUP_FIELDS="${ENABLE_DEFECT_ROLLUP_FIELDS:-false}"
ENABLE_SMOKE_VALIDATION="${ENABLE_SMOKE_VALIDATION:-false}"
FAIL_ON_MISSING_NATIVE_TYPES="${FAIL_ON_MISSING_NATIVE_TYPES:-false}"
CONTINUE_ON_CONTEXT_ERROR="${CONTINUE_ON_CONTEXT_ERROR:-true}"
CONTINUE_ON_SCREEN_FIELD_ERROR="${CONTINUE_ON_SCREEN_FIELD_ERROR:-false}"
VALIDATE_CREATE_METADATA="${VALIDATE_CREATE_METADATA:-true}"
CREATE_METADATA_POLICY="${CREATE_METADATA_POLICY:-warn}" # warn | fail
REUSE_LEGACY_QATM="${REUSE_LEGACY_QATM:-true}"
RENAME_LEGACY_QATM_TO_QAIRA="${RENAME_LEGACY_QATM_TO_QAIRA:-true}"
MAX_PROJECTS="${MAX_PROJECTS:-1000}"
API_RETRIES="${API_RETRIES:-5}"
API_RETRY_BASE_SECONDS="${API_RETRY_BASE_SECONDS:-2}"
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS:-10}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-120}"
REGISTRY_MAX_BYTES="${REGISTRY_MAX_BYTES:-32768}"
CONFIRM_ALL_PROJECTS="${CONFIRM_ALL_PROJECTS:-false}"
JIRA_AUTH_MODE="${JIRA_AUTH_MODE:-basic}" # basic | bearer

case "$JIRA_AUTH_MODE" in
  basic|bearer) ;;
  *) echo "ERROR: Unsupported JIRA_AUTH_MODE=$JIRA_AUTH_MODE. Use basic or bearer." >&2; exit 1 ;;
esac

case "$CREATE_METADATA_POLICY" in
  warn|fail) ;;
  *) echo "ERROR: Unsupported CREATE_METADATA_POLICY=$CREATE_METADATA_POLICY. Use warn or fail." >&2; exit 1 ;;
esac

mkdir -p "$RUN_DIR"
chmod 700 "$STATE_DIR" "$STATE_DIR/runs" "$RUN_DIR"
: > "$TRACE_FILE"
: > "$CREATED_FILE"
: > "$SKIPPED_FILE"
trap 'rm -rf "$TMP_DIR"' EXIT
trap 'on_error $LINENO $?' ERR

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
warn() { printf '[%s] WARN: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
fatal() {
  printf '[%s] ERROR: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  if declare -F write_failure_summary >/dev/null 2>&1; then write_failure_summary "fatal" "$*"; fi
  exit 1
}
require_bin() { command -v "$1" >/dev/null 2>&1 || fatal "Required binary not found: $1"; }
require_bin curl
require_bin jq
require_bin awk
require_bin diff
require_bin sort
require_bin uniq
[[ -f "$SCHEMA_PATH" ]] || fatal "Schema file not found: $SCHEMA_PATH"
[[ -f "$SQL_SCHEMA_PATH" ]] || fatal "SQL reference schema file not found: $SQL_SCHEMA_PATH"
[[ -f "$PROPERTY_MODEL_PATH" ]] || fatal "Property model file not found: $PROPERTY_MODEL_PATH"
[[ -f "$PROJECT_MAP_PATH" ]] || fatal "Project map file not found: $PROJECT_MAP_PATH"

CURL_AUTH_CONFIG="$TMP_DIR/curl-auth.conf"
CURL_COMMON=(--silent --show-error --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" --max-time "$CURL_MAX_TIME_SECONDS" --config "$CURL_AUTH_CONFIG")

configure_curl_auth() {
  if [[ "$JIRA_EMAIL" == *$'\n'* || "$JIRA_EMAIL" == *$'\r'* || "$JIRA_EMAIL" == *'"'* || "$JIRA_EMAIL" == *\\*
    || "$JIRA_API_TOKEN" == *$'\n'* || "$JIRA_API_TOKEN" == *$'\r'* || "$JIRA_API_TOKEN" == *'"'* || "$JIRA_API_TOKEN" == *\\* ]]; then
    fatal "Jira credentials contain characters that cannot be safely represented in the temporary curl config."
  fi
  case "$JIRA_AUTH_MODE" in
    basic) printf 'user = "%s:%s"\n' "$JIRA_EMAIL" "$JIRA_API_TOKEN" > "$CURL_AUTH_CONFIG" ;;
    bearer) printf 'header = "Authorization: Bearer %s"\n' "$JIRA_API_TOKEN" > "$CURL_AUTH_CONFIG" ;;
  esac
  chmod 600 "$CURL_AUTH_CONFIG"
}

configure_curl_auth

urlenc() { jq -rn --arg v "$1" '$v|@uri'; }
json_string_or_json() { jq -Rs 'try fromjson catch .' < "$1"; }
legacy_name() { printf '%s' "$1" | sed 's/Qaira/QATM/g'; }

on_error() {
  local line="$1" status="$2"
  write_failure_summary "trap" "Script failed at line $line with exit code $status"
  echo "" >&2
  echo "Qaira setup failed at line $line. Failure trace: $FAILURE_FILE" >&2
  echo "API trace: $TRACE_FILE" >&2
  echo "Created resources log: $CREATED_FILE" >&2
  echo "Recovery: fix the reported cause and rerun the same command. The setup is idempotent by resource names and project registry." >&2
}

write_failure_summary() {
  local kind="$1" message="$2"
  {
    echo "# Qaira setup failure"
    echo
    echo "- Run ID: $RUN_ID"
    echo "- Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "- Kind: $kind"
    echo "- Message: $message"
    echo "- Jira base URL: ${JIRA_BASE_URL%/}"
    echo "- Project keys: $PROJECT_KEYS"
    echo "- Dry run: $DRY_RUN"
    echo
    echo "## Recovery"
    echo
    echo "1. Inspect api-trace.jsonl and the last Jira error above the failure."
    echo "2. Fix permissions, project map, or project scheme issue."
    echo "3. Rerun the same setup command. Existing Qaira resources will be reused."
    echo "4. For legacy partial QATM runs, keep REUSE_LEGACY_QATM=true and RENAME_LEGACY_QATM_TO_QAIRA=true."
    echo
    echo "## Created resources before failure"
    echo
    if [[ -s "$CREATED_FILE" ]]; then cat "$CREATED_FILE"; else echo "None recorded."; fi
    echo
    echo "## Skipped resources"
    echo
    if [[ -s "$SKIPPED_FILE" ]]; then cat "$SKIPPED_FILE"; else echo "None recorded."; fi
  } > "$FAILURE_FILE" || true
}

record_created() {
  local type="$1" key="$2" id="$3" name="${4:-}"
  jq -cn --arg at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg type "$type" --arg key "$key" --arg id "$id" --arg name "$name" '{at:$at,type:$type,key:$key,id:$id,name:$name}' >> "$CREATED_FILE"
}
record_skipped() {
  local type="$1" key="$2" reason="$3"
  jq -cn --arg at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg type "$type" --arg key "$key" --arg reason "$reason" '{at:$at,type:$type,key:$key,reason:$reason}' >> "$SKIPPED_FILE"
}

trace_api() {
  local method="$1" path="$2" status="$3" attempt="$4" req_file="$5" res_file="$6"
  local req res
  if [[ -n "$req_file" && -f "$req_file" ]]; then req=$(jq -Rs . < "$req_file"); else req='null'; fi
  if [[ -f "$res_file" ]]; then res=$(jq -Rs . < "$res_file"); else res='null'; fi
  jq -cn --arg at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg method "$method" --arg path "$path" --arg status "$status" --arg attempt "$attempt" --argjson request "$req" --argjson response "$res" '{at:$at,method:$method,path:$path,status:$status,attempt:($attempt|tonumber),request:$request,response:$response}' >> "$TRACE_FILE"
}

api() {
  local method="$1" path="$2" body="${3:-}"
  local url="${JIRA_BASE_URL%/}${path}"
  local out="$TMP_DIR/api-response.json" req="$TMP_DIR/api-request.json" status attempt sleep_s
  if [[ -n "$body" ]]; then printf '%s' "$body" > "$req"; else : > "$req"; fi
  for attempt in $(seq 1 "$API_RETRIES"); do
    if [[ -n "$body" ]]; then
      status=$(curl "${CURL_COMMON[@]}" -X "$method" -H 'Accept: application/json' -H 'Content-Type: application/json' -o "$out" -w '%{http_code}' "$url" --data "$body") || status="000"
    else
      status=$(curl "${CURL_COMMON[@]}" -X "$method" -H 'Accept: application/json' -o "$out" -w '%{http_code}' "$url") || status="000"
    fi
    trace_api "$method" "$path" "$status" "$attempt" "$req" "$out"
    if [[ "$status" =~ ^2 ]]; then cat "$out"; return 0; fi
    if [[ "$status" == "429" || "$status" =~ ^5 || "$status" == "000" ]]; then
      sleep_s=$((API_RETRY_BASE_SECONDS * attempt))
      warn "Retryable Jira API response: $method $path -> HTTP $status. Retry $attempt/$API_RETRIES after ${sleep_s}s."
      sleep "$sleep_s"
      continue
    fi
    echo "" >&2
    echo "Jira API failed: $method $path -> HTTP $status" >&2
    cat "$out" >&2 || true
    echo "" >&2
    return 1
  done
  echo "" >&2
  echo "Jira API failed after retries: $method $path -> HTTP $status" >&2
  cat "$out" >&2 || true
  echo "" >&2
  return 1
}

api_no_fail() {
  local method="$1" path="$2" body="${3:-}"
  local url="${JIRA_BASE_URL%/}${path}"
  local out="$TMP_DIR/api-nofail-response.json" req="$TMP_DIR/api-nofail-request.json" status attempt sleep_s
  if [[ -n "$body" ]]; then printf '%s' "$body" > "$req"; else : > "$req"; fi
  for attempt in $(seq 1 "$API_RETRIES"); do
    if [[ -n "$body" ]]; then
      status=$(curl "${CURL_COMMON[@]}" -X "$method" -H 'Accept: application/json' -H 'Content-Type: application/json' -o "$out" -w '%{http_code}' "$url" --data "$body") || status="000"
    else
      status=$(curl "${CURL_COMMON[@]}" -X "$method" -H 'Accept: application/json' -o "$out" -w '%{http_code}' "$url") || status="000"
    fi
    trace_api "$method" "$path" "$status" "$attempt" "$req" "$out"
    if [[ "$status" =~ ^2 ]]; then break; fi
    if [[ "$status" == "429" || "$status" =~ ^5 || "$status" == "000" ]]; then
      sleep_s=$((API_RETRY_BASE_SECONDS * attempt))
      sleep "$sleep_s"
      continue
    fi
    break
  done
  printf '{"status":%s,"body":%s}\n' "${status:-0}" "$(json_string_or_json "$out")"
}

preflight_auth() {
  log "Validating Jira authentication and site access"
  if [[ -z "${JIRA_API_TOKEN:-}" || ${#JIRA_API_TOKEN} -lt 10 ]]; then
    fatal "JIRA_API_TOKEN is empty or too short. Use an Atlassian account Jira API token from id.atlassian.com, not an Organization API key from admin.atlassian.com/o/<orgId>/api-keys."
  fi
  local auth_resp auth_status display account_id perm_resp perm_status admin_have
  auth_resp=$(api_no_fail GET "/rest/api/3/myself")
  auth_status=$(echo "$auth_resp" | jq -r '.status // 0')
  if ! [[ "$auth_status" =~ ^2 ]]; then
    echo "Authentication preflight failed: GET /rest/api/3/myself -> HTTP $auth_status" >&2
    echo "$auth_resp" | jq -r '.body | tostring' >&2 || true
    fatal "Authentication failed. Use Jira Cloud Basic Auth with JIRA_EMAIL + Atlassian account API token, or correct scoped token gateway URL."
  fi
  display=$(echo "$auth_resp" | jq -r '.body.displayName // .body.emailAddress // "unknown-user"')
  account_id=$(echo "$auth_resp" | jq -r '.body.accountId // "unknown-account"')
  log "Authenticated as: $display ($account_id)"
  perm_resp=$(api_no_fail GET "/rest/api/3/mypermissions?permissions=ADMINISTER")
  perm_status=$(echo "$perm_resp" | jq -r '.status // 0')
  if [[ "$perm_status" =~ ^2 ]]; then
    admin_have=$(echo "$perm_resp" | jq -r '.body.permissions.ADMINISTER.havePermission // false')
    [[ "$admin_have" == "true" ]] || warn "Authenticated user does not appear to have global Administer Jira permission; configuration writes may fail."
  else
    warn "Could not check Administer Jira permission. Continuing."
  fi
}

paginate_project_search() {
  local start=0 max=100 response is_last total count fallback_resp fallback_status
  : > "$TMP_DIR/projects.ndjson"
  while :; do
    response=$(api GET "/rest/api/3/project/search?startAt=$start&maxResults=$max&orderBy=key")
    if ! echo "$response" | jq -e 'has("values") and (.values|type=="array")' >/dev/null; then
      fatal "Jira project search response did not contain values[]."
    fi
    echo "$response" | jq -c '.values[]?' >> "$TMP_DIR/projects.ndjson"
    is_last=$(echo "$response" | jq -r '.isLast // false')
    total=$(echo "$response" | jq -r '.total // 0')
    start=$((start + max))
    [[ "$is_last" == "true" || "$start" -ge "$total" || "$start" -ge "$MAX_PROJECTS" ]] && break
  done
  jq -s '.' "$TMP_DIR/projects.ndjson" > "$TMP_DIR/all-projects.json"
  count=$(jq 'length' "$TMP_DIR/all-projects.json")
  if [[ "$count" -eq 0 ]]; then
    fallback_resp=$(api_no_fail GET "/rest/api/3/project")
    fallback_status=$(echo "$fallback_resp" | jq -r '.status // 0')
    if [[ "$fallback_status" =~ ^2 ]] && echo "$fallback_resp" | jq -e '.body | type == "array"' >/dev/null; then
      echo "$fallback_resp" | jq '.body' > "$TMP_DIR/all-projects.json"
    fi
  fi
}

print_project_diagnostics() {
  local requested="$1" visible_count
  visible_count=$(jq 'length' "$TMP_DIR/all-projects.json" 2>/dev/null || echo 0)
  echo "" >&2
  echo "Project selection failed. Requested PROJECT_KEYS=$requested" >&2
  echo "Visible projects returned by Jira REST API: $visible_count" >&2
  if [[ "$visible_count" -gt 0 ]]; then
    jq -r '.[] | "  - \(.key) | \(.name) | style=\(.style // "unknown") | simplified=\(.simplified // false)"' "$TMP_DIR/all-projects.json" | head -100 >&2
  else
    echo "Jira returned zero visible projects. This is usually token/user/project-permission related, not orgId." >&2
  fi
}

select_projects() {
  if [[ "$PROJECT_KEYS" == "ALL" ]]; then
    cp "$TMP_DIR/all-projects.json" "$TMP_DIR/selected-projects.json"
  else
    local keys_upper_json names_lower_json
    keys_upper_json=$(printf '%s' "$PROJECT_KEYS" | tr ',' '\n' | jq -R 'gsub("^\\s+|\\s+$";"") | select(length>0) | ascii_upcase' | jq -s '.')
    names_lower_json=$(printf '%s' "$PROJECT_KEYS" | tr ',' '\n' | jq -R 'gsub("^\\s+|\\s+$";"") | select(length>0) | ascii_downcase' | jq -s '.')
    jq --argjson keys "$keys_upper_json" --argjson names "$names_lower_json" '[.[] | select(((.key // "") | ascii_upcase) as $k | ((.name // "") | ascii_downcase) as $n | (($keys | index($k)) or ($names | index($n))))]' "$TMP_DIR/all-projects.json" > "$TMP_DIR/selected-projects.json"
  fi
  local count
  count=$(jq 'length' "$TMP_DIR/selected-projects.json")
  if [[ "$count" -le 0 ]]; then
    print_project_diagnostics "$PROJECT_KEYS"
    fatal "No projects selected. PROJECT_KEYS=$PROJECT_KEYS"
  fi
}

validate_property_model() {
  log "Validating SQL-to-Jira property model: $PROPERTY_MODEL_PATH"
  jq -e '
    . as $root
    | .schema == "qaira.propertyModel.v1"
    and (.version | type == "string" and length > 0)
    and (.sourceSchema == "schema.sql")
    and (.tables | type == "array" and length > 0)
    and (.projectProperties | type == "array" and length > 0)
    and ([.tables[].storage] - ["issue", "project-property", "issue-property", "link", "attachment", "native", "unsupported"] | length == 0)
    and ([.tables[] | select((.sourceOccurrences | type) != "number" or .sourceOccurrences < 1)] | length == 0)
    and (([.tables[].table] | length) == ([.tables[].table] | unique | length))
    and (([.projectProperties[].key] | length) == ([.projectProperties[].key] | unique | length))
    and ([.projectProperties[].key | select(utf8bytelength > $root.limits.propertyKeyBytes)] | length == 0)
    and (([.tables[] | select(.storage == "project-property") | .canonicalKey] - [.projectProperties[].key]) | length == 0)
  ' "$PROPERTY_MODEL_PATH" >/dev/null || fatal "Property model structure, storage kinds, keys, or project-property references are invalid."

  awk '
    toupper($1) == "CREATE" && toupper($2) == "TABLE" {
      column = (toupper($3) == "IF" ? 6 : 3)
      name = $column
      sub(/\(.*/, "", name)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      print name
    }
  ' "$SQL_SCHEMA_PATH" | LC_ALL=C sort | uniq -c | awk '{print $2 "\t" $1}' > "$TMP_DIR/sql-table-occurrences.tsv"
  jq -r '.tables[] | [.table, (.sourceOccurrences | tostring)] | @tsv' "$PROPERTY_MODEL_PATH" | LC_ALL=C sort > "$TMP_DIR/model-table-occurrences.tsv"
  if ! diff -u "$TMP_DIR/sql-table-occurrences.tsv" "$TMP_DIR/model-table-occurrences.tsv" > "$RUN_DIR/property-model-coverage.diff"; then
    cat "$RUN_DIR/property-model-coverage.diff" >&2
    fatal "Property model does not cover every CREATE TABLE occurrence in schema.sql exactly."
  fi
  rm -f "$RUN_DIR/property-model-coverage.diff"
  log "Property model validated: $(jq '.tables | length' "$PROPERTY_MODEL_PATH") unique SQL tables, $(jq '[.tables[].sourceOccurrences] | add' "$PROPERTY_MODEL_PATH") CREATE TABLE occurrences"
}

schema_summary() {
  jq -r '"Issue types: \(.issueTypes|length)","Fields: \(.fields|length)","Issue link types: \(.linkTypes|length)","Agents: \(.agents|length)","Reports: \(.reports|length)"' "$SCHEMA_PATH"
}

project_config_json() {
  local pkey="$1"
  jq -c --arg p "$pkey" '.defaults as $d | ($d + (.projects[$p] // {}))' "$PROJECT_MAP_PATH"
}

project_issue_types() {
  local pkey="$1" pkey_enc resp status fallback fallback_status
  pkey_enc=$(urlenc "$pkey")
  resp=$(api_no_fail GET "/rest/api/3/issue/createmeta/${pkey_enc}/issuetypes")
  status=$(echo "$resp" | jq -r '.status // 0')
  if [[ "$status" =~ ^2 ]]; then
    if echo "$resp" | jq -e '.body.values | type == "array"' >/dev/null; then echo "$resp" | jq '.body.values'; return 0; fi
    if echo "$resp" | jq -e '.body.issueTypes | type == "array"' >/dev/null; then echo "$resp" | jq '.body.issueTypes'; return 0; fi
  fi
  fallback=$(api_no_fail GET "/rest/api/3/project/${pkey_enc}?expand=issueTypes")
  fallback_status=$(echo "$fallback" | jq -r '.status // 0')
  if [[ "$fallback_status" =~ ^2 ]] && echo "$fallback" | jq -e '.body.issueTypes | type == "array"' >/dev/null; then
    echo "$fallback" | jq '.body.issueTypes'
    return 0
  fi
  echo '[]'
}

resolve_project_native_types() {
  log "Resolving native Jira requirement/defect issue types from $PROJECT_MAP_PATH"
  : > "$TMP_DIR/project-native-types.ndjson"
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    local pkey pid cfg req_names defect_names issue_types req_ids defect_ids release_source missing_req missing_def
    pkey=$(echo "$p" | jq -r '.key')
    pid=$(echo "$p" | jq -r '.id')
    cfg=$(project_config_json "$pkey")
    req_names=$(echo "$cfg" | jq -c '.requirementIssueTypeNames // ["Story"]')
    defect_names=$(echo "$cfg" | jq -c '.defectIssueTypeNames // ["Bug"]')
    release_source=$(echo "$cfg" | jq -r '.releaseSource // "fixVersions"')
    issue_types=$(project_issue_types "$pkey")
    echo "$issue_types" > "$RUN_DIR/${pkey}-available-issue-types.json"
    req_ids=$(echo "$issue_types" | jq --argjson names "$req_names" '[.[] | select(.subtask != true) | select(.name as $n | any($names[]; ascii_downcase == ($n|ascii_downcase))) | {id:(.id|tostring), name:.name}]')
    defect_ids=$(echo "$issue_types" | jq --argjson names "$defect_names" '[.[] | select(.subtask != true) | select(.name as $n | any($names[]; ascii_downcase == ($n|ascii_downcase))) | {id:(.id|tostring), name:.name}]')
    missing_req=$(jq -n --argjson want "$req_names" --argjson got "$req_ids" '$want | map(select(. as $w | (($got | map(.name|ascii_downcase)) | index($w|ascii_downcase) | not)))')
    missing_def=$(jq -n --argjson want "$defect_names" --argjson got "$defect_ids" '$want | map(select(. as $w | (($got | map(.name|ascii_downcase)) | index($w|ascii_downcase) | not)))')
    if [[ "$(echo "$req_ids" | jq 'length')" -eq 0 ]]; then
      warn "No requirement issue types resolved for $pkey from names $(echo "$req_names" | jq -r 'join(", ")'). Requirement rollups will be skipped for this project unless configured."
      [[ "$FAIL_ON_MISSING_NATIVE_TYPES" == "true" ]] && fatal "Missing requirement issue type mapping for $pkey"
    fi
    if [[ "$(echo "$defect_ids" | jq 'length')" -eq 0 ]]; then
      warn "No defect issue types resolved for $pkey from names $(echo "$defect_names" | jq -r 'join(", ")'). Defect section will use configured JQL only if available."
      [[ "$FAIL_ON_MISSING_NATIVE_TYPES" == "true" ]] && fatal "Missing defect issue type mapping for $pkey"
    fi
    jq -cn --arg projectKey "$pkey" --arg projectId "$pid" --arg releaseSource "$release_source" --argjson cfg "$cfg" --argjson req "$req_ids" --argjson defects "$defect_ids" --argjson available "$issue_types" '{projectKey:$projectKey,projectId:$projectId,releaseSource:$releaseSource,config:$cfg,requirements:$req,defects:$defects,availableIssueTypes:$available}' >> "$TMP_DIR/project-native-types.ndjson"
    log "Resolved $pkey native mapping: requirements=$(echo "$req_ids" | jq -r '[.[].name] | join(",")') defects=$(echo "$defect_ids" | jq -r '[.[].name] | join(",")') release=$release_source"
  done
  jq -s 'map({key:.projectKey, value:.}) | from_entries' "$TMP_DIR/project-native-types.ndjson" > "$TMP_DIR/project-native-types.json"
  cp "$TMP_DIR/project-native-types.json" "$RUN_DIR/project-native-types.json"
}

create_or_get_issue_types() {
  log "Creating/reusing Qaira issue types"
  local existing name key desc id legacy resp body legacy_id update_resp update_status
  existing=$(api GET "/rest/api/3/issuetype")
  : > "$TMP_DIR/issue-types.map"
  jq -c '.issueTypes[]' "$SCHEMA_PATH" | while read -r it; do
    key=$(echo "$it" | jq -r '.key')
    name=$(echo "$it" | jq -r '.name')
    desc=$(echo "$it" | jq -r '.description')
    id=$(echo "$existing" | jq -r --arg name "$name" '.[] | select(.name==$name) | .id' | head -n1)
    if [[ -z "$id" || "$id" == "null" ]] && [[ "$REUSE_LEGACY_QATM" == "true" ]]; then
      legacy=$(legacy_name "$name")
      legacy_id=$(echo "$existing" | jq -r --arg legacy "$legacy" '.[] | select(.name==$legacy) | .id' | head -n1)
      if [[ -n "$legacy_id" && "$legacy_id" != "null" ]]; then
        id="$legacy_id"
        warn "Reusing legacy issue type $legacy -> $id for $name"
        if [[ "$RENAME_LEGACY_QATM_TO_QAIRA" == "true" ]]; then
          body=$(jq -n --arg name "$name" --arg desc "$desc" '{name:$name, description:$desc}')
          update_resp=$(api_no_fail PUT "/rest/api/3/issuetype/${id}" "$body")
          update_status=$(echo "$update_resp" | jq -r '.status // 0')
          if [[ "$update_status" =~ ^2 ]]; then log "Renamed legacy issue type $legacy -> $name"; else warn "Could not rename legacy issue type $legacy. Reusing ID $id."; fi
        fi
      fi
    fi
    if [[ -z "$id" || "$id" == "null" ]]; then
      body=$(jq -n --arg name "$name" --arg desc "$desc" '{name:$name, description:$desc, type:"standard"}')
      resp=$(api POST "/rest/api/3/issuetype" "$body")
      id=$(echo "$resp" | jq -r '.id')
      log "Created issue type: $name -> $id"
      record_created issueType "$key" "$id" "$name"
    else
      log "Reused issue type: $name -> $id"
    fi
    printf '%s=%s\n' "$key" "$id" >> "$TMP_DIR/issue-types.map"
  done
  jq -Rn 'reduce inputs as $line ({}; ($line|split("=")) as $p | .[$p[0]]=$p[1])' < "$TMP_DIR/issue-types.map" > "$TMP_DIR/issue-types.json"
}

create_or_get_link_types() {
  log "Creating/reusing Qaira issue link types"
  local existing name legacy outward inward id legacy_id body resp update_resp update_status key
  existing=$(api GET "/rest/api/3/issueLinkType")
  : > "$TMP_DIR/link-types.map"
  jq -c '.linkTypes[]' "$SCHEMA_PATH" | while read -r lt; do
    name=$(echo "$lt" | jq -r '.name')
    outward=$(echo "$lt" | jq -r '.outward')
    inward=$(echo "$lt" | jq -r '.inward')
    key=$(echo "$name" | tr '[:upper:] ' '[:lower:]_' | tr -cd 'a-z0-9_')
    id=$(echo "$existing" | jq -r --arg name "$name" '.issueLinkTypes[]? | select(.name==$name) | .id' | head -n1)
    if [[ -z "$id" || "$id" == "null" ]] && [[ "$REUSE_LEGACY_QATM" == "true" ]]; then
      legacy=$(legacy_name "$name")
      legacy_id=$(echo "$existing" | jq -r --arg legacy "$legacy" '.issueLinkTypes[]? | select(.name==$legacy) | .id' | head -n1)
      if [[ -n "$legacy_id" && "$legacy_id" != "null" ]]; then
        id="$legacy_id"
        warn "Reusing legacy link type $legacy -> $id for $name"
        if [[ "$RENAME_LEGACY_QATM_TO_QAIRA" == "true" ]]; then
          body=$(jq -n --arg name "$name" --arg outward "$outward" --arg inward "$inward" '{name:$name, outward:$outward, inward:$inward}')
          update_resp=$(api_no_fail PUT "/rest/api/3/issueLinkType/${id}" "$body")
          update_status=$(echo "$update_resp" | jq -r '.status // 0')
          if [[ "$update_status" =~ ^2 ]]; then log "Renamed legacy link type $legacy -> $name"; else warn "Could not rename legacy link type $legacy. Reusing ID $id."; fi
        fi
      fi
    fi
    if [[ -z "$id" || "$id" == "null" ]]; then
      body=$(jq -n --arg name "$name" --arg outward "$outward" --arg inward "$inward" '{name:$name, outward:$outward, inward:$inward}')
      resp=$(api POST "/rest/api/3/issueLinkType" "$body")
      id=$(echo "$resp" | jq -r '.id')
      log "Created link type: $name -> $id"
      record_created linkType "$key" "$id" "$name"
    else
      log "Reused link type: $name -> $id"
    fi
    printf '%s=%s\n' "$key" "$id" >> "$TMP_DIR/link-types.map"
  done
  jq -Rn 'reduce inputs as $line ({}; ($line|split("=")) as $p | .[$p[0]]=$p[1])' < "$TMP_DIR/link-types.map" > "$TMP_DIR/link-types.json"
}

load_existing_registry_field_hints() {
  : > "$TMP_DIR/registry-field-hints.ndjson"
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    local project_key registry_resp status
    project_key=$(echo "$p" | jq -r '.key')
    registry_resp=$(api_no_fail GET "/rest/api/3/project/${project_key}/properties/${REGISTRY_KEY}")
    status=$(echo "$registry_resp" | jq -r '.status // 0')
    if [[ "$status" =~ ^2 ]] && echo "$registry_resp" | jq -e '.body.value.fields | type == "object"' >/dev/null 2>&1; then
      echo "$registry_resp" | jq -c '.body.value.fields' >> "$TMP_DIR/registry-field-hints.ndjson"
    fi
  done
  if [[ -s "$TMP_DIR/registry-field-hints.ndjson" ]]; then
    jq -s 'reduce .[] as $item ({}; . * $item)' "$TMP_DIR/registry-field-hints.ndjson" > "$TMP_DIR/registry-field-hints.json"
  else
    echo '{}' > "$TMP_DIR/registry-field-hints.json"
  fi
}

search_fields_by_query() {
  local query="$1" start=0 max=100 response is_last total
  local query_enc
  query_enc=$(urlenc "$query")
  : > "$TMP_DIR/field-search.ndjson"
  while :; do
    response=$(api GET "/rest/api/3/field/search?query=${query_enc}&startAt=${start}&maxResults=${max}")
    echo "$response" | jq -c '.values[]?' >> "$TMP_DIR/field-search.ndjson"
    is_last=$(echo "$response" | jq -r '.isLast // false')
    total=$(echo "$response" | jq -r '.total // 0')
    start=$((start + max))
    [[ "$is_last" == "true" || "$start" -ge "$total" ]] && break
  done
  jq -s '{values:.}' "$TMP_DIR/field-search.ndjson"
}

create_or_get_fields() {
  log "Creating/reusing Qaira custom fields"
  local existing_qaira existing_legacy name legacy desc alias type searcher id legacy_id body resp update_resp update_status field_key hint_id hint_field hint_name duplicate_count
  load_existing_registry_field_hints
  existing_qaira=$(search_fields_by_query "Qaira")
  existing_legacy='{"values":[]}'
  if [[ "$REUSE_LEGACY_QATM" == "true" ]]; then
    existing_legacy=$(search_fields_by_query "QATM")
  fi
  : > "$TMP_DIR/fields.map"
  jq -c '.fields[]' "$SCHEMA_PATH" | while read -r f; do
    field_key=$(echo "$f" | jq -r '.key')
    if [[ "$ENABLE_REQUIREMENT_ROLLUP_FIELDS" != "true" ]] && echo "$f" | jq -e '.issueTypeKeys | index("requirements")' >/dev/null; then
      log "Skipped requirement rollup field because ENABLE_REQUIREMENT_ROLLUP_FIELDS=false: $(echo "$f" | jq -r '.name')"
      continue
    fi
    if [[ "$ENABLE_DEFECT_ROLLUP_FIELDS" != "true" ]] && echo "$f" | jq -e '.issueTypeKeys | index("defects")' >/dev/null; then
      log "Skipped defect rollup field because ENABLE_DEFECT_ROLLUP_FIELDS=false: $(echo "$f" | jq -r '.name')"
      continue
    fi
    name=$(echo "$f" | jq -r '.name')
    desc=$(echo "$f" | jq -r '.description // "Qaira field"')
    alias=$(echo "$f" | jq -r '.alias')
    type=$(jq -r --arg a "$alias" '.fieldTypeAliases[$a].type' "$SCHEMA_PATH")
    searcher=$(jq -r --arg a "$alias" '.fieldTypeAliases[$a].searcherKey' "$SCHEMA_PATH")
    hint_id=$(jq -r --arg k "$field_key" '.[$k] // empty' "$TMP_DIR/registry-field-hints.json")
    id=''
    hint_field=''
    hint_name=''
    if [[ -n "$hint_id" && "$hint_id" != "null" ]]; then
      if [[ "$hint_id" =~ ^customfield_[0-9]+$ ]]; then
        hint_field=$(echo "$existing_qaira" | jq -c --arg hint "$hint_id" '[.values[]? | select(.id==$hint)][0] // empty')
        id="$hint_id"
        if [[ -n "$hint_field" && "$hint_field" != "null" ]]; then
          hint_name=$(echo "$hint_field" | jq -r '.name // empty')
        fi
        if [[ "$hint_name" != "$name" ]]; then
          if [[ -n "$hint_name" ]]; then
            warn "Reusing registry field $field_key -> $id with current name '$hint_name' for '$name'"
          else
            warn "Registry field $field_key -> $id was outside the Jira Qaira name search. Reconciling it directly by ID to '$name'."
          fi
          body=$(jq -n --arg name "$name" --arg desc "$desc" '{name:$name, description:$desc}')
          update_resp=$(api_no_fail PUT "/rest/api/3/field/${id}" "$body")
          update_status=$(echo "$update_resp" | jq -r '.status // 0')
          if [[ "$update_status" =~ ^2 ]]; then
            log "Renamed registry field ${hint_name:-$id} -> $name"
          elif [[ "$update_status" == "404" && -z "$hint_name" ]]; then
            warn "Registry field hint $field_key -> $id no longer exists. Falling back to name-based reconciliation."
            id=''
          else
            warn "Could not rename registry field ${hint_name:-$id} -> $name. Reusing ID $id to avoid creating a duplicate."
          fi
        fi
      else
        warn "Ignoring invalid registry field hint $field_key -> $hint_id. Expected a Jira customfield_<number> ID."
      fi
    fi
    duplicate_count=$(echo "$existing_qaira" | jq --arg name "$name" '[.values[]? | select(.name==$name)] | length')
    if [[ "$duplicate_count" -gt 1 ]]; then
      warn "Multiple Jira fields exist with exact name '$name'. Preferring current registry ID when available."
    fi
    if [[ -z "$id" || "$id" == "null" ]]; then
      id=$(echo "$existing_qaira" | jq -r --arg name "$name" '
        ([.values[]? | select(.name==$name)] | sort_by((.id | sub("customfield_";"") | tonumber? // 999999999)) | .[0].id)
        // empty')
    fi
    if [[ -z "$id" || "$id" == "null" ]] && [[ "$REUSE_LEGACY_QATM" == "true" ]]; then
      legacy=$(legacy_name "$name")
      legacy_id=$(echo "$existing_legacy" | jq -r --arg legacy "$legacy" '.values[]? | select(.name==$legacy) | .id' | head -n1)
      if [[ -n "$legacy_id" && "$legacy_id" != "null" ]]; then
        id="$legacy_id"
        warn "Reusing legacy field $legacy -> $id for $name"
        if [[ "$RENAME_LEGACY_QATM_TO_QAIRA" == "true" ]]; then
          body=$(jq -n --arg name "$name" --arg desc "$desc" '{name:$name, description:$desc}')
          update_resp=$(api_no_fail PUT "/rest/api/3/field/${id}" "$body")
          update_status=$(echo "$update_resp" | jq -r '.status // 0')
          if [[ "$update_status" =~ ^2 ]]; then log "Renamed legacy field $legacy -> $name"; else warn "Could not rename legacy field $legacy. Reusing ID $id."; fi
        fi
      fi
    fi
    if [[ -z "$id" || "$id" == "null" ]]; then
      body=$(jq -n --arg name "$name" --arg desc "$desc" --arg type "$type" --arg searcher "$searcher" '{name:$name, description:$desc, type:$type, searcherKey:$searcher}')
      resp=$(api POST "/rest/api/3/field" "$body")
      id=$(echo "$resp" | jq -r '.id')
      log "Created field: $name -> $id"
      record_created field "$field_key" "$id" "$name"
    else
      log "Reused field: $name -> $id"
    fi
    printf '%s=%s\n' "$field_key" "$id" >> "$TMP_DIR/fields.map"
  done
  jq -Rn 'reduce inputs as $line ({}; ($line|split("=")) as $p | .[$p[0]]=$p[1])' < "$TMP_DIR/fields.map" > "$TMP_DIR/fields.json"
}

issue_type_ids_for_field_project() {
  local field_json="$1" project_key="$2"
  jq -n --arg projectKey "$project_key" --slurpfile ids "$TMP_DIR/issue-types.json" --slurpfile native "$TMP_DIR/project-native-types.json" --argjson f "$field_json" '
    ($ids[0]) as $q | ($native[0][$projectKey]) as $n |
    ($f.issueTypeKeys // [])
    | reduce .[] as $k ([];
        if $k == "requirements" then . + (($n.requirements // []) | map(.id))
        elif $k == "defects" then . + (($n.defects // []) | map(.id))
        else . + ([$q[$k]] | map(select(. != null))) end)
    | map(tostring) | unique'
}

ensure_context_and_options() {
  local project_key="$1" project_id="$2" field_key="$3" field_id="$4" field_json="$5" issue_type_ids="$6"
  local context_name contexts context_id body resp status alias options_json existing_options existing_values missing_options
  context_name="Qaira ${project_key} Context - ${field_key}"
  contexts=$(api GET "/rest/api/3/field/${field_id}/context?maxResults=100")
  context_id=$(echo "$contexts" | jq -r --arg name "$context_name" '.values[]? | select(.name==$name) | .id' | head -n1)
  if [[ -z "$context_id" || "$context_id" == "null" ]]; then
    body=$(jq -n --arg name "$context_name" --arg desc "Scoped Qaira context for $field_key in $project_key" --argjson issueTypeIds "$issue_type_ids" --argjson projectIds "[\"$project_id\"]" '{name:$name, description:$desc, issueTypeIds:$issueTypeIds, projectIds:$projectIds}')
    resp=$(api_no_fail POST "/rest/api/3/field/${field_id}/context" "$body")
    status=$(echo "$resp" | jq -r '.status // 0')
    if [[ "$status" =~ ^2 ]]; then
      context_id=$(echo "$resp" | jq -r '.body.id')
      log "Created context for $project_key/$field_key -> $context_id"
      record_created fieldContext "${project_key}:${field_key}" "$context_id" "$context_name"
    else
      local err
      err=$(echo "$resp" | jq -cr '.body')
      if [[ "$CONTINUE_ON_CONTEXT_ERROR" == "true" ]]; then
        warn "Skipping context for $project_key/$field_key after Jira HTTP $status: $err"
        record_skipped fieldContext "${project_key}:${field_key}" "HTTP $status: $err"
        return 0
      fi
      echo "$resp" | jq . >&2 || true
      fatal "Failed to create context for $project_key/$field_key"
    fi
  else
    log "Reused context for $project_key/$field_key -> $context_id"
  fi
  jq -cn --arg projectKey "$project_key" --arg fieldKey "$field_key" --arg contextId "$context_id" '{projectKey:$projectKey,fieldKey:$fieldKey,contextId:$contextId}' >> "$TMP_DIR/field-contexts.ndjson"

  alias=$(echo "$field_json" | jq -r '.alias')
  if [[ "$alias" == "select" || "$alias" == "multiSelect" ]]; then
    options_json=$(echo "$field_json" | jq -c '.options // []')
    if [[ "$(echo "$options_json" | jq 'length')" -gt 0 ]]; then
      existing_options=$(api_no_fail GET "/rest/api/3/field/${field_id}/context/${context_id}/option?maxResults=1000")
      existing_values=$(echo "$existing_options" | jq -c 'if (.status|tostring|startswith("2")) then [.body.values[]?.value] else [] end')
      missing_options=$(jq -n --argjson want "$options_json" --argjson have "$existing_values" '$want | map(select(. as $v | ($have | index($v) | not)))')
      if [[ "$(echo "$missing_options" | jq 'length')" -gt 0 ]]; then
        body=$(jq -n --argjson opts "$missing_options" '{options: ($opts | map({value:.}))}')
        resp=$(api_no_fail POST "/rest/api/3/field/${field_id}/context/${context_id}/option" "$body")
        status=$(echo "$resp" | jq -r '.status // 0')
        if [[ "$status" =~ ^2 ]]; then
          log "Added options for $project_key/$field_key: $(echo "$missing_options" | jq -r 'join(", ")')"
        else
          warn "Could not add some options for $project_key/$field_key: $(echo "$resp" | jq -cr '.body')"
          record_skipped fieldOptions "${project_key}:${field_key}" "HTTP $status"
        fi
      fi
    fi
  fi

}

create_contexts_and_options() {
  if [[ "$CONFIGURE_FIELD_CONTEXTS" != "true" ]]; then
    log "Skipping custom field context/option setup because CONFIGURE_FIELD_CONTEXTS=false"
    : > "$TMP_DIR/field-contexts.ndjson"
    echo '{}' > "$TMP_DIR/field-contexts.json"
    return
  fi
  log "Creating per-project scoped custom field contexts and select options"
  : > "$TMP_DIR/field-contexts.ndjson"
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    local project_key project_id
    project_key=$(echo "$p" | jq -r '.key')
    project_id=$(echo "$p" | jq -r '.id')
    jq -c '.fields[]' "$SCHEMA_PATH" | while read -r f; do
      local field_key field_id issue_type_ids
      field_key=$(echo "$f" | jq -r '.key')
      if [[ "$ENABLE_REQUIREMENT_ROLLUP_FIELDS" != "true" ]] && echo "$f" | jq -e '.issueTypeKeys | index("requirements")' >/dev/null; then continue; fi
      if [[ "$ENABLE_DEFECT_ROLLUP_FIELDS" != "true" ]] && echo "$f" | jq -e '.issueTypeKeys | index("defects")' >/dev/null; then continue; fi
      field_id=$(jq -r --arg k "$field_key" '.[$k] // empty' "$TMP_DIR/fields.json")
      [[ -z "$field_id" ]] && continue
      issue_type_ids=$(issue_type_ids_for_field_project "$f" "$project_key")
      if [[ "$(echo "$issue_type_ids" | jq 'length')" -eq 0 ]]; then
        warn "Skipping context for $project_key/$field_key: no matching issue type IDs. Check admin/qaira-project-map.json."
        record_skipped fieldContext "${project_key}:${field_key}" "no matching issue type IDs"
        continue
      fi
      ensure_context_and_options "$project_key" "$project_id" "$field_key" "$field_id" "$f" "$issue_type_ids"
    done
  done
  jq -s 'group_by(.projectKey) | map({key:.[0].projectKey, value:(map({key:.fieldKey, value:.contextId}) | from_entries)}) | from_entries' "$TMP_DIR/field-contexts.ndjson" > "$TMP_DIR/field-contexts.json" 2>/dev/null || echo '{}' > "$TMP_DIR/field-contexts.json"
}

add_issue_types_to_company_project_schemes() {
  [[ "$ASSIGN_TO_COMPANY_MANAGED_PROJECTS" == "true" ]] || { log "Skipping issue type scheme assignment"; return; }
  log "Adding Qaira issue types to company-managed project issue type schemes"
  local qaira_ids project_id project_key simplified scheme_resp scheme_id mappings existing_ids missing body resp status
  qaira_ids=$(jq '[.[]]' "$TMP_DIR/issue-types.json")
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    project_id=$(echo "$p" | jq -r '.id')
    project_key=$(echo "$p" | jq -r '.key')
    simplified=$(echo "$p" | jq -r '.simplified // false')
    if [[ "$simplified" == "true" ]]; then
      warn "Project $project_key is team-managed/simplified. Full scheme assignment is not supported; registry will be lightweight."
      record_skipped issueTypeScheme "$project_key" "team-managed project"
      continue
    fi
    scheme_resp=$(api_no_fail GET "/rest/api/3/issuetypescheme/project?projectId=${project_id}")
    status=$(echo "$scheme_resp" | jq -r '.status // 0')
    if ! [[ "$status" =~ ^2 ]]; then warn "Could not resolve issue type scheme for $project_key"; record_skipped issueTypeScheme "$project_key" "scheme discovery failed"; continue; fi
    scheme_id=$(echo "$scheme_resp" | jq -r '.body.values[0].issueTypeScheme.id // .body.values[0].id // empty')
    if [[ -z "$scheme_id" ]]; then warn "Could not resolve issue type scheme for project $project_key"; record_skipped issueTypeScheme "$project_key" "scheme id missing"; continue; fi
    mappings=$(api GET "/rest/api/3/issuetypescheme/mapping?issueTypeSchemeId=${scheme_id}&maxResults=300")
    existing_ids=$(echo "$mappings" | jq '[.values[]?.issueTypeId | tostring]')
    missing=$(jq -n --argjson want "$qaira_ids" --argjson have "$existing_ids" '$want | map(tostring) | map(select(. as $id | ($have | index($id) | not)))')
    if [[ "$(echo "$missing" | jq 'length')" -gt 0 ]]; then
      body=$(jq -n --argjson ids "$missing" '{issueTypeIds:$ids}')
      resp=$(api_no_fail PUT "/rest/api/3/issuetypescheme/${scheme_id}/issuetype" "$body")
      status=$(echo "$resp" | jq -r '.status // 0')
      if [[ "$status" =~ ^2 ]]; then log "Added Qaira issue types to $project_key issue type scheme $scheme_id"; else warn "Could not add Qaira issue types to $project_key issue type scheme: $(echo "$resp" | jq -cr '.body')"; record_skipped issueTypeScheme "$project_key" "add issue types failed HTTP $status"; fi
    else
      log "Qaira issue types already present in $project_key issue type scheme $scheme_id"
    fi
  done
}

create_or_get_screen() {
  local name="$1" desc="$2" q resp id body legacy legacy_id update_resp update_status
  q=$(urlenc "$name")
  resp=$(api GET "/rest/api/3/screens?query=$q&maxResults=100")
  id=$(echo "$resp" | jq -r --arg name "$name" '.values[]? | select(.name==$name) | .id' | head -n1)
  if [[ -z "$id" || "$id" == "null" ]] && [[ "$REUSE_LEGACY_QATM" == "true" ]]; then
    legacy=$(legacy_name "$name")
    q=$(urlenc "$legacy")
    resp=$(api_no_fail GET "/rest/api/3/screens?query=$q&maxResults=100")
    legacy_id=$(echo "$resp" | jq -r --arg legacy "$legacy" '.body.values[]? | select(.name==$legacy) | .id' | head -n1)
    if [[ -n "$legacy_id" && "$legacy_id" != "null" ]]; then id="$legacy_id"; warn "Reusing legacy screen $legacy -> $id for $name"; fi
  fi
  if [[ -z "$id" || "$id" == "null" ]]; then
    body=$(jq -n --arg name "$name" --arg desc "$desc" '{name:$name, description:$desc}')
    resp=$(api POST "/rest/api/3/screens" "$body")
    id=$(echo "$resp" | jq -r '.id')
    log "Created screen: $name -> $id"
    record_created screen "$name" "$id" "$name"
  else
    log "Reused screen: $name -> $id"
  fi
  echo "$id"
}

create_or_get_tab() {
  local screen_id="$1" name="$2" tabs id body resp
  tabs=$(api GET "/rest/api/3/screens/${screen_id}/tabs")
  id=$(echo "$tabs" | jq -r --arg name "$name" '.[]? | select(.name==$name) | .id' | head -n1)
  if [[ -z "$id" || "$id" == "null" ]]; then
    body=$(jq -n --arg name "$name" '{name:$name}')
    resp=$(api POST "/rest/api/3/screens/${screen_id}/tabs" "$body")
    id=$(echo "$resp" | jq -r '.id')
    log "Created tab: $name on screen $screen_id -> $id"
    record_created screenTab "$screen_id:$name" "$id" "$name"
  fi
  echo "$id"
}

add_field_to_tab() {
  local screen_id="$1" tab_id="$2" field_id="$3" label="${4:-$3}"
  local existing status body resp
  existing=$(api_no_fail GET "/rest/api/3/screens/${screen_id}/tabs/${tab_id}/fields")
  status=$(echo "$existing" | jq -r '.status // 0')
  if ! [[ "$status" =~ ^2 ]]; then
    warn "Could not inspect fields on screen $screen_id tab $tab_id for $label"
    record_skipped screenField "${screen_id}:${tab_id}:${field_id}" "field-list HTTP $status"
    return 1
  fi
  if echo "$existing" | jq -e --arg id "$field_id" '(.body // [])[]? | select(.id==$id)' >/dev/null; then
    return 0
  fi
  body=$(jq -n --arg fieldId "$field_id" '{fieldId:$fieldId}')
  resp=$(api_no_fail POST "/rest/api/3/screens/${screen_id}/tabs/${tab_id}/fields" "$body")
  status=$(echo "$resp" | jq -r '.status // 0')
  if [[ "$status" =~ ^2 ]]; then
    log "Added screen field: $label -> screen $screen_id"
    return 0
  fi
  warn "Could not add screen field $label ($field_id) to screen $screen_id: $(echo "$resp" | jq -cr '.body')"
  record_skipped screenField "${screen_id}:${tab_id}:${field_id}" "HTTP $status"
  return 1
}

create_or_get_screen_scheme() {
  local name="$1" screen_id="$2" q resp id body current current_default current_create current_edit current_view update_resp update_status
  q=$(urlenc "$name")
  resp=$(api GET "/rest/api/3/screenscheme?query=$q&maxResults=100")
  id=$(echo "$resp" | jq -r --arg name "$name" '.values[]? | select(.name==$name) | .id' | head -n1)
  body=$(jq -n --arg name "$name" --arg sid "$screen_id" '{name:$name, description:"Qaira screen scheme", screens:{default:$sid, create:$sid, edit:$sid, view:$sid}}')
  if [[ -z "$id" || "$id" == "null" ]]; then
    resp=$(api POST "/rest/api/3/screenscheme" "$body")
    id=$(echo "$resp" | jq -r '.id')
    log "Created screen scheme: $name -> $id"
    record_created screenScheme "$name" "$id" "$name"
  else
    current=$(api GET "/rest/api/3/screenscheme?id=${id}&maxResults=100")
    current_default=$(echo "$current" | jq -r --arg id "$id" '.values[]? | select((.id|tostring)==$id) | (.screens.default // empty) | tostring' | head -n1)
    current_create=$(echo "$current" | jq -r --arg id "$id" '.values[]? | select((.id|tostring)==$id) | (.screens.create // .screens.default // empty) | tostring' | head -n1)
    current_edit=$(echo "$current" | jq -r --arg id "$id" '.values[]? | select((.id|tostring)==$id) | (.screens.edit // .screens.default // empty) | tostring' | head -n1)
    current_view=$(echo "$current" | jq -r --arg id "$id" '.values[]? | select((.id|tostring)==$id) | (.screens.view // .screens.default // empty) | tostring' | head -n1)
    if [[ "$current_default" != "$screen_id" || "$current_create" != "$screen_id" || "$current_edit" != "$screen_id" || "$current_view" != "$screen_id" ]]; then
      update_resp=$(api_no_fail PUT "/rest/api/3/screenscheme/${id}" "$body")
      update_status=$(echo "$update_resp" | jq -r '.status // 0')
      if [[ "$update_status" =~ ^2 ]]; then
        log "Reconciled screen scheme operations: $name -> screen $screen_id"
      else
        fatal "Could not reconcile screen scheme $name: $(echo "$update_resp" | jq -cr '.body')"
      fi
    else
      log "Reused screen scheme: $name -> $id"
    fi
  fi
  echo "$id"
}

configure_screens() {
  [[ "$CONFIGURE_SCREENS" == "true" ]] || { log "Skipping screen/screen scheme setup"; return; }
  log "Creating/reconciling Qaira screens and screen schemes"
  : > "$TMP_DIR/screen-schemes.map"
  local system_fields=(summary description assignee priority labels components fixVersions)
  jq -c '.issueTypes[]' "$SCHEMA_PATH" | while read -r it; do
    local key name screen_name screen_id tabs_json core_tab_id screen_scheme_name screen_scheme_id field_error
    key=$(echo "$it" | jq -r '.key')
    name=$(echo "$it" | jq -r '.name')
    screen_name="$name Screen"
    screen_id=$(create_or_get_screen "$screen_name" "Screen for $name created by Qaira setup")
    tabs_json=$(echo "$it" | jq -c '.screenTabs')
    echo "$tabs_json" | jq -r '.[]' | while read -r tab_name; do create_or_get_tab "$screen_id" "$tab_name" >/dev/null; done
    core_tab_id=$(api GET "/rest/api/3/screens/${screen_id}/tabs" | jq -r '([.[] | select(.name=="Core")][0].id // .[0].id // empty)')
    [[ -n "$core_tab_id" ]] || fatal "No screen tab found for $screen_name"
    field_error=0
    for system_field in "${system_fields[@]}"; do
      if ! add_field_to_tab "$screen_id" "$core_tab_id" "$system_field" "$name / $system_field"; then field_error=1; fi
    done
    jq -c --arg key "$key" '.fields[] | select(.issueTypeKeys | index($key))' "$SCHEMA_PATH" | while read -r f; do
      local field_key field_id field_name
      field_key=$(echo "$f" | jq -r '.key')
      field_name=$(echo "$f" | jq -r '.name')
      field_id=$(jq -r --arg k "$field_key" '.[$k] // empty' "$TMP_DIR/fields.json")
      if [[ -n "$field_id" ]] && ! add_field_to_tab "$screen_id" "$core_tab_id" "$field_id" "$name / $field_name"; then
        if [[ "$CONTINUE_ON_SCREEN_FIELD_ERROR" != "true" ]]; then
          fatal "Could not add $field_name to $screen_name"
        fi
      fi
    done
    if [[ "$field_error" -eq 1 && "$CONTINUE_ON_SCREEN_FIELD_ERROR" != "true" ]]; then
      fatal "Could not add one or more system fields to $screen_name"
    fi
    screen_scheme_name="$name Screen Scheme"
    screen_scheme_id=$(create_or_get_screen_scheme "$screen_scheme_name" "$screen_id")
    printf '%s=%s\n' "$key" "$screen_scheme_id" >> "$TMP_DIR/screen-schemes.map"
  done
  jq -Rn 'reduce inputs as $line ({}; ($line|split("=")) as $p | .[$p[0]]=$p[1])' < "$TMP_DIR/screen-schemes.map" > "$TMP_DIR/screen-schemes.json"
}

reconcile_qaira_mappings_on_scheme() {
  local scheme_id="$1" qaira_mapping_json="$2" mappings existing_qaira_ids body resp status mismatches
  mappings=$(api GET "/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${scheme_id}&maxResults=100")
  existing_qaira_ids=$(echo "$mappings" | jq --argjson qaira "$qaira_mapping_json" '($qaira | map(.issueTypeId|tostring)) as $ids | [.values[]? | (.issueTypeId|tostring) | select(. != "default") | select(. as $id | ($ids | index($id)))] | unique')
  if [[ "$(echo "$existing_qaira_ids" | jq 'length')" -gt 0 ]]; then
    body=$(jq -n --argjson ids "$existing_qaira_ids" '{issueTypeIds:$ids}')
    resp=$(api_no_fail POST "/rest/api/3/issuetypescreenscheme/${scheme_id}/mapping/remove" "$body")
    status=$(echo "$resp" | jq -r '.status // 0')
    [[ "$status" =~ ^2 ]] || fatal "Could not remove stale Qaira screen mappings from scheme $scheme_id"
  fi
  body=$(jq -n --argjson qaira "$qaira_mapping_json" '{issueTypeMappings:$qaira}')
  resp=$(api_no_fail PUT "/rest/api/3/issuetypescreenscheme/${scheme_id}/mapping" "$body")
  status=$(echo "$resp" | jq -r '.status // 0')
  [[ "$status" =~ ^2 ]] || fatal "Could not append canonical Qaira mappings to scheme $scheme_id: $(echo "$resp" | jq -cr '.body')"
  mappings=$(api GET "/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${scheme_id}&maxResults=100")
  mismatches=$(jq -n --argjson expected "$qaira_mapping_json" --argjson actual "$mappings" '[
    $expected[] as $e
    | ([ $actual.values[]? | select((.issueTypeId|tostring)==($e.issueTypeId|tostring)) | (.screenSchemeId|tostring) ][0] // null) as $got
    | select($got != ($e.screenSchemeId|tostring))
    | {issueTypeId:$e.issueTypeId,expected:$e.screenSchemeId,actual:$got}
  ]')
  [[ "$(echo "$mismatches" | jq 'length')" -eq 0 ]] || fatal "Qaira screen mapping verification failed for scheme $scheme_id: $mismatches"
}

assign_issue_type_screen_schemes() {
  [[ "$CONFIGURE_SCREENS" == "true" ]] || return
  log "Assigning/reconciling Qaira issue type screen schemes for company-managed projects"
  local qaira_mapping_json project_id project_key simplified current_resp current_id mappings preserved existing_by_name new_name q id body resp status
  qaira_mapping_json=$(jq -n --slurpfile it "$TMP_DIR/issue-types.json" --slurpfile ss "$TMP_DIR/screen-schemes.json" '$it[0] as $i | $ss[0] as $s | [$i | to_entries[] | {issueTypeId:(.value|tostring), screenSchemeId:($s[.key] // empty | tostring)} | select(.screenSchemeId != "")]')
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    project_id=$(echo "$p" | jq -r '.id')
    project_key=$(echo "$p" | jq -r '.key')
    simplified=$(echo "$p" | jq -r '.simplified // false')
    [[ "$simplified" == "true" ]] && continue
    current_resp=$(api_no_fail GET "/rest/api/3/issuetypescreenscheme/project?projectId=${project_id}&maxResults=100")
    status=$(echo "$current_resp" | jq -r '.status // 0')
    if ! [[ "$status" =~ ^2 ]]; then
      fatal "No current issue type screen scheme found for $project_key"
    fi
    current_id=$(echo "$current_resp" | jq -r --arg pid "$project_id" '([.body.values[]? | select((.projectIds // []) | map(tostring) | index($pid)) | .issueTypeScreenScheme.id][0] // .body.values[0].issueTypeScreenScheme.id // empty)')
    [[ -n "$current_id" ]] || fatal "No current issue type screen scheme ID found for $project_key"
    mappings=$(api GET "/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${current_id}&maxResults=100")
    preserved=$(echo "$mappings" | jq --argjson qaira "$qaira_mapping_json" '($qaira | map(.issueTypeId|tostring)) as $ids | [.values[]? | {issueTypeId:(.issueTypeId|tostring), screenSchemeId:(.screenSchemeId|tostring)} | select(.issueTypeId as $id | ($ids | index($id) | not))]')
    new_name="Qaira ${project_key} Issue Type Screen Scheme"
    q=$(urlenc "$new_name")
    existing_by_name=$(api GET "/rest/api/3/issuetypescreenscheme?query=$q&maxResults=100")
    id=$(echo "$existing_by_name" | jq -r --arg name "$new_name" '.values[]? | select(.name==$name) | .id' | head -n1)
    if [[ -z "$id" || "$id" == "null" ]]; then
      body=$(jq -n --arg name "$new_name" --argjson preserved "$preserved" --argjson qaira "$qaira_mapping_json" '{name:$name, description:"Preserves existing mappings and maps Qaira issue types to Qaira screens", issueTypeMappings:($preserved + $qaira)}')
      resp=$(api_no_fail POST "/rest/api/3/issuetypescreenscheme" "$body")
      status=$(echo "$resp" | jq -r '.status // 0')
      [[ "$status" =~ ^2 ]] || fatal "Could not create issue type screen scheme for $project_key: $(echo "$resp" | jq -cr '.body')"
      id=$(echo "$resp" | jq -r '.body.id')
      record_created issueTypeScreenScheme "$project_key" "$id" "$new_name"
      log "Created issue type screen scheme for $project_key -> $id"
    else
      reconcile_qaira_mappings_on_scheme "$id" "$qaira_mapping_json"
      log "Reconciled issue type screen scheme for $project_key -> $id"
    fi
    body=$(jq -n --arg projectId "$project_id" --arg issueTypeScreenSchemeId "$id" '{projectId:$projectId, issueTypeScreenSchemeId:$issueTypeScreenSchemeId}')
    resp=$(api_no_fail PUT "/rest/api/3/issuetypescreenscheme/project" "$body")
    status=$(echo "$resp" | jq -r '.status // 0')
    [[ "$status" =~ ^2 ]] || fatal "Could not assign Qaira issue type screen scheme to $project_key: $(echo "$resp" | jq -cr '.body')"
    log "Assigned Qaira screen scheme to $project_key"
  done
}

property_value_bytes() {
  LC_ALL=C printf '%s' "$1" | wc -c | tr -d '[:space:]'
}

initial_project_property_value() {
  local definition="$1" project_id="$2" project_key="$3" property_key initializer model_version updated_at initial
  property_key=$(echo "$definition" | jq -r '.key')
  initializer=$(echo "$definition" | jq -r '.initializer // "static"')
  model_version=$(jq -r '.version' "$PROPERTY_MODEL_PATH")
  updated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  case "$initializer" in
    default-app-types)
      jq -cn --arg schema "$property_key" --arg version "$model_version" --arg projectId "$project_id" --arg updatedAt "$updated_at" '{schema:$schema,version:$version,items:[
        {id:($projectId + ":web"),project_id:$projectId,name:"Web",type:"web",is_unified:0,created_at:$updatedAt},
        {id:($projectId + ":api"),project_id:$projectId,name:"API",type:"api",is_unified:0,created_at:$updatedAt},
        {id:($projectId + ":mobile"),project_id:$projectId,name:"Mobile",type:"android",is_unified:0,created_at:$updatedAt},
        {id:($projectId + ":unified"),project_id:$projectId,name:"Unified",type:"unified",is_unified:1,created_at:$updatedAt}
      ],updatedAt:$updatedAt}'
      ;;
    default-integrations)
      jq -cn --arg schema "$property_key" --arg version "$model_version" --arg projectKey "$project_key" --arg updatedAt "$updated_at" '{schema:$schema,version:$version,items:[
        {id:"jira-native",type:"jira",name:"Current Jira Cloud site",base_url:null,api_key:null,model:null,project_key:$projectKey,username:null,config:{managed_by:"Forge"},is_active:true,created_at:$updatedAt,updated_at:$updatedAt},
        {id:"qaira-ai",type:"llm",name:"Qaira Assist (deterministic) + Rovo entry point",base_url:null,api_key:null,model:null,project_key:$projectKey,username:null,config:{data_residency:"Atlassian platform",generation_mode:"deterministic",direct_model_invocation:false,rovo_agent_available:true},is_active:true,created_at:$updatedAt,updated_at:$updatedAt}
      ],updatedAt:$updatedAt}'
      ;;
    static)
      initial=$(echo "$definition" | jq -c '.initialValue // {}')
      jq -cn --arg schema "$property_key" --arg version "$model_version" --arg updatedAt "$updated_at" --argjson initial "$initial" '{schema:$schema,version:$version} + $initial + {updatedAt:$updatedAt}'
      ;;
    *)
      fatal "Unsupported project-property initializer '$initializer' for $property_key"
      ;;
  esac
}

initialize_project_property_envelopes() {
  log "Initializing missing Qaira project-property envelopes without overwriting existing values"
  : > "$TMP_DIR/project-properties.ndjson"
  local max_bytes
  max_bytes=$(jq -r '.limits.propertyValueBytes' "$PROPERTY_MODEL_PATH")
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    local project_id project_key
    project_id=$(echo "$p" | jq -r '.id | tostring')
    project_key=$(echo "$p" | jq -r '.key')
    jq -c '.projectProperties[]' "$PROPERTY_MODEL_PATH" | while read -r definition; do
      local property_name property_key existing status value bytes
      property_name=$(echo "$definition" | jq -r '.name')
      property_key=$(echo "$definition" | jq -r '.key')
      existing=$(api_no_fail GET "/rest/api/3/project/${project_key}/properties/${property_key}")
      status=$(echo "$existing" | jq -r '.status // 0')
      if [[ "$status" =~ ^2 ]]; then
        if ! echo "$existing" | jq -e '.body.value | type == "object"' >/dev/null 2>&1; then
          warn "Existing project property $project_key/$property_key is not an object; preserving it for non-destructive recovery."
        fi
        jq -cn --arg projectKey "$project_key" --arg name "$property_name" --arg key "$property_key" --arg action "preserved" '{projectKey:$projectKey,name:$name,key:$key,action:$action}' >> "$TMP_DIR/project-properties.ndjson"
        continue
      fi
      if [[ "$status" != "404" ]]; then
        fatal "Could not inspect project property $project_key/$property_key (HTTP $status); refusing to overwrite unknown state."
      fi
      value=$(initial_project_property_value "$definition" "$project_id" "$project_key")
      bytes=$(property_value_bytes "$value")
      if (( bytes > max_bytes )); then
        fatal "Initial project property $project_key/$property_key is ${bytes} bytes, above the ${max_bytes}-byte Jira limit."
      fi
      api PUT "/rest/api/3/project/${project_key}/properties/${property_key}" "$value" >/dev/null
      record_created projectProperty "${project_key}:${property_name}" "$property_key" "$property_name"
      jq -cn --arg projectKey "$project_key" --arg name "$property_name" --arg key "$property_key" --arg action "created" --argjson bytes "$bytes" '{projectKey:$projectKey,name:$name,key:$key,action:$action,bytes:$bytes}' >> "$TMP_DIR/project-properties.ndjson"
      log "Initialized project property $project_key/$property_key (${bytes} bytes)"
    done
  done
  jq -s '.' "$TMP_DIR/project-properties.ndjson" > "$RUN_DIR/project-properties.json"
}

write_project_registries() {
  log "Writing per-project Qaira registry properties"
  local issue_types_json fields_json links_json screens_json contexts_json native_json project_id project_key simplified mode registry cfg native property_model registry_bytes model_limit effective_limit
  issue_types_json=$(cat "$TMP_DIR/issue-types.json")
  fields_json=$(cat "$TMP_DIR/fields.json")
  links_json=$(cat "$TMP_DIR/link-types.json")
  screens_json=$(cat "$TMP_DIR/screen-schemes.json" 2>/dev/null || echo '{}')
  contexts_json=$(cat "$TMP_DIR/field-contexts.json" 2>/dev/null || echo '{}')
  native_json=$(cat "$TMP_DIR/project-native-types.json")
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    project_id=$(echo "$p" | jq -r '.id')
    project_key=$(echo "$p" | jq -r '.key')
    simplified=$(echo "$p" | jq -r '.simplified // false')
    if [[ "$simplified" == "true" ]]; then mode="team-managed-lightweight"; else mode="company-managed-full"; fi
    cfg=$(project_config_json "$project_key")
    native=$(echo "$native_json" | jq -c --arg p "$project_key" '.[$p] // {} | del(.availableIssueTypes)')
    property_model=$(jq -c '{schema,version,sourceSchema,tableCount:(.tables|length),createTableOccurrences:([.tables[].sourceOccurrences]|add),projectPropertyCount:(.projectProperties|length)}' "$PROPERTY_MODEL_PATH")
    registry=$(jq -n --arg schema "qaira.registry.v1" --arg version "2.0.0" --arg projectKey "$project_key" --arg projectId "$project_id" --arg mode "$mode" --arg createdAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg createdBy "$JIRA_EMAIL" --arg runId "$RUN_ID" --argjson issueTypes "$issue_types_json" --argjson fields "$fields_json" --argjson linkTypes "$links_json" --argjson screenSchemes "$screens_json" --argjson fieldContexts "$contexts_json" --argjson config "$cfg" --argjson nativeTypes "$native" --argjson propertyModel "$property_model" '{schema:$schema, version:$version, product:"Qaira", projectKey:$projectKey, projectId:$projectId, mode:$mode, nativeTypes:$nativeTypes, issueTypes:$issueTypes, fields:$fields, linkTypes:$linkTypes, screenSchemes:$screenSchemes, fieldContexts:($fieldContexts[$projectKey] // {}), config:$config, propertyModel:$propertyModel, createdAt:$createdAt, createdBy:$createdBy, runId:$runId, storagePolicy:"jira-only-no-external-db-no-forge-db", customFieldWritePolicy:"metadata-aware-fallback"}')
    registry_bytes=$(property_value_bytes "$registry")
    model_limit=$(jq -r '.limits.propertyValueBytes' "$PROPERTY_MODEL_PATH")
    [[ "$REGISTRY_MAX_BYTES" =~ ^[0-9]+$ && "$REGISTRY_MAX_BYTES" -gt 0 ]] || fatal "REGISTRY_MAX_BYTES must be a positive integer."
    effective_limit="$REGISTRY_MAX_BYTES"
    (( effective_limit > model_limit )) && effective_limit="$model_limit"
    if (( registry_bytes > effective_limit )); then
      fatal "Registry for $project_key is ${registry_bytes} bytes, above the ${effective_limit}-byte safety limit. Reduce configured fields/metadata before rerunning."
    fi
    api PUT "/rest/api/3/project/${project_key}/properties/${REGISTRY_KEY}" "$registry" >/dev/null
    log "Wrote registry for $project_key ($mode, ${registry_bytes} bytes)"
  done
}

fetch_create_metadata_fields() {
  local project_key="$1" issue_type_id="$2" start=0 max=200 response is_last total
  : > "$TMP_DIR/create-meta-fields.ndjson"
  while :; do
    response=$(api GET "/rest/api/3/issue/createmeta/$(urlenc "$project_key")/issuetypes/${issue_type_id}?startAt=${start}&maxResults=${max}")
    echo "$response" | jq -c '(.fields // .results // .values // [])[]?' >> "$TMP_DIR/create-meta-fields.ndjson"
    is_last=$(echo "$response" | jq -r '.isLast // false')
    total=$(echo "$response" | jq -r '.total // ((.fields // .results // .values // []) | length)')
    start=$((start + max))
    [[ "$is_last" == "true" || "$start" -ge "$total" ]] && break
  done
  jq -s '.' "$TMP_DIR/create-meta-fields.ndjson"
}

validate_create_metadata_compatibility() {
  [[ "$VALIDATE_CREATE_METADATA" == "true" ]] || { log "Skipping create metadata compatibility validation"; return; }
  log "Validating Jira create metadata compatibility"
  : > "$RUN_DIR/create-metadata-compatibility.ndjson"
  local total_missing=0
  jq -c '.[]' "$TMP_DIR/selected-projects.json" | while read -r p; do
    local project_key
    project_key=$(echo "$p" | jq -r '.key')
    jq -c '.issueTypes[]' "$SCHEMA_PATH" | while read -r it; do
      local issue_key issue_name issue_type_id metadata expected available missing expected_count available_count
      issue_key=$(echo "$it" | jq -r '.key')
      issue_name=$(echo "$it" | jq -r '.name')
      issue_type_id=$(jq -r --arg k "$issue_key" '.[$k] // empty' "$TMP_DIR/issue-types.json")
      [[ -n "$issue_type_id" ]] || continue
      metadata=$(fetch_create_metadata_fields "$project_key" "$issue_type_id")
      expected=$(jq -n --arg issueKey "$issue_key" --slurpfile schema "$SCHEMA_PATH" --slurpfile fields "$TMP_DIR/fields.json" '
        [$schema[0].fields[] | select((.issueTypeKeys // []) | index($issueKey)) | $fields[0][.key] // empty] | map(select(. != "")) | unique')
      available=$(echo "$metadata" | jq '[.[] | (.fieldId // .key // .id // empty) | tostring] | unique')
      missing=$(jq -n --argjson expected "$expected" --argjson available "$available" '$expected - $available')
      expected_count=$(echo "$expected" | jq 'length')
      available_count=$(jq -n --argjson expected "$expected" --argjson available "$available" '[$expected[] | select(. as $id | $available | index($id))] | length')
      jq -cn --arg projectKey "$project_key" --arg issueTypeKey "$issue_key" --arg issueTypeName "$issue_name" --arg issueTypeId "$issue_type_id" --argjson expected "$expected_count" --argjson available "$available_count" --argjson missing "$missing" '{projectKey:$projectKey,issueTypeKey:$issueTypeKey,issueTypeName:$issueTypeName,issueTypeId:$issueTypeId,expectedQairaFields:$expected,availableQairaFields:$available,missingFieldIds:$missing}' >> "$RUN_DIR/create-metadata-compatibility.ndjson"
      if [[ "$(echo "$missing" | jq 'length')" -gt 0 ]]; then
        warn "$project_key/$issue_name: Jira create metadata exposes ${available_count}/${expected_count} Qaira custom fields. Qaira backend must use metadata-aware fallback."
      else
        log "$project_key/$issue_name: create metadata exposes all configured Qaira fields"
      fi
    done
  done
  jq -s '.' "$RUN_DIR/create-metadata-compatibility.ndjson" > "$RUN_DIR/create-metadata-compatibility.json"
  rm -f "$RUN_DIR/create-metadata-compatibility.ndjson"
  total_missing=$(jq '[.[].missingFieldIds | length] | add // 0' "$RUN_DIR/create-metadata-compatibility.json")
  if [[ "$total_missing" -gt 0 && "$CREATE_METADATA_POLICY" == "fail" ]]; then
    fatal "Jira create metadata excludes $total_missing configured Qaira field references. See $RUN_DIR/create-metadata-compatibility.json"
  fi
  if [[ "$total_missing" -gt 0 ]]; then
    warn "Create metadata compatibility is limited. This is not repaired by additional screen/context setup on this site. Keep the permanent metadata-aware fallback in src/qairaApi.js."
  fi
}

smoke_validation() {
  [[ "$ENABLE_SMOKE_VALIDATION" == "true" ]] || { log "Smoke validation skipped (ENABLE_SMOKE_VALIDATION=false)"; return; }
  warn "Smoke validation creates a sample Qaira Test Case using only Jira-supported system fields."
  local project_key test_case_type_id body resp status key
  project_key=$(jq -r '.[0].key' "$TMP_DIR/selected-projects.json")
  test_case_type_id=$(jq -r '.testCase' "$TMP_DIR/issue-types.json")
  body=$(jq -n --arg projectKey "$project_key" --arg it "$test_case_type_id" '{fields:{project:{key:$projectKey}, issuetype:{id:$it}, summary:"Qaira setup smoke test - safe to delete"}}')
  resp=$(api_no_fail POST "/rest/api/3/issue" "$body")
  status=$(echo "$resp" | jq -r '.status // 0')
  if [[ "$status" =~ ^2 ]]; then
    key=$(echo "$resp" | jq -r '.body.key')
    log "Created smoke test issue $key"
    record_created smokeIssue "$project_key" "$key" "Qaira setup smoke test"
  else
    fatal "Smoke validation failed: $(echo "$resp" | jq -cr '.body')"
  fi
}

write_success_state() {
  jq -n --arg runId "$RUN_ID" --arg completedAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg registryKey "$REGISTRY_KEY" --slurpfile projects "$TMP_DIR/selected-projects.json" --slurpfile issueTypes "$TMP_DIR/issue-types.json" --slurpfile fields "$TMP_DIR/fields.json" --slurpfile links "$TMP_DIR/link-types.json" --slurpfile native "$TMP_DIR/project-native-types.json" --slurpfile propertyModel "$PROPERTY_MODEL_PATH" --slurpfile projectProperties "$RUN_DIR/project-properties.json" '{runId:$runId, completedAt:$completedAt, registryKey:$registryKey, propertyModel:{schema:$propertyModel[0].schema,version:$propertyModel[0].version,tableCount:($propertyModel[0].tables|length)}, selectedProjects:$projects[0], issueTypes:$issueTypes[0], fields:$fields[0], linkTypes:$links[0], nativeTypes:$native[0], projectProperties:$projectProperties[0]}' > "$RUN_DIR/success-state.json"
}

main() {
  validate_property_model
  if [[ "$STRICT_FIELD_CONTEXTS" == "true" ]]; then
    warn "STRICT_FIELD_CONTEXTS is deprecated and ignored. Existing Jira field contexts are always preserved."
  fi
  log "Reading schema: $SCHEMA_PATH"
  schema_summary >&2
  log "Using project map: $PROJECT_MAP_PATH"
  preflight_auth
  log "Discovering projects"
  paginate_project_search
  select_projects
  log "Selected projects: $(jq -r '[.[].key] | join(", ")' "$TMP_DIR/selected-projects.json")"
  log "Company-managed selected: $(jq '[.[] | select((.simplified // false)==false)] | length' "$TMP_DIR/selected-projects.json"), team-managed selected: $(jq '[.[] | select((.simplified // false)==true)] | length' "$TMP_DIR/selected-projects.json")"
  resolve_project_native_types

  if [[ "$DRY_RUN" == "true" ]]; then
    cat >&2 <<EOF

DRY_RUN=true: no Jira write calls were made. Protected local diagnostics were created.
Resolved native mapping written to:
  $RUN_DIR/project-native-types.json

To execute for your selected project(s):
  DRY_RUN=false PROJECT_KEYS=${PROJECT_KEYS} JIRA_BASE_URL='${JIRA_BASE_URL}' JIRA_EMAIL='${JIRA_EMAIL}' JIRA_API_TOKEN='***' bash admin/setup-qaira-jira.sh

Recommended first real run:
  DRY_RUN=false CONFIGURE_FIELD_CONTEXTS=true CONFIGURE_SCREENS=true CONTINUE_ON_CONTEXT_ERROR=false CONTINUE_ON_SCREEN_FIELD_ERROR=false VALIDATE_CREATE_METADATA=true CREATE_METADATA_POLICY=warn PROJECT_KEYS=${PROJECT_KEYS} bash admin/setup-qaira-jira.sh

For an intentional PROJECT_KEYS=ALL write, add CONFIRM_ALL_PROJECTS=true only after reviewing the site-wide dry run.

Failure recovery:
  - This script writes traces to $RUN_DIR.
  - If a step fails, fix the cause and rerun. Existing objects are reused.
  - Requirement/defect native mappings come from admin/qaira-project-map.json; no hardcoded Story/Bug IDs are used.

EOF
    exit 0
  fi

  if [[ "$PROJECT_KEYS" == "ALL" && "$CONFIRM_ALL_PROJECTS" != "true" ]]; then
    fatal "Refusing a site-wide write with PROJECT_KEYS=ALL. Set explicit project keys or CONFIRM_ALL_PROJECTS=true after reviewing the dry run."
  fi

  create_or_get_issue_types
  create_or_get_link_types
  create_or_get_fields
  add_issue_types_to_company_project_schemes
  resolve_project_native_types
  create_contexts_and_options
  configure_screens
  assign_issue_type_screen_schemes
  initialize_project_property_envelopes
  write_project_registries
  validate_create_metadata_compatibility
  smoke_validation
  write_success_state

  log "Qaira Jira setup complete. Registry key: $REGISTRY_KEY"
  log "Run artifacts: $RUN_DIR"
}

main "$@"
