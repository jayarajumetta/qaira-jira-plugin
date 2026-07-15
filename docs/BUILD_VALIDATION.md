# Build and release validation

Run validation from a clean checkout with Node.js 22:

```bash
nvm use 22.22.0
npm run setup
npm run verify
npm run build
forge lint
```

`npm run verify` is the repository gate. It checks the Forge backend JavaScript and tests, frontend TypeScript, all 46 canonical SQL-reference-to-Jira mappings, runtime/admin schema parity, parity for all 35 registered feature flags, canonical property keys, property-size limits, and admin/CI shell syntax. `npm run build` performs another frontend type check and produces the hosted resource under `static/qaira-ui/dist`.

Before promotion, also run:

```bash
npm audit --omit=dev
npm --prefix static/qaira-ui audit --omit=dev
bash -n admin/setup-qaira-jira.sh
bash -n admin/diagnose-jira-access.sh
bash -n admin/validate-qaira-schema.sh
bash -n ci/import-junit-to-jira.sh
```

`forge lint`, `forge deploy`, and tenant installation require a Forge login that owns or contributes to the app ID in `manifest.yml`. Record the exact command output in the release evidence rather than carrying forward module counts or bundle sizes from an older build.

Tenant release evidence must also cover the explainable AI contract: preview endpoints return deterministic provenance/evidence and do not mutate their assessed source records; the quality-insights flag fails closed; locator `POST` remains a proposal; and only a `PUT .../ai-improve/apply` with `confirmed: true` changes the object record. Exercise these with the applicable Viewer, QA Member/Lead, and administrator accounts rather than only an administrator session.

For projects with existing Qaira data, record an `ops.view` `GET /admin/reconcile` dry run. If it reports drift, approve and execute small `ops.manage`/Jira-admin `POST` batches with `confirmed: true` and a conservative `max_changes`; retain each response and repeat the dry run until `remaining_count` is zero and `possibly_truncated` is false. The repair must change property projections from authoritative Jira links, never the links themselves.
