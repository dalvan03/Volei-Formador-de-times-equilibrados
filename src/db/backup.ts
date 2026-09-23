import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, chmod, stat, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const exec = promisify(execFile);
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const BACKUP_RETENTION = 4;
export const backupFolder = () => path.resolve(process.env.BACKUP_DIR || 'backups');

export async function listBackups(folder: string) {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const entries = await readdir(folder, { withFileTypes: true });
  return entries.flatMap(entry => {
    const match = /^(?:before-deploy|before-seasons|automatic)-(\d+)\.dump$/.exec(entry.name);
    return entry.isFile() && match ? [{ name: entry.name, timestamp: Number(match[1]) }] : [];
  }).sort((a, b) => b.timestamp - a.timestamp);
}

export async function pruneBackups(folder: string) {
  for (const backup of (await listBackups(folder)).slice(BACKUP_RETENTION)) {
    await rm(path.join(folder, backup.name));
  }
}

export async function backupDatabase(prefix = 'before-seasons') {
  if (!['before-deploy', 'before-seasons', 'automatic'].includes(prefix)) throw new Error('Tipo de backup inválido');
  const folder = backupFolder();
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, `${prefix}-${Date.now()}.dump`);
  const temporary = `${file}.partial`;
  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5432/voleidb');
  try {
    await exec('pg_dump', ['--format=custom', '--file', temporary], { env: {
      ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      ...(url.searchParams.has('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode')! } : {}),
    }});
    await chmod(temporary, 0o600);
    if (!(await stat(temporary)).size) throw new Error('Backup vazio');
    await exec('pg_restore', ['--list', temporary]);
    await rename(temporary, file);
  } catch (err) {
    await rm(temporary, { force: true });
    throw err;
  }
  // Never delete an older backup until the new dump has passed validation.
  await pruneBackups(folder);
  console.log(`Backup validado: ${file}`);
  return file;
}

export async function backupIfDue(folder = backupFolder(), now = Date.now(), create = () => backupDatabase('automatic')) {
  const latest = (await listBackups(folder))[0];
  if (latest && now < latest.timestamp + BACKUP_INTERVAL_MS) return false;
  await create();
  return true;
}

export function startBackupScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await backupIfDue(); }
    catch { console.error('Falha no backup automático; nova tentativa em até 1 minuto.'); }
    finally { running = false; }
  };
  // The latest successful file persists the schedule across restarts and deploys.
  const timer = setInterval(() => { void tick(); }, 60000);
  timer.unref();
  void tick();
  return timer;
}
