import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const setup = fs.readFileSync(path.join(root, 'admin/setup-qaira-jira.sh'), 'utf8');

test('Jira setup treats valid registry field IDs as authoritative across display-name migrations', () => {
  const start = setup.indexOf('create_or_get_fields() {');
  const end = setup.indexOf('issue_type_ids_for_field_project() {', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const reconciliation = setup.slice(start, end);
  const registryMigration = reconciliation.slice(
    reconciliation.indexOf('if [[ -n "$hint_id" && "$hint_id" != "null" ]]'),
    reconciliation.indexOf('duplicate_count=')
  );

  assert.match(registryMigration, /\[\.values\[\]\? \| select\(\.id==\$hint\)\]\[0\] \/\/ empty/);
  assert.match(registryMigration, /\[\[ "\$hint_id" =~ \^customfield_\[0-9\]\+\$ \]\]/);
  assert.match(registryMigration, /id="\$hint_id"[\s\S]*if \[\[ "\$hint_name" != "\$name" \]\]/);
  assert.match(registryMigration, /api_no_fail PUT "\/rest\/api\/3\/field\/\$\{id\}" "\$body"/);
  assert.doesNotMatch(registryMigration, /hint_name[^\n]*legacy_requirement/);
  assert.match(registryMigration, /Reusing ID \$id to avoid creating a duplicate/);
  assert.match(registryMigration, /"\$update_status" == "404" && -z "\$hint_name"[\s\S]*id=''/);

  assert.ok(
    reconciliation.indexOf('if [[ -n "$hint_id" && "$hint_id" != "null" ]]')
      < reconciliation.indexOf('id=$(echo "$existing_qaira"'),
    'registry reconciliation must run before exact-name fallback'
  );
  assert.match(reconciliation, /if \[\[ -z "\$id" \|\| "\$id" == "null" \]\]; then[\s\S]*api POST "\/rest\/api\/3\/field"/);
});
