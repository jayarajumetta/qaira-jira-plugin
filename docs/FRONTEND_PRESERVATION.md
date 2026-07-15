# Frontend preservation and enterprise hardening

The supplied Qaira frontend remains in `static/qaira-ui` and retains its application shell, information architecture, page workflows, tables, editors, workflow builders, automation views, execution views, and visual identity. Dialogs and authoring/detail surfaces may be consolidated into shared patterns when the original variants produce duplicate headings, inaccessible focus, clipped content, or inconsistent Jira surfaces.

The current Forge version deliberately evolves the integration and safety layers:

- Forge Bridge replaces standalone HTTP transport and authentication.
- Hash routing and relative assets make navigation safe inside the Forge iframe.
- The active Atlassian identity, Qaira roles, Jira permissions, and fail-closed feature flags drive navigation and actions.
- A top-level error boundary and conservative query defaults prevent an isolated screen failure from taking down the workspace.
- Shared modal rules provide one semantic heading, bounded iframe-aware height, a scrolling content owner, stable actions, initial focus, and focus restoration.
- Requirement, Test Case, step, suite, and run detail workspaces use the same neutral Jira-aligned canvas hierarchy instead of switching to page-specific decorative backgrounds.
- Admin Space exposes project-specific setup/storage/permission health.
- Run evidence uses Jira attachments with lazy Blob previews, checksums, replacement cleanup, and failure compensation.
- Spreadsheet import uses a maintained XLSX reader; legacy binary `.xls` files are rejected rather than parsed by an unmaintained dependency.
- Production resources remain self-contained with no external fonts, runtime API base, or source maps.

This is an enterprise hardening of the supplied experience, not a second replacement dashboard. Reuse `WorkspaceMasterDetail`, shared dialog/confirmation components, form primitives, status badges, and design tokens before adding another page-local UX pattern. Runtime behavior is documented in `docs/CRUD_PERMISSIONS_AND_FLAGS.md` and durable design rules in `context.md`.
