import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { runtimeConfig } from './runtime-config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const file = runtimeConfig.databasePath;
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
db.exec(readFileSync(resolve(root, 'src/infrastructure/schema.sql'), 'utf8'));

const now = () => new Date().toISOString();
const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
if (!hasColumn('projects', 'short_name')) db.exec("ALTER TABLE projects ADD COLUMN short_name TEXT NOT NULL DEFAULT '';");
if (!hasColumn('users', 'color')) db.exec("ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT '#194f45';");
if (!hasColumn('project_processes', 'assignee_user_id')) db.exec('ALTER TABLE project_processes ADD COLUMN assignee_user_id INTEGER REFERENCES users(id);');
const seedUser = (username, displayName, role, password) => {
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return;
  const value = hashPassword(password);
  db.prepare('INSERT INTO users(username,display_name,password_hash,password_salt,role,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(username, displayName, value.hash, value.salt, role, role === 'admin' ? '#194f45' : '#2f6fa3', now(), now());
};
seedUser('admin', '管理者', 'admin', process.env.ADMIN_INITIAL_PASSWORD ?? 'wellnot-admin');
seedUser('worker', '従業員', 'employee', process.env.WORKER_INITIAL_PASSWORD ?? 'wellnot-worker');

const processNames = [['材料発注','発'],['材料納入','納'],['加工','加'],['組立','組'],['溶接','溶'],['仕上','仕'],['塗装','塗'],['検査','検'],['出荷','出'],['現場搬入','搬'],['現場取付','取'],['その他','他']];
const addProcess = db.prepare('INSERT OR IGNORE INTO process_masters(name,abbreviation,sort_order) VALUES(?,?,?)');
processNames.forEach(([name, abbreviation], index) => addProcess.run(name, abbreviation, index + 1));
const cautions = ['黒板撮影必須','工程写真必須','完成写真必須','ミルシート提出','客先立会','その他'];
const addCaution = db.prepare('INSERT OR IGNORE INTO caution_masters(name,sort_order) VALUES(?,?)');
cautions.forEach((name, index) => addCaution.run(name, index + 1));
const estimateMasters = [
  ['労務費','現場労務費','h',0],['労務費','工場労務費','h',0],
  ['材料費','鋼材','式',0],['材料費','ボルト','式',0],['材料費','溶接材料','式',0],
  ['機械','高所作業車','日',0],['機械','ユニック','日',0],['機械','コンプレッサー','日',0],
  ['外注','塗装','式',0],['外注','メッキ','式',0],
  ['経費','車両費','式',0],['経費','交通費','式',0]
];
const addEstimateMaster = db.prepare('INSERT OR IGNORE INTO estimate_item_masters(category,name,unit,standard_unit_price,sort_order) VALUES(?,?,?,?,?)');
estimateMasters.forEach(([category, name, unit, price], index) => addEstimateMaster.run(category, name, unit, price, index + 1));

export function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
export function audit(actor, action, entityType, entityId, details = {}) {
  db.prepare('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(actor?.id ?? null, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details), now());
}
export { now, file as databasePath };
