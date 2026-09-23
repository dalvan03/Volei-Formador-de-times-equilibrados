import { backupDatabase } from './backup';
import { client } from './index';
import { runMigrationAndCalculations } from './services';

// Explicit deployment step: never run the old startup migration before the backup.
export async function migrate() {
  const [{ exists }] = await client`SELECT to_regclass('public.seasons') IS NOT NULL AS exists`;
  const [{ notifications }] = await client`SELECT to_regclass('public.whatsapp_deliveries') IS NOT NULL AS notifications`;
  const [reminder] = await client`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.whatsapp_deliveries') AND conname='whatsapp_deliveries_kind_check' AND pg_get_constraintdef(oid) LIKE '%mvp_reminder%') AS ready`;
  if (exists && notifications && reminder.ready) return;
  await backupDatabase();
  if (!exists) {
  await runMigrationAndCalculations();
  await client.begin(async sql => {
    await sql`SELECT pg_advisory_xact_lock(260917)`;
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS seasons (id TEXT PRIMARY KEY, closed BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE IF NOT EXISTS season_results (
        season_id TEXT NOT NULL REFERENCES seasons(id), player_id TEXT NOT NULL REFERENCES players(id),
        public_result JSONB NOT NULL, rating DOUBLE PRECISION NOT NULL, weight DOUBLE PRECISION NOT NULL,
        votes_received INTEGER NOT NULL, medal TEXT, PRIMARY KEY (season_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS credentials (player_id TEXT PRIMARY KEY REFERENCES players(id), pin_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), expires_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start TIMESTAMPTZ NOT NULL, blocked_until TIMESTAMPTZ);
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id TEXT;
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS voting_closes_at TEXT;
      UPDATE matches SET season_id = substring(date,1,4) || '-Q' || ceil(substring(date,6,2)::numeric / 3)::int;
      UPDATE matches SET voting_closes_at = LEAST(
        COALESCE(finalized_at, created_at)::timestamptz + interval '96 hours',
        (date_trunc('quarter', date::date::timestamp) + interval '3 months') AT TIME ZONE 'America/Sao_Paulo'
      )::text WHERE status = 'finalizada';
      -- Preserve already-awarded MVPs: do not reopen a legacy 24-hour window.
      UPDATE matches SET voting_closes_at = LEAST(voting_closes_at::timestamptz,
        COALESCE(finalized_at, created_at)::timestamptz + interval '24 hours')::text
      WHERE status = 'finalizada' AND COALESCE(finalized_at, created_at)::timestamptz + interval '24 hours' <= now();
      INSERT INTO seasons(id) VALUES ('2026-Q3') ON CONFLICT DO NOTHING;
      CREATE INDEX IF NOT EXISTS matches_season_idx ON matches(season_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    `);
  });
  }
  await client.begin(async sql => {
    await sql`SELECT pg_advisory_xact_lock(260917)`;
    await sql`CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
      match_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('reminder','mvp','mvp_reminder')),
      group_jid TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('sending','accepted','uncertain','skipped')),
      message_id TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (match_id, kind)
    )`;
    await sql`ALTER TABLE whatsapp_deliveries DROP CONSTRAINT IF EXISTS whatsapp_deliveries_kind_check`;
    await sql`ALTER TABLE whatsapp_deliveries ADD CONSTRAINT whatsapp_deliveries_kind_check CHECK (kind IN ('reminder','mvp','mvp_reminder'))`;
  });
}

migrate().then(() => console.log('Migração concluída.')).catch(err => { console.error('Migração interrompida:', err.message); process.exitCode = 1; }).finally(() => client.end());
