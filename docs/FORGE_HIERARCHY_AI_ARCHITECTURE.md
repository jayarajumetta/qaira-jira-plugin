# Forge hierarchy, run scope, and AI safety architecture

## Runtime data contract

Qaira treats Jira issues as the canonical records for Stories, Bugs, Test Cases, Suites, and Runs. Jira Sprint and Fix Version metadata stays canonical for delivery scope. Qaira project collections hold only small structural indexes such as module membership and legacy Sprint compatibility.

List screens use two projections:

- `summary` contains only identity, status, relationship IDs, delivery scope, and the small module property.
- `detail` is fetched for the selected record and may hydrate the larger Qaira issue property.

Potentially large lists are explicitly bounded. Unassigned Story and Test Case lanes start at 15 records. Sprint and Module headers load first, are collapsed by default, and request at most 25 children when expanded. Child endpoints return `{ items, total, next_cursor, is_last }`; the array-only list contract remains available for older callers.

This design avoids the expensive pattern of loading every Jira issue and then filtering it in a Forge function. It also gives the UI an explicit place to add cursor-based “load more” behavior without changing the resource contract.

## Run snapshot hierarchy

A run preserves this immutable structure at creation or scope refresh:

```text
Run
└── Suite snapshot
    └── Module snapshot
        └── Test Case snapshot
            └── Step snapshots
```

Module identity is copied into every case snapshot and into a compact `module_snapshots` rollup. Moving a live Test Case to another Module therefore does not change an existing run or its historical report.

Synchronous run materialization is intentionally bounded to 50 Suite inputs, 100 combined Jira relationships/Test Cases, 500 steps per case, and 2,500 steps per run. Suite and Test Case records are loaded through bounded Jira searches with their required entity properties embedded, rather than through per-record issue/property reads. Oversized scopes fail with an actionable `413` response and should be split or delegated to an approved asynchronous/external runner.

Case and step snapshots use generation-specific issue-property shards. Persistence is copy-on-write: Qaira writes the complete new generation, commits the root property that points to it, and only then removes the previous generation. An interrupted update therefore leaves the last committed run readable.

Responsibility follows deterministic inheritance:

```text
Case override > Module override > Suite override > Run owner
```

Every effective case assignment stores its source. Updating a parent assignment recomputes only descendants that do not have a more specific override.

## Metrics

- Run: total scope, resolved count, completion, passed, failed, blocked/running, not run, pass rate, duration, Bugs, impacted requirements, and evidence risk.
- Suite: the same outcome rollup limited to the Suite snapshot.
- Module: case count, completion, pass rate, failed count, and blocked/running count.
- Test Case: outcome, step progress, duration, assignee, evidence, Bugs, references, and requirement impact.

Percentages use snapshotted scope as the denominator. Pass rate uses resolved outcomes as the denominator, while completion uses all scoped cases. This prevents “not run” cases from inflating pass rate or disappearing from readiness.

## Jira dynamic fields

Story and Bug creation reads Jira’s project-and-issue-type create-field metadata. Editing reads the target issue's edit metadata because Jira field visibility, editability, and required rules can differ after creation. Required fields without a default are rendered dynamically. Required core fields already represented by Qaira controls—such as Assignee, Priority, Sprint, Labels, and Fix Version—mark those controls as required instead of showing a duplicate field.

The server re-reads and whitelists live metadata; it never trusts field identifiers supplied by Custom UI. Custom fields selected from the live screen contract are strict writes: if a Jira administrator changes a screen or field context while the form is open, Qaira returns a refresh/configuration error instead of silently dropping the field and reporting success.

## Jira-native delivery synchronization

| Qaira concept | Jira system of record | Qaira read behavior | Qaira write behavior |
| --- | --- | --- | --- |
| Requirement | Story | Live Jira issue fields and transitions | Jira create/edit metadata, issue update, and workflow transition |
| Bug | Bug | Live Jira issue fields, links, Sprint, and Fix Version | Jira create/edit metadata, issue update, links, and workflow transition |
| Sprint | Jira Software Sprint | Boards and Sprints are loaded from Jira | Native Sprint create/edit, bounded Story moves to Sprint/backlog, and Jira-owned Sprint deletion |
| Release | Jira Fix Version | Live project versions and issue `fixVersions` | Issue `fixVersions` by Jira version ID |

Qaira issue properties contain only QA-specific extensions, revision data, and safe fallbacks; they do not overwrite the Jira-owned delivery fields. Jira-side changes therefore appear on the next query, while Qaira-side changes use Jira APIs and are immediately visible in Jira.

## Project and application-space scope

The workspace selector is a two-level tree: Jira/Qaira projects are the parent nodes and Qaira application spaces are children. Expanding a project lazily loads only that project's spaces. Selecting a project restores its remembered space (or the first valid space after metadata loads); selecting a space commits the space mapping before switching its parent project so all listeners observe one coherent scope.

## AI boundary

All feature AI calls pass through a registered capability contract. Unknown capabilities fail closed. The server owns context, completion-token, timeout, tool, and model controls; request fields cannot override them.

Before a request reaches Forge LLM, Qaira:

1. Removes prompt-control fields recursively.
2. Rejects prompt-injection instructions in user context.
3. Redacts credentials, email addresses, and phone-like values.
4. Projects the output draft to capability-approved editable paths.
5. Disables tools and requires one schema-matching JSON object.
6. Locks IDs, counts, statuses, evidence, and other decision-bearing values during merge.
7. Records policy provenance and requires human review.

Provider failures are reduced to a fixed safe category before returning to Custom UI; raw provider response text is never exposed as a fallback reason. Synchronous model calls are capped at 10 seconds and model discovery at 3 seconds, leaving headroom inside Forge's 25-second resolver limit. Repair calls are restricted to trusted asynchronous jobs.

Agentic workflow LLM nodes use the same bounded quality-engineering policy and a fixed output schema. Custom node prompts, model choice, temperature, tools, and output schemas are not passed to the model.

## Cost controls

- Jira JQL performs filtering and pagination at the source.
- Project/application-space branches load their children only when expanded and reuse the React Query cache for the currently selected project.
- Dynamic create metadata is cached per project/issue type; issue-specific edit metadata is requested only for the record being edited.
- Indexed entity-property aliases filter Test Cases by application type/module assignment, Suites by application type, and Runs by application type/status before hydration.
- Large issue properties are not hydrated for header/catalog first paint.
- Run lists read root counts and relationship IDs only; generation shards are hydrated only for the selected run or a report that needs immutable case/step detail.
- Module identity is the only extra structural Test Case property in summary searches.
- Run creation bulk-loads Suite, Test Case, and requirement evidence and uses bounded concurrency for unavoidable Jira link/property writes.
- Run hierarchy metrics are computed from the loaded immutable snapshot, without extra Jira searches.
- LLM calls have capability-specific output budgets and no automatic repair call unless explicitly enabled by trusted server code.
- Entity properties are used for issue-scoped snapshots; Forge storage remains for compact project indexes and configuration.
