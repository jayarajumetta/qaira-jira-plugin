import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDeterministicGherkinScenarios,
  normalizeGherkinPreviewRequirements,
  normalizeGherkinScenario,
  normalizeGherkinScenarios,
  normalizeGherkinStoryDrafts
} from '../src/requirementGherkin.js';

test('Gherkin drafting uses the completed Story clauses without nesting Given inside When', () => {
  const [story] = normalizeGherkinStoryDrafts([{
    client_id: 'story-42',
    title: 'View release health',
    description: 'A release manager reviews quality health.',
    acceptance_criteria: [
      'Given a release manager has access when they open the release dashboard then current quality health is displayed'
    ]
  }]);
  const scenarios = buildDeterministicGherkinScenarios(story);

  assert.equal(scenarios.length, 1);
  assert.match(scenarios[0], /^Feature: View release health/m);
  assert.match(scenarios[0], /^Scenario: View release health/m);
  assert.match(scenarios[0], /^  Given a release manager has access$/m);
  assert.match(scenarios[0], /^  When they open the release dashboard$/m);
  assert.match(scenarios[0], /^  Then current quality health is displayed$/m);
  assert.doesNotMatch(scenarios[0], /When Given/i);
});

test('Gherkin validation rejects incomplete blocks and strips model code fences', () => {
  const valid = [
    '```gherkin',
    'Scenario: Save Story',
    '  Given an editable Story',
    '  When the owner saves it',
    '  Then the latest text is visible',
    '```'
  ].join('\n');

  assert.equal(normalizeGherkinScenario(valid)?.startsWith('Scenario: Save Story'), true);
  assert.equal(normalizeGherkinScenario('Scenario: Save Story\nGiven a Story\nThen it saves'), null);
});

test('Gherkin response normalization preserves client identity and complete scenario coverage', () => {
  const fallback = [
    {
      client_id: 'story-a',
      gherkin_scenarios: [
        'Scenario: A\n  Given precondition A\n  When action A\n  Then outcome A',
        'Scenario: A boundary\n  Given boundary A\n  When action A\n  Then outcome A'
      ]
    },
    {
      client_id: 'story-b',
      gherkin_scenarios: ['Scenario: B\n  Given precondition B\n  When action B\n  Then outcome B']
    }
  ];
  const normalized = normalizeGherkinPreviewRequirements([
    {
      client_id: 'story-b',
      gherkin_scenarios: ['Scenario: Better B\n  Given safe B\n  When action B\n  Then visible B']
    },
    {
      client_id: 'story-a',
      // Partial model output must not masquerade as full two-criterion coverage.
      gherkin_scenarios: ['Scenario: Partial A\n  Given safe A\n  When action A\n  Then visible A']
    }
  ], fallback);

  assert.deepEqual(normalized.requirements.map((item) => item.client_id), ['story-a', 'story-b']);
  assert.deepEqual(normalized.requirements[0].gherkin_scenarios, fallback[0].gherkin_scenarios);
  assert.match(normalized.requirements[1].gherkin_scenarios[0], /Better B/);
  assert.equal(normalized.repaired_count, 1);
  assert.deepEqual(normalizeGherkinScenarios(fallback[1].gherkin_scenarios), fallback[1].gherkin_scenarios);
});

test('Story AI routes and UI keep Gherkin as a non-blocking second stage', async () => {
  const root = new URL('../', import.meta.url);
  const [api, page, client, types] = await Promise.all([
    readFile(new URL('src/qairaApi.js', root), 'utf8'),
    readFile(new URL('static/qaira-ui/src/pages/RequirementsPage.tsx', root), 'utf8'),
    readFile(new URL('static/qaira-ui/src/lib/api.ts', root), 'utf8'),
    readFile(new URL('static/qaira-ui/src/types.ts', root), 'utf8')
  ]);

  assert.match(api, /'ai-description-rephrase', 'ai-gherkin-preview'/);
  assert.match(api, /pathname === '\/requirements\/ai-gherkin-preview'[\s\S]*qaira\.ai\.requirement_design/);
  assert.match(api, /exact_story_draft_used:\s*true/);
  assert.match(api, /function validatedGherkinScenarios[\s\S]*INVALID_GHERKIN/);
  assert.match(page, /setOptimizationSuggestion\(suggestion\);[\s\S]*try \{[\s\S]*previewGherkin/);
  assert.match(page, /optional Gherkin pass could not complete/);
  assert.match(page, /gherkin_scenarios:\s*parseGherkinScenarios\(nextDraft\.gherkinScenariosText\)/);
  assert.doesNotMatch(page, /appendGherkinSection/);
  assert.match(client, /gherkin_scenarios\?: string\[\]/);
  assert.match(types, /gherkin_scenarios\?: string\[\]/);
});
