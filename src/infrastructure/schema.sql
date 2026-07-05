PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('employee','admin')), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS process_masters (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, abbreviation TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS caution_masters (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, job_number TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL REFERENCES customers(id),
  construction_name TEXT NOT NULL, start_date TEXT, material_order_date TEXT, material_delivery_date TEXT, due_date TEXT NOT NULL,
  special_notes TEXT NOT NULL DEFAULT '', site_notes TEXT NOT NULL DEFAULT '', drawing_management INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed')),
  locked_at TEXT, completed_at TEXT, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drawings (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), drawing_number TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
  UNIQUE(project_id, drawing_number)
);
CREATE TABLE IF NOT EXISTS project_cautions (
  project_id INTEGER NOT NULL REFERENCES projects(id), caution_id INTEGER NOT NULL REFERENCES caution_masters(id), PRIMARY KEY(project_id,caution_id)
);
CREATE TABLE IF NOT EXISTS project_processes (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), process_master_id INTEGER NOT NULL REFERENCES process_masters(id),
  drawing_id INTEGER REFERENCES drawings(id), sequence INTEGER NOT NULL, planned_start_date TEXT, planned_end_date TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
  started_at TEXT, completed_at TEXT, version INTEGER NOT NULL DEFAULT 1, updated_by INTEGER NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL,
  UNIQUE(project_id, sequence), CHECK(planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
);
CREATE TABLE IF NOT EXISTS work_memos (
  id INTEGER PRIMARY KEY, project_process_id INTEGER NOT NULL REFERENCES project_processes(id), memo TEXT NOT NULL,
  work_date TEXT, hours REAL CHECK(hours IS NULL OR hours >= 0), confirmed INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), label TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actual_costs (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), category TEXT NOT NULL CHECK(category IN ('material','outsourcing')),
  label TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, incurred_on TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS improvement_memos (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), memo TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deadline_changes (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), old_due_date TEXT NOT NULL, new_due_date TEXT NOT NULL,
  reason TEXT NOT NULL, changed_by INTEGER NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS export_history (
  id INTEGER PRIMARY KEY, export_type TEXT NOT NULL, period_start TEXT, period_end TEXT,
  exported_by INTEGER NOT NULL REFERENCES users(id), exported_at TEXT NOT NULL, parameters_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, actor_user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_due ON projects(due_date);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_process_schedule ON project_processes(planned_start_date, planned_end_date);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_exports_created ON export_history(exported_at);

