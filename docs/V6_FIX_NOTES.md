# Qaira v6 Fix Notes

This package fixes the runtime resolver failure visible in Jira as:

```text
There was an error invoking the function - out is not a constructor
```

Fixes included:

- Defensive Forge resolver import for Node.js 22 runtime.
- Replaced fragile JQL GET endpoint with POST `/rest/api/3/search`.
- Added Jira-style list views for requirements, test cases, suites, plans, runs, defects, automation, and object repository.
- Added collapsible/narrow Qaira sidebar.
- Added modals for create flows.
- Added JQL runner on list views.
- Added iteration CRUD, now represented by sharded Jira project properties under `qaira.data.requirement-iterations.v1`.
- Added module CRUD, now represented by sharded Jira project properties under `qaira.data.test-case-modules.v1`.
- Added drag-and-drop assignment of test cases to modules using Jira issue property `qaira.module.v1`.
- Added resizable table columns and selectable rows.
- Added AI dialogs for requirement coverage optimization, duplicate/orphan recognition, run analysis, automation skeletons, and locator suggestions.
- Kept icon in `static/qaira-ui/public/assets/icon.svg` and built output `static/qaira-ui/dist/assets/icon.svg`.
- Kept business data Jira-native: no external DB and no Forge DB.

For a current deployment, use the repository release gates rather than the historical install command:

```bash
cd qaira-for-jira
nvm use 22.22.0
npm run setup
npm run verify
npm run build
forge lint
forge deploy -e development --verbose
forge install -e development -s your-site.atlassian.net -p Jira --upgrade
```

Omit `--upgrade` only for the first installation on that Jira site. Do not run the Jira admin setup again merely to deploy this code build.
