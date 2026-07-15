# Qaira Forge deploy fix

The current package includes:

- an explicit `app.id` in `manifest.yml`;
- `nodejs22.x` Forge runtime.
- No root `install` lifecycle script.
- `static/qaira-ui/public/assets/icon.svg` and built icon path support.
- Vite `base: './'` so Custom UI assets are served correctly by Forge hosted resources.

If `forge deploy` says the app ID is not owned by the authenticated account, stop and verify ownership/contributor access in the Atlassian Developer Console. Do not replace `app.id` or run `forge register` when the goal is to upgrade the installed Qaira app; either action can create or target a different app identity.

Use `npm run setup`, `npm run verify`, `npm run build`, and then the authenticated Forge commands in `docs/SETUP.md`.
