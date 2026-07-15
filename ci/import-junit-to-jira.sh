#!/usr/bin/env bash
# Import a JUnit XML file as a Qaira Test Run issue and attachment.
# This intentionally uses Jira REST directly from CI and stores data in Jira only.
set -Eeuo pipefail
umask 077
: "${JIRA_BASE_URL:?Set JIRA_BASE_URL}"
: "${JIRA_EMAIL:?Set JIRA_EMAIL}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN}"
: "${PROJECT_KEY:?Set PROJECT_KEY}"
JUNIT_FILE="${1:?Usage: bash ci/import-junit-to-jira.sh ./junit.xml}"
RUN_SUMMARY="${RUN_SUMMARY:-Qaira Automation Run $(date -u '+%Y-%m-%dT%H:%M:%SZ')}"
RUN_ENVIRONMENT="${RUN_ENVIRONMENT:-ci}"
BUILD_NUMBER="${BUILD_NUMBER:-}"
REGISTRY_KEY="${REGISTRY_KEY:-qaira.registry.v1}"
RUN_PROP_KEY="qaira.runExecution.v1"
[[ -f "$JUNIT_FILE" ]] || { echo "JUnit file not found: $JUNIT_FILE" >&2; exit 1; }
need(){ command -v "$1" >/dev/null || { echo "Missing $1" >&2; exit 1; }; }
need curl; need jq; need python3
if [[ "$JIRA_EMAIL" == *$'\n'* || "$JIRA_EMAIL" == *$'\r'* || "$JIRA_EMAIL" == *'"'* || "$JIRA_EMAIL" == *\\* || "$JIRA_API_TOKEN" == *$'\n'* || "$JIRA_API_TOKEN" == *$'\r'* || "$JIRA_API_TOKEN" == *'"'* || "$JIRA_API_TOKEN" == *\\* ]]; then
  echo "Jira credentials contain characters that cannot be represented safely in the temporary curl configuration." >&2
  exit 1
fi
CURL_AUTH_CONFIG=$(mktemp)
trap 'rm -f "$CURL_AUTH_CONFIG"' EXIT
printf 'user = "%s:%s"\n' "$JIRA_EMAIL" "$JIRA_API_TOKEN" > "$CURL_AUTH_CONFIG"
chmod 600 "$CURL_AUTH_CONFIG"

api(){
  local method="$1" path="$2" body="${3:-}" out status
  local -a args=(--silent --show-error --config "$CURL_AUTH_CONFIG" --request "$method" --header 'Accept: application/json' --output)
  out=$(mktemp)
  if [[ -n "$body" ]]; then
    if ! status=$(curl "${args[@]}" "$out" --write-out '%{http_code}' --header 'Content-Type: application/json' "${JIRA_BASE_URL%/}$path" --data "$body"); then
      echo "Jira request failed before an HTTP response: $method $path" >&2
      rm -f "$out"
      exit 1
    fi
  else
    if ! status=$(curl "${args[@]}" "$out" --write-out '%{http_code}' "${JIRA_BASE_URL%/}$path"); then
      echo "Jira request failed before an HTTP response: $method $path" >&2
      rm -f "$out"
      exit 1
    fi
  fi
  if [[ "$status" =~ ^2 ]]; then
    cat "$out"
    rm -f "$out"
    return
  fi
  echo "Jira API failed: $method $path (HTTP $status)" >&2
  cat "$out" >&2
  printf '\n' >&2
  rm -f "$out"
  exit 1
}

upload_attachment(){
  local issue_key="$1" file="$2" out status
  out=$(mktemp)
  if ! status=$(curl --silent --show-error --config "$CURL_AUTH_CONFIG" --request POST --header 'X-Atlassian-Token: no-check' --header 'Accept: application/json' --form "file=@${file}" --output "$out" --write-out '%{http_code}' "${JIRA_BASE_URL%/}/rest/api/3/issue/${issue_key}/attachments"); then
    echo "Jira attachment upload failed before an HTTP response for ${issue_key}." >&2
    rm -f "$out"
    return 1
  fi
  if [[ ! "$status" =~ ^2 ]]; then
    echo "Jira attachment upload failed for ${issue_key} (HTTP $status)." >&2
    cat "$out" >&2
    printf '\n' >&2
    rm -f "$out"
    return 1
  fi
  if ! jq -e 'type == "array" and length > 0 and (.[0].id | type == "string")' "$out" >/dev/null; then
    echo "Jira returned an invalid attachment response for ${issue_key}." >&2
    cat "$out" >&2
    printf '\n' >&2
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}
registry=$(api GET "/rest/api/3/project/${PROJECT_KEY}/properties/${REGISTRY_KEY}" | jq '.value')
run_type_id=$(echo "$registry" | jq -r '.issueTypes.testRun')
[[ "$run_type_id" != "null" && -n "$run_type_id" ]] || { echo "Qaira registry missing issueTypes.testRun for ${PROJECT_KEY}. Run admin/setup-qaira-jira.sh first." >&2; exit 1; }
counts=$(python3 - "$JUNIT_FILE" <<'PY'
import sys, xml.etree.ElementTree as ET
p=sys.argv[1]
root=ET.parse(p).getroot()
local_name=lambda e: e.tag.rsplit('}',1)[-1]
cases=[e for e in root.iter() if local_name(e) == 'testcase']
if cases:
    tests=len(cases)
    failed=sum(any(local_name(child) in ('failure','error') for child in case) for case in cases)
    skipped=sum(any(local_name(child) == 'skipped' for child in case) for case in cases)
else:
    suites=[root] if local_name(root) == 'testsuite' else [e for e in root if local_name(e) == 'testsuite']
    tests=sum(int(float(s.attrib.get('tests',0) or 0)) for s in suites)
    failed=sum(int(float(s.attrib.get('failures',0) or 0)) + int(float(s.attrib.get('errors',0) or 0)) for s in suites)
    skipped=sum(int(float(s.attrib.get('skipped',0) or 0)) for s in suites)
passed=max(tests-failed-skipped,0)
print(f'{tests} {passed} {failed} {skipped}')
PY
)
read -r total passed failed skipped <<< "$counts"
fields_json=$(echo "$registry" | jq '.fields')
field_set=$(jq -n --arg project "$PROJECT_KEY" --arg summary "$RUN_SUMMARY" --arg it "$run_type_id" '{project:{key:$project}, issuetype:{id:$it}, summary:$summary}')
add_field(){
  local key="$1" value_json="$2" fid
  fid=$(echo "$fields_json" | jq -r --arg k "$key" '.[$k] // empty')
  if [[ -n "$fid" ]]; then
    field_set=$(echo "$field_set" | jq --arg fid "$fid" --argjson v "$value_json" '. + {($fid): $v}')
  fi
}
add_select(){ local key="$1" value="$2"; add_field "$key" "$(jq -n --arg v "$value" '{value:$v}')"; }
add_number(){ local key="$1" value="$2"; add_field "$key" "$(jq -n --argjson v "$value" '$v')"; }
add_text(){ local key="$1" value="$2"; add_field "$key" "$(jq -n --arg v "$value" '$v')"; }
add_select runType Automation
add_select runSource CI
if (( failed > 0 )); then run_status="Failed"; else run_status="Completed"; fi
add_select runStatus "$run_status"
normalized_environment=$(printf '%s' "$RUN_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')
case "$normalized_environment" in
  qa) jira_environment="QA" ;;
  staging) jira_environment="Staging" ;;
  uat) jira_environment="UAT" ;;
  prod-like|prod_like) jira_environment="Prod-like" ;;
  production|prod) jira_environment="Production" ;;
  dev|development) jira_environment="Dev" ;;
  *) jira_environment="Other" ;;
esac
add_select environment "$jira_environment"
add_text buildNumber "$BUILD_NUMBER"
add_number totalCount "$total"
add_number passedCount "$passed"
add_number failedCount "$failed"
add_number skippedCount "$skipped"
issue_body=$(jq -n --argjson fields "$field_set" '{fields:$fields}')
created=$(api POST "/rest/api/3/issue" "$issue_body")
issue_key=$(echo "$created" | jq -r '.key')
issue_id=$(echo "$created" | jq -r '.id')
echo "Created Qaira Test Run: $issue_key"
if ! attachment_response=$(upload_attachment "$issue_key" "$JUNIT_FILE"); then
  echo "The run issue remains at $issue_key for diagnosis; no $RUN_PROP_KEY property was written." >&2
  exit 1
fi
attachment_id=$(echo "$attachment_response" | jq -r '.[0].id')
attachment_name=$(echo "$attachment_response" | jq -r '.[0].filename')
attachment_mime=$(echo "$attachment_response" | jq -r '.[0].mimeType // "application/xml"')
attachment_size=$(echo "$attachment_response" | jq -r '.[0].size // 0')
attachment_created=$(echo "$attachment_response" | jq -r '.[0].created // empty')
project_id=$(echo "$registry" | jq -r '.projectId // empty')

run_status_value=$(if (( failed > 0 )); then echo failed; else echo completed; fi)
jq_args=(
  --arg schema "$RUN_PROP_KEY"
  --arg issueId "$issue_id"
  --arg issueKey "$issue_key"
  --arg projectId "$project_id"
  --arg attachmentId "$attachment_id"
  --arg attachmentName "$attachment_name"
  --arg attachmentMime "$attachment_mime"
  --arg attachmentCreated "$attachment_created"
  --arg environment "$RUN_ENVIRONMENT"
  --arg build "$BUILD_NUMBER"
  --arg status "$run_status_value"
  --argjson attachmentSize "$attachment_size"
  --argjson total "$total"
  --argjson passed "$passed"
  --argjson failed "$failed"
  --argjson skipped "$skipped"
)
run_execution=$(jq -n "${jq_args[@]}" '{
    schema:$schema,
    id:$issueId,
    display_id:$issueKey,
    project_id:$projectId,
    status:$status,
    trigger:"ci",
    execution_mode:"automation",
    environment:$environment,
    build:$build,
    result_storage:"qaira.runResult.v1",
    evidence_storage:"jira-attachments",
    result_attachments:[{
      attachmentId:$attachmentId,
      fileName:$attachmentName,
      mimeType:$attachmentMime,
      size:$attachmentSize,
      createdAt:(if ($attachmentCreated | length) > 0 then $attachmentCreated else null end),
      kind:"junit"
    }],
    counts:{total:$total,passed:$passed,failed:$failed,skipped:$skipped},
    imported_at:(now|todate),
    created_at:(now|todate),
    updated_at:(now|todate),
    started_at:null,
    ended_at:(now|todate)
  }')
api PUT "/rest/api/3/issue/${issue_key}/properties/${RUN_PROP_KEY}" "$run_execution" >/dev/null
echo "Attached JUnit results ($attachment_id) and wrote $RUN_PROP_KEY"
