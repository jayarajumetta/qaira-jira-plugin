# Qaira Jira authentication guide

There are three Atlassian credential types that are easy to confuse.

## 1. Atlassian account API token — recommended for local setup

Create it from:

```text
https://id.atlassian.com/manage-profile/security/api-tokens
```

Use:

```bash
export JIRA_BASE_URL="https://your-site.atlassian.net"
export JIRA_EMAIL="admin@example.com"
export JIRA_AUTH_MODE="basic"
export JIRA_API_TOKEN="<account-api-token>"
```

This is the simplest mode for `admin/setup-qaira-jira.sh`.

## 2. Scoped account or service-account token — gateway mode

Use the Atlassian API Gateway URL:

```bash
export JIRA_BASE_URL="https://api.atlassian.com/ex/jira/<cloudId>"
export JIRA_AUTH_MODE="basic"   # or bearer, depending on the token flow
```

The token user/service account must still have Jira product access and the necessary Jira permissions.

## 3. Organization API key — not valid for this script

Keys created from:

```text
admin.atlassian.com/o/<orgId>/api-keys
```

are Organization Admin API keys. They authenticate Admin APIs with Bearer auth and are not valid for Jira product REST configuration calls such as `/rest/api/3/issuetype`, `/rest/api/3/field`, or `/rest/api/3/project/search`.

Do not put an Organization API key into `JIRA_API_TOKEN` for the Qaira setup script.
