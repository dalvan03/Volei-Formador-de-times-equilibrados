import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupIfDue, BACKUP_INTERVAL_MS, listBackups, pruneBackups } from '../src/db/backup';

test('retenção mantém os quatro mais recentes entre backups automáticos e de publicação', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'volei-backup-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  for (const name of ['before-deploy-100.dump','before-seasons-200.dump','automatic-300.dump','automatic-400.dump','before-deploy-500.dump','automatic-600.dump','automatic-700.dump.partial','anotacoes.txt']) await writeFile(path.join(folder,name),'test');
  await mkdir(path.join(folder,'automatic-999.dump'));
  await pruneBackups(folder);
  assert.deepEqual((await listBackups(folder)).map(b => b.timestamp),[600,500,400,300]);
  const remaining = await readdir(folder);
  assert(remaining.includes('automatic-700.dump.partial'));
  assert(remaining.includes('anotacoes.txt'));
  assert(remaining.includes('automatic-999.dump'));
});

test('agenda vence em 7 dias, persiste em disco e falhas não removem backups nem adiam tentativa', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'volei-backup-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(path.join(folder,'before-deploy-1000.dump'),'valid');
  const due = 1000 + BACKUP_INTERVAL_MS;
  let calls = 0;
  const create = async () => { calls++; await writeFile(path.join(folder,`automatic-${due}.dump`),'valid'); return ''; };
  assert.equal(await backupIfDue(folder,due-1,create),false);
  await assert.rejects(backupIfDue(folder,due,async () => { throw new Error('dump failed'); }));
  assert.equal((await listBackups(folder)).length,1);
  assert.equal(await backupIfDue(folder,due,create),true);
  assert.equal(calls,1);
  assert.equal(await backupIfDue(folder,due+1,create),false);
});

test('sem backup anterior, executa imediatamente', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'volei-backup-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  let calls = 0;
  assert.equal(await backupIfDue(folder,Date.now(),async () => { calls++; return ''; }),true);
  assert.equal(calls,1);
});

test('dump ou validação falhando preserva todos os backups anteriores e remove o temporário', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const folder = await mkdtemp(path.join(tmpdir(), 'volei-backup-failure-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const bin = path.join(folder,'bin');
  await mkdir(bin);
  for (let i=1;i<=4;i++) await writeFile(path.join(folder,`automatic-${i}.dump`),'valid');
  await writeFile(path.join(bin,'pg_dump'),'#!/bin/sh\nprintf partial > "$3"\nexit 1\n',{mode:0o700});
  await writeFile(path.join(bin,'pg_restore'),'#!/bin/sh\nexit 1\n',{mode:0o700});
  const run = () => exec(process.execPath,['node_modules/tsx/dist/cli.mjs','src/db/backup-cli.ts'], {env:{...process.env,BACKUP_DIR:folder,PATH:bin+':'+process.env.PATH,DATABASE_URL:'postgres://test:test@localhost/test'}});
  await assert.rejects(run());
  assert.deepEqual((await readdir(folder)).sort(),['automatic-1.dump','automatic-2.dump','automatic-3.dump','automatic-4.dump','bin']);
  await writeFile(path.join(bin,'pg_dump'),'#!/bin/sh\nprintf dump > "$3"\nexit 0\n',{mode:0o700});
  await assert.rejects(run());
  assert.equal((await listBackups(folder)).length,4);
  assert(!(await readdir(folder)).some(name => name.endsWith('.partial')));
});
