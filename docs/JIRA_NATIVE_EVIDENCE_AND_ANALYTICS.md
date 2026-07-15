# Jira-native evidence, delivery metadata, and quality analytics

Last reviewed: 15 July 2026

## Decisions

Qaira stores uploaded images, videos, PDFs, logs, and other files as Jira issue attachments. It does not copy binary data into Forge storage, project properties, issue properties, or an external database. The reusable `JiraAttachmentPanel` is mounted on Requirement, Bug, Test Case, and Test Run detail views. Step evidence continues to reference attachments on the Test Run issue.

Requirement and Bug mappings are canonical Jira mappings:

| Qaira concept | Jira authority |
| --- | --- |
| Title | `summary` |
| Description | `description` in Atlassian Document Format |
| Labels | `labels` |
| Iteration delivery scope | Jira Software Sprint custom field; Qaira iteration groups may hold a reviewed Sprint ID binding |
| Release | `fixVersions` |
| Priority | Jira `priority` |
| Status | Jira workflow transitions |
| Attachments | Jira issue attachments |
| Assignee/reporter | Jira users on the issue |
| Extended QA structure | Size-limited Qaira issue property |

An unknown Sprint or Fix Version is rejected. Qaira does not write a lookalike value into a property when the native Jira field exists. Non-Jira-Software projects may retain the compatibility sprint projection because no Sprint field exists there.

## Attachment contract

- Upload endpoint: `POST /rest/api/3/issue/{issueIdOrKey}/attachments`.
- Multipart field name: `file`.
- Required header: `X-Atlassian-Token: no-check`.
- Reads, downloads, and deletes use Jira attachment APIs and Jira permissions.
- Uploads are limited to ten selected files per UI operation and two concurrent uploads.
- Qaira reads Jira's attachment settings, blocks upload when attachments are disabled, and rejects empty or over-limit files before transfer.
- Uploads are not automatically retried because that could create duplicate attachments.
- Listing and download errors are recoverable without discarding unsaved form state.

See the official [Jira attachment REST documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/).

## Analytics architecture

The default **Quality analytics** tab remains the first dashboard view. It is a project command center built from requirement coverage, execution health, automation coverage, defects, release confidence, and explainable quality signals.

The **Custom dashboards** tab follows Jira's dashboard/gadget model:

1. A project-scoped dashboard contains up to 12 gadgets.
2. A gadget has a title, JQL predicate, visualization, and grouping field.
3. Qaira wraps all user JQL with `project = <active-project> AND (...)` on the server.
4. A gadget reads no more than 100 Jira issues per evaluation and reports truncation.
5. Supported visualizations are metric, donut, bar, stacked bar, chronological line, and Jira issue table.
6. Grouping covers status/category, priority, type, assignee, fix version, Sprint, labels, resolution, created month, and updated month. Metric cards cover count, unresolved, high priority, unassigned, overdue, stale, and average age.
7. Executive, Product, Quality Engineering, and Automation templates are complete seven-gadget drafts. Optional Fix Version scope is escaped and added to every generated predicate.
8. The assisted designer returns a preview with confidence, provenance, and a human-approval boundary. It never saves automatically.
9. One `/analytics/jql-batch` request evaluates the visible dashboard with concurrency three, request-local deduplication, and a structured error per gadget. One invalid gadget does not erase successful gadgets.
10. Dashboard definitions are sharded Jira project properties, not binary or high-volume result storage.

Blank gadget JQL is valid and means the entire authorized project. `ORDER BY` is parsed separately and constrained to Jira field/direction expressions. A user-supplied `project = ...` clause cannot escape the server-applied active-project boundary.

## Hierarchy decision signals

Iteration and module bars are decision surfaces rather than decorative folders. Their name, icon, record count, and metrics remain on one horizontal line in tile and list modes; narrow canvases scroll that line instead of wrapping it into a tall card.

- Requirement iteration: linked-test coverage, weighted pass/automation readiness, Jira workflow completion, and uncovered/high-priority risk count.
- Test-case module: requirement traceability, executable-step coverage, automation coverage when enabled, recent finalized-result stability, and unlinked/step-less/failed/high-priority-manual risk count.
- Unassigned iteration/module uses the same iconography and metrics, so orphan scope is measurable rather than hidden in a secondary bucket.
- Every value is derived from the already loaded, active-project workspace projection. The UI does not issue a query per hierarchy bar.

Jira's dashboard model uses configurable gadgets, layouts, refresh, and saved-filter/JQL inputs. Qaira adopts those interaction principles while keeping quality-engineering defaults. See Atlassian's [custom dashboard](https://support.atlassian.com/jira-cloud-administration/docs/configure-custom-dashboards/) and [dashboard gadget](https://support.atlassian.com/jira-cloud-administration/docs/use-dashboard-gadgets/) documentation.

## Research cross-check

| Product pattern | Qaira implementation |
| --- | --- |
| TestRail real-time status, progress, defect, workload, trends, and quality charts | Default QE command center plus six project-scoped gadget visualizations |
| TestRail requirement/defect traceability and embedded run evidence | Jira links plus native attachments on source issues and runs |
| Xray immutable Test Run specification/evidence and execution history | Run snapshots, history, defects, and Jira evidence attachments |
| Xray Reporting Center coverage/execution categories | Default analytics plus stakeholder templates and configurable JQL gadgets |
| Zephyr plan/cycle execution, coverage, version, environment, and priority reports | Release/run analytics, hierarchy health, and Jira field/Sprint/Fix Version grouping |

Primary references:

- [TestRail charts and dashboards](https://support.testrail.com/hc/en-us/articles/7101753582996-Charts-and-dashboards)
- [TestRail reports overview](https://support.testrail.com/hc/en-us/articles/9285210470420-Reports-overview)
- [Xray Test Runs](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/44565109)
- [Xray Reporting Center](https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/pages/338526916)
- [Zephyr test plans](https://support.smartbear.com/zephyr/docs/en/test-plans/test-plans--overview-)
- [Zephyr reports and analysis](https://support.smartbear.com/zephyr-scale-server/docs/en/reports-and-analysis.html)

## Jira-owned users and themes

- Qaira lists active Jira users and project-scoped Qaira role projections; it does not expose Create User, Import User, rename, password, suspend, or delete actions.
- Unsupported identity mutations fail with structured `ATLASSIAN_MANAGED_IDENTITY` errors. Atlassian Administration remains the identity/product-access authority.
- Qaira role creation and permission assignment remain available behind `role.manage` because they are app authorization records, not Atlassian identities.
- `view.theme.enable()` and `data-color-mode` synchronize the Forge iframe with Jira. Component surfaces use Atlassian design-token fallbacks for both themes.
- Only the selected section tab has an underline. A collapsed sidebar item with child pages expands the sidebar on click so the child choices become reachable.

## Resilience and performance

- Jira reads and explicitly idempotent writes retry only on `429`, `502`, `503`, and `504`.
- Retry delay honors `Retry-After`, otherwise uses bounded exponential backoff capped at two seconds.
- Non-idempotent issue creation, transitions, and attachment uploads are not automatically retried.
- Request telemetry records Jira call count, retry count, Jira duration, total duration, status, and request ID.
- Sprint, Version, and field reads are request-cached and independently loaded with bounded concurrency.
- Dashboard evaluation is one batch resolver call, bounded to 12 gadgets, concurrency three, 100 Jira rows per gadget, and request-local search deduplication.
- Jira rate-limit responses preserve structured traces and honor `Retry-After`; attachment uploads remain single-attempt to avoid duplicate evidence.
- JQL evaluation and attachment uploads have explicit caps.

This is a targeted SOLID refactor: resilience policy, analytics normalization/aggregation, attachment UI, and Jira delivery metadata are isolated components/services. Unrelated working domains were not mechanically rewritten.
