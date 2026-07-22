import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const peopleSource = read("../static/qaira-ui/src/pages/PeoplePage.tsx");
const stylesSource = read("../static/qaira-ui/src/styles.css");

test("role details open as a closable right-side dialog without replacing the catalog", () => {
  assert.match(peopleSource, /className="people-role-catalog"/);
  assert.match(peopleSource, /className="people-role-drawer-backdrop"/);
  assert.match(peopleSource, /className="people-role-drawer"/);
  assert.match(peopleSource, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(peopleSource, /DialogCloseButton label=\{`Close \$\{selectedRole\.name\} role details`\}/);
  assert.doesNotMatch(peopleSource, /Back to role tiles/);
  assert.match(stylesSource, /\.people-role-drawer-backdrop[\s\S]*justify-content: flex-end/);
  assert.match(stylesSource, /\.people-role-drawer[\s\S]*width: min\(48rem, 100%\)/);
});

test("role dialog supports Escape, trapped keyboard focus, focus restoration, and responsive motion", () => {
  assert.match(peopleSource, /event\.key === "Escape"[\s\S]*closeRoleWorkspace\(\)/);
  assert.match(peopleSource, /event\.key !== "Tab"[\s\S]*firstElement[\s\S]*lastElement/);
  assert.match(peopleSource, /previouslyFocusedElement\?\.isConnected[\s\S]*previouslyFocusedElement\.focus\(\)/);
  assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]*\.people-role-drawer[\s\S]*width: 100%/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.people-role-drawer/);
});
