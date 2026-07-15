-- =========================
-- USERS & ROLES
-- =========================

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  avatar_data_url TEXT,
  is_workspace_admin BOOLEAN NOT NULL DEFAULT FALSE,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  google_sub TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id)
);

-- =========================
-- PROJECTS & ACCESS
-- =========================

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project_user
  ON project_members (project_id, user_id);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_role_permissions_permission
  ON role_permissions (permission_id);

-- =========================
-- APP TYPES (DESIGN BOUNDARY)
-- =========================

CREATE TABLE app_types (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('web','api','android','ios','unified')),
  is_unified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- =========================
-- AI KNOWLEDGE REPO
-- =========================

CREATE TABLE ai_knowledge_repo (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text', 'url', 'video_url', 'file', 'pdf', 'image', 'markdown')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding JSONB,
  source_uri TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (app_type_id) REFERENCES app_types(id)
);

CREATE INDEX idx_ai_knowledge_repo_scope
  ON ai_knowledge_repo (project_id, app_type_id, is_active, created_at DESC);

-- =========================
-- REQUIREMENTS
-- =========================

CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  external_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  sprint TEXT,
  fix_version TEXT,
  release TEXT,
  priority INTEGER DEFAULT 3,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_result TEXT,
  actual_result TEXT,
  severity TEXT,
  priority TEXT,
  environment TEXT,
  build TEXT,
  jira_bug_key TEXT,
  linked_test_run_id TEXT,
  assignee_id TEXT,
  root_cause TEXT,
  retest_result TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS steps_to_reproduce TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS expected_result TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS actual_result TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS environment TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS build TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS jira_bug_key TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS linked_test_run_id TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assignee_id TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS retest_result TEXT;

CREATE TABLE requirement_defects (
  requirement_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  link_source TEXT NOT NULL DEFAULT 'manual' CHECK(link_source IN ('manual','automatic')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requirement_id, issue_id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (issue_id) REFERENCES feedback(id) ON DELETE CASCADE
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('llm','jira','email','google_auth','google_drive','github','testengine','local-desktop','cloudrun','ops')),
  name TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT,
  model TEXT,
  project_key TEXT,
  username TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('signup','password_reset')),
  code_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_verification_codes_lookup
  ON auth_verification_codes (email, purpose, created_at DESC);

-- =========================
-- TEST DESIGN
-- =========================

CREATE TABLE test_suites (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  app_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id),
  FOREIGN KEY (parent_id) REFERENCES test_suites(id)
);

CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  app_type_id TEXT,
  suite_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  external_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  automated TEXT NOT NULL DEFAULT 'no' CHECK(automated IN ('yes','no')),
  automation_status TEXT NOT NULL DEFAULT 'not_automated' CHECK(automation_status IN ('not_automated','ready','incomplete')),
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'active',
  requirement_id TEXT,
  reviewer_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(review_status IN ('not_requested','pending','accepted','changes_requested')),
  review_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_quality_score INTEGER CHECK(ai_quality_score IS NULL OR (ai_quality_score >= 0 AND ai_quality_score <= 100)),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id),
  FOREIGN KEY (suite_id) REFERENCES test_suites(id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id)
);

CREATE TABLE requirement_test_cases (
  requirement_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  PRIMARY KEY (requirement_id, test_case_id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE TABLE suite_test_cases (
  suite_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (suite_id, test_case_id),
  FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_case_modules (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  app_type_id TEXT NOT NULL REFERENCES app_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_case_module_cases (
  module_id TEXT NOT NULL REFERENCES test_case_modules(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (module_id, test_case_id)
);

CREATE TABLE IF NOT EXISTS test_case_defects (
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  link_source TEXT NOT NULL DEFAULT 'manual' CHECK(link_source IN ('manual', 'automatic')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_case_id, issue_id)
);

CREATE TABLE test_steps (
  id TEXT PRIMARY KEY,
  test_case_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  action TEXT,
  expected_result TEXT,
  step_type TEXT,
  automation_code TEXT,
  api_request JSONB,
  group_id TEXT,
  group_name TEXT,
  group_kind TEXT,
  reusable_group_id TEXT,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
);

CREATE TABLE shared_step_groups (
  id TEXT PRIMARY KEY,
  display_id TEXT UNIQUE,
  app_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_shared_step_groups_app_type
  ON shared_step_groups (app_type_id, updated_at DESC);

CREATE INDEX idx_test_steps_case_group
  ON test_steps (test_case_id, group_id, step_order);

CREATE TABLE test_environments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT,
  browser TEXT,
  notes TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_environments_project_scope
  ON test_environments (project_id, app_type_id);

CREATE TABLE test_configurations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  browser TEXT,
  mobile_os TEXT,
  platform_version TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_configurations_project_scope
  ON test_configurations (project_id, app_type_id);

CREATE TABLE test_data_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('key_value', 'table')),
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_data_sets_project_scope
  ON test_data_sets (project_id, app_type_id);

-- =========================
-- EXECUTION
-- =========================

CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  name TEXT,
  trigger TEXT CHECK(trigger IN ('manual','ci','local')),
  status TEXT CHECK(status IN ('queued','running','passed','failed','skipped','blocked','retrying','cancelled','aborted','partially_completed','completed')),
  execution_mode TEXT NOT NULL DEFAULT 'remote' CHECK(execution_mode IN ('local','remote','scheduled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  worker_id TEXT,
  duration_ms INTEGER,
  test_environment_id TEXT,
  test_environment_name TEXT,
  test_environment_snapshot JSONB,
  test_configuration_id TEXT,
  test_configuration_name TEXT,
  test_configuration_snapshot JSONB,
  test_data_set_id TEXT,
  test_data_set_name TEXT,
  test_data_set_snapshot JSONB,
  release TEXT,
  sprint TEXT,
  build TEXT,
  assigned_to TEXT,
  assigned_to_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (app_type_id) REFERENCES app_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE execution_suites (
  execution_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  suite_name TEXT,
  PRIMARY KEY (execution_id, suite_id),
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_suites_execution_suite
  ON execution_suites (execution_id, suite_id);

CREATE TABLE execution_case_snapshots (
  execution_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  test_case_title TEXT NOT NULL,
  test_case_description TEXT,
  external_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  suite_id TEXT,
  suite_name TEXT,
  priority INTEGER,
  status TEXT,
  parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  parameter_template_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  suite_parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  suite_parameter_template_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (execution_id, test_case_id),
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE TABLE execution_step_snapshots (
  execution_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  snapshot_step_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  action TEXT,
  expected_result TEXT,
  step_type TEXT,
  automation_code TEXT,
  api_request JSONB,
  group_id TEXT,
  group_name TEXT,
  group_kind TEXT,
  reusable_group_id TEXT,
  PRIMARY KEY (execution_id, snapshot_step_id),
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_case_snapshots_execution_id
  ON execution_case_snapshots (execution_id, sort_order);

CREATE INDEX idx_execution_step_snapshots_execution_case
  ON execution_step_snapshots (execution_id, test_case_id, step_order);

CREATE TABLE execution_results (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  test_case_title TEXT,
  suite_id TEXT,
  suite_name TEXT,
  app_type_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('running','passed','failed','blocked')),
  duration_ms INTEGER,
  error TEXT,
  logs TEXT,
  external_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  defects JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (execution_id) REFERENCES executions(id),
  FOREIGN KEY (app_type_id) REFERENCES app_types(id),
  FOREIGN KEY (executed_by) REFERENCES users(id)
);

CREATE TABLE suite_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  suite_id TEXT,
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','passed','failed','skipped','blocked','retrying','cancelled','aborted','partially_completed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  worker_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'remote' CHECK(execution_mode IN ('local','remote','scheduled')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_suite_runs_run
  ON suite_runs (run_id, status);

CREATE TABLE test_case_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  suite_run_id TEXT,
  test_case_id TEXT,
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','passed','failed','skipped','blocked','retrying','cancelled','aborted','partially_completed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  worker_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'remote' CHECK(execution_mode IN ('local','remote','scheduled')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES executions(id) ON DELETE CASCADE,
  FOREIGN KEY (suite_run_id) REFERENCES suite_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_case_runs_suite
  ON test_case_runs (suite_run_id, status);

CREATE INDEX idx_test_case_runs_run_case
  ON test_case_runs (run_id, test_case_id);

CREATE TABLE step_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  test_case_run_id TEXT,
  step_id TEXT,
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','passed','failed','skipped','blocked','retrying','cancelled','aborted','partially_completed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  worker_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'remote' CHECK(execution_mode IN ('local','remote','scheduled')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES executions(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_run_id) REFERENCES test_case_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_step_runs_case
  ON step_runs (test_case_run_id, status);

CREATE TABLE execution_capacity (
  engine_type TEXT PRIMARY KEY CHECK(engine_type IN ('api','web','android')),
  max_parallel INTEGER NOT NULL DEFAULT 1,
  current_running INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  healthy_workers INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE worker_heartbeat (
  worker_id TEXT PRIMARY KEY,
  engine_type TEXT CHECK(engine_type IS NULL OR engine_type IN ('api','web','android')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_job_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_worker_heartbeat_seen
  ON worker_heartbeat (last_seen_at DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  project_id TEXT,
  run_id TEXT,
  target_url TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_status
  ON notifications (user_id, status, created_at DESC);

CREATE TABLE workspace_transactions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  app_type_id TEXT,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_kind TEXT,
  related_id TEXT,
  created_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_workspace_transactions_scope
  ON workspace_transactions (project_id, app_type_id, created_at DESC);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- LATEST RUNTIME CONTRACT
-- =========================

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_type_check;
ALTER TABLE integrations
  ADD CONSTRAINT integrations_type_check
  CHECK (type IN ('llm', 'jira', 'email', 'google_auth', 'google_drive', 'github', 'testengine', 'ops'));

CREATE INDEX IF NOT EXISTS idx_integrations_type_active
  ON integrations (type, is_active);

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS external_references JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS sprint TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS fix_version TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS release TEXT;

CREATE TABLE IF NOT EXISTS requirement_defects (
  requirement_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  link_source TEXT NOT NULL DEFAULT 'manual' CHECK(link_source IN ('manual','automatic')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requirement_id, issue_id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (issue_id) REFERENCES feedback(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_requirement_defects_issue
  ON requirement_defects (issue_id);

ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS parallel_enabled BOOLEAN;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS parallel_count INTEGER;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
UPDATE test_suites SET labels = '[]'::jsonb WHERE labels IS NULL;

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS ai_generation_source TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS ai_generation_review_status TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS ai_generation_job_id TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS external_references JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS automation_status TEXT NOT NULL DEFAULT 'not_automated';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS reviewer_id TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS review_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;

UPDATE test_cases SET labels = '[]'::jsonb WHERE labels IS NULL;
UPDATE test_cases SET review_status = 'not_requested' WHERE review_status IS NULL OR BTRIM(review_status) = '';
UPDATE test_cases SET review_history = '[]'::jsonb WHERE review_history IS NULL;

UPDATE test_cases
SET automation_status = CASE
  WHEN automated = 'yes' AND automation_status = 'not_automated' THEN 'ready'
  WHEN automated <> 'yes' THEN 'not_automated'
  ELSE automation_status
END;

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_automated_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_automated_check
  CHECK (automated IN ('yes', 'no'));

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_automation_status_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_automation_status_check
  CHECK (automation_status IN ('not_automated', 'ready', 'incomplete'));

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_ai_generation_source_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_ai_generation_source_check
  CHECK (ai_generation_source IS NULL OR ai_generation_source IN ('scheduler'));

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_ai_generation_review_status_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_ai_generation_review_status_check
  CHECK (ai_generation_review_status IS NULL OR ai_generation_review_status IN ('pending', 'accepted'));

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_review_status_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_review_status_check
  CHECK (review_status IN ('not_requested', 'pending', 'accepted', 'changes_requested'));

ALTER TABLE test_cases DROP CONSTRAINT IF EXISTS test_cases_ai_quality_score_check;
ALTER TABLE test_cases
  ADD CONSTRAINT test_cases_ai_quality_score_check
  CHECK (ai_quality_score IS NULL OR (ai_quality_score >= 0 AND ai_quality_score <= 100));

CREATE INDEX IF NOT EXISTS idx_test_cases_app_status_created
  ON test_cases (app_type_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_cases_ai_generation_review
  ON test_cases (app_type_id, ai_generation_source, ai_generation_review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_cases_reviewer_status
  ON test_cases (reviewer_id, review_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_case_modules_app_type
  ON test_case_modules (app_type_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_case_module_cases_case
  ON test_case_module_cases (test_case_id);

CREATE INDEX IF NOT EXISTS idx_test_case_module_cases_module_sort
  ON test_case_module_cases (module_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_test_case_defects_issue
  ON test_case_defects (issue_id);

ALTER TABLE shared_step_groups ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE shared_step_groups ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS assigned_to_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS release TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS sprint TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS build TEXT;
UPDATE executions
SET assigned_to_ids = CASE
  WHEN assigned_to IS NULL OR BTRIM(assigned_to) = '' THEN '[]'::jsonb
  ELSE jsonb_build_array(assigned_to)
END
WHERE assigned_to_ids IS NULL OR assigned_to_ids = '[]'::jsonb;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS parallel_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS parallel_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_trigger_check;
ALTER TABLE executions
  ADD CONSTRAINT executions_trigger_check
  CHECK (trigger IN ('manual', 'ci', 'local'));

ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE executions
  ADD CONSTRAINT executions_status_check
  CHECK (status IN ('queued', 'running', 'passed', 'failed', 'skipped', 'blocked', 'retrying', 'cancelled', 'aborted', 'partially_completed', 'completed'));

CREATE TABLE IF NOT EXISTS execution_schedules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'once',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  suite_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_case_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_environment_id TEXT,
  test_configuration_id TEXT,
  test_data_set_id TEXT,
  release TEXT,
  sprint TEXT,
  build TEXT,
  assigned_to TEXT,
  assigned_to_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE execution_schedules ADD COLUMN IF NOT EXISTS release TEXT;
ALTER TABLE execution_schedules ADD COLUMN IF NOT EXISTS sprint TEXT;
ALTER TABLE execution_schedules ADD COLUMN IF NOT EXISTS build TEXT;
ALTER TABLE execution_schedules ADD COLUMN IF NOT EXISTS assigned_to_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE execution_schedules
SET assigned_to_ids = CASE
  WHEN assigned_to IS NULL OR BTRIM(assigned_to) = '' THEN '[]'::jsonb
  ELSE jsonb_build_array(assigned_to)
END
WHERE assigned_to_ids IS NULL OR assigned_to_ids = '[]'::jsonb;

ALTER TABLE execution_schedules DROP CONSTRAINT IF EXISTS execution_schedules_cadence_check;
ALTER TABLE execution_schedules
  ADD CONSTRAINT execution_schedules_cadence_check
  CHECK (cadence IN ('once', 'daily', 'weekly', 'monthly'));

CREATE INDEX IF NOT EXISTS idx_execution_schedules_project_next_run
  ON execution_schedules (project_id, next_run_at ASC);

ALTER TABLE execution_case_snapshots ADD COLUMN IF NOT EXISTS suite_parameter_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE execution_case_snapshots ADD COLUMN IF NOT EXISTS parameter_template_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE execution_case_snapshots ADD COLUMN IF NOT EXISTS suite_parameter_template_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE execution_case_snapshots ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE execution_case_snapshots ADD COLUMN IF NOT EXISTS external_references JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE execution_results ADD COLUMN IF NOT EXISTS external_references JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE execution_results ADD COLUMN IF NOT EXISTS defects JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_suite_test_cases_test_case_sort
  ON suite_test_cases (test_case_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_requirement_test_cases_test_case
  ON requirement_test_cases (test_case_id);

CREATE INDEX IF NOT EXISTS idx_execution_results_execution_created_at
  ON execution_results (execution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_results_case_created_at
  ON execution_results (test_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_results_app_type_created_at
  ON execution_results (app_type_id, created_at DESC);

CREATE TABLE IF NOT EXISTS test_engine_jobs (
  id TEXT PRIMARY KEY,
  engine_run_id TEXT NOT NULL UNIQUE,
  integration_id TEXT,
  project_id TEXT NOT NULL,
  app_type_id TEXT,
  app_type_kind TEXT NOT NULL DEFAULT 'web',
  engine_class TEXT NOT NULL DEFAULT 'web' CHECK (engine_class IN ('api', 'web', 'android')),
  engine_max_workers INTEGER NOT NULL DEFAULT 1,
  execution_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  test_case_title TEXT NOT NULL,
  transaction_id TEXT,
  engine_host TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'running', 'completed', 'failed', 'aborted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_test_engine_jobs_queue
  ON test_engine_jobs (status, engine_class, app_type_kind, engine_host, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_test_engine_jobs_execution_case
  ON test_engine_jobs (execution_id, test_case_id);

CREATE TABLE IF NOT EXISTS ai_test_case_generation_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  app_type_id TEXT NOT NULL,
  integration_id TEXT,
  requirement_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_cases_per_requirement INTEGER NOT NULL DEFAULT 8,
  parallel_requirement_limit INTEGER NOT NULL DEFAULT 1,
  additional_context TEXT,
  external_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ,
  total_requirements INTEGER NOT NULL DEFAULT 0,
  processed_requirements INTEGER NOT NULL DEFAULT 0,
  generated_cases_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ai_test_case_generation_jobs DROP CONSTRAINT IF EXISTS ai_test_case_generation_jobs_status_check;
ALTER TABLE ai_test_case_generation_jobs
  ADD CONSTRAINT ai_test_case_generation_jobs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_ai_test_case_generation_jobs_scope_status
  ON ai_test_case_generation_jobs (app_type_id, status, next_run_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_test_case_generation_jobs_project_created
  ON ai_test_case_generation_jobs (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_learning_cache (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  app_type_id TEXT,
  test_case_id TEXT,
  page_url TEXT,
  page_key TEXT NOT NULL,
  locator_intent TEXT NOT NULL,
  locator TEXT NOT NULL,
  locator_kind TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ai_builder',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (app_type_id) REFERENCES app_types(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_learning_cache_unique
  ON automation_learning_cache (app_type_id, page_key, locator_intent, locator);

CREATE INDEX IF NOT EXISTS idx_automation_learning_cache_scope
  ON automation_learning_cache (project_id, app_type_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_transactions_related
  ON workspace_transactions (related_kind, related_id, created_at DESC);

CREATE TABLE IF NOT EXISTS batch_process_jobs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES workspace_transactions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_process_jobs_transaction
  ON batch_process_jobs (transaction_id);

CREATE INDEX IF NOT EXISTS idx_batch_process_jobs_queue
  ON batch_process_jobs (status, next_run_at, created_at ASC);

CREATE TABLE IF NOT EXISTS workspace_transaction_events (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  phase TEXT,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES workspace_transactions(id) ON DELETE CASCADE
);

ALTER TABLE workspace_transaction_events DROP CONSTRAINT IF EXISTS workspace_transaction_events_level_check;
ALTER TABLE workspace_transaction_events
  ADD CONSTRAINT workspace_transaction_events_level_check
  CHECK (level IN ('info', 'success', 'warning', 'error'));

CREATE INDEX IF NOT EXISTS idx_workspace_transaction_events_lookup
  ON workspace_transaction_events (transaction_id, created_at ASC);

CREATE TABLE IF NOT EXISTS workspace_transaction_artifacts (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES workspace_transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_transaction_artifacts_lookup
  ON workspace_transaction_artifacts (transaction_id, created_at DESC);
