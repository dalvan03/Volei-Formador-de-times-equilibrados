import { client } from './index';


export async function runMigrationAndCalculations() {
  console.log('🔄 Verificando banco de dados relacional (PostgreSQL + Drizzle)...');

  try {
    // Garante a criação de todas as tabelas caso ainda não existam no Postgres
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        position TEXT,
        photo_url TEXT,
        avatar_bg TEXT NOT NULL,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        is_guest BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL,
        team_a_name TEXT NOT NULL,
        team_a_color TEXT NOT NULL,
        team_a_set_wins INTEGER NOT NULL DEFAULT 0,
        team_b_name TEXT NOT NULL,
        team_b_color TEXT NOT NULL,
        team_b_set_wins INTEGER NOT NULL DEFAULT 0,
        final_score_a INTEGER,
        final_score_b INTEGER,
        finalized_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team TEXT,
        is_present BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (match_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS balance_feedbacks (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        evaluator_player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        evaluator_phone TEXT NOT NULL,
        was_balanced BOOLEAN NOT NULL,
        stronger_team TEXT,
        created_at TEXT NOT NULL
      );

      ALTER TABLE balance_feedbacks ADD COLUMN IF NOT EXISTS evaluator_player_id TEXT REFERENCES players(id) ON DELETE CASCADE;


      CREATE TABLE IF NOT EXISTS rating_feedbacks (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        evaluator_phone TEXT NOT NULL,
        target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mvp_votes (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        evaluator_phone TEXT NOT NULL,
        target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL,
        user_phone TEXT,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Limpeza de duplicatas históricas para viabilizar índices únicos
      DELETE FROM balance_feedbacks a USING balance_feedbacks b
      WHERE a.ctid < b.ctid AND a.match_id = b.match_id AND REGEXP_REPLACE(a.evaluator_phone, '\\D', '', 'g') = REGEXP_REPLACE(b.evaluator_phone, '\\D', '', 'g');

      DELETE FROM rating_feedbacks a USING rating_feedbacks b
      WHERE a.ctid < b.ctid AND a.match_id = b.match_id AND REGEXP_REPLACE(a.evaluator_phone, '\\D', '', 'g') = REGEXP_REPLACE(b.evaluator_phone, '\\D', '', 'g') AND a.target_player_id = b.target_player_id;

      DELETE FROM mvp_votes a USING mvp_votes b
      WHERE a.ctid < b.ctid AND a.match_id = b.match_id AND REGEXP_REPLACE(a.evaluator_phone, '\\D', '', 'g') = REGEXP_REPLACE(b.evaluator_phone, '\\D', '', 'g');

      -- Garantir criação de constraints únicas formais para suporte perfeito ao ON CONFLICT do Drizzle ORM
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_feedbacks_match_evaluator_key') THEN
          ALTER TABLE balance_feedbacks ADD CONSTRAINT balance_feedbacks_match_evaluator_key UNIQUE (match_id, evaluator_phone);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rating_feedbacks_match_evaluator_target_key') THEN
          ALTER TABLE rating_feedbacks ADD CONSTRAINT rating_feedbacks_match_evaluator_target_key UNIQUE (match_id, evaluator_phone, target_player_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mvp_votes_match_evaluator_key') THEN
          ALTER TABLE mvp_votes ADD CONSTRAINT mvp_votes_match_evaluator_key UNIQUE (match_id, evaluator_phone);
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS balance_feedbacks_match_evaluator_idx ON balance_feedbacks (match_id, evaluator_phone);
      CREATE UNIQUE INDEX IF NOT EXISTS rating_feedbacks_match_evaluator_target_idx ON rating_feedbacks (match_id, evaluator_phone, target_player_id);
      CREATE UNIQUE INDEX IF NOT EXISTS mvp_votes_match_evaluator_idx ON mvp_votes (match_id, evaluator_phone);
    `);

    // 2. Auto-popular logs de auditoria retroativamente no banco se necessário
    console.log('📝 Verificando/Atualizando logs de auditoria históricos...');
    await client.unsafe(`
      -- Cadastros de Atletas
      INSERT INTO activity_logs (id, user_name, user_phone, action, description, category, created_at)
      SELECT
        'log_hist_p_' || id,
        name,
        phone,
        'Cadastro de Atleta',
        'Atleta ' || name || ' registrado no sistema.',
        'atleta',
        created_at::text
      FROM players
      ON CONFLICT (id) DO NOTHING;

      -- Criação de Partidas
      INSERT INTO activity_logs (id, user_name, user_phone, action, description, category, created_at)
      SELECT
        'log_hist_m_' || id,
        'Admin',
        NULL,
        'Criação de Partida',
        'Partida ' || COALESCE(title, date) || ' (' || team_a_name || ' vs ' || team_b_name || ') criada/agendada.',
        'partida',
        created_at
      FROM matches
      ON CONFLICT (id) DO NOTHING;

      -- Finalização de Partidas
      INSERT INTO activity_logs (id, user_name, user_phone, action, description, category, created_at)
      SELECT
        'log_hist_mf_' || id,
        'Admin',
        NULL,
        'Finalização de Partida',
        'Partida ' || COALESCE(title, date) || ' finalizada com placar ' || COALESCE(final_score_a, 0) || ' x ' || COALESCE(final_score_b, 0) || '.',
        'partida',
        COALESCE(finalized_at, created_at)
      FROM matches
      WHERE status = 'finalizada'
      ON CONFLICT (id) DO NOTHING;

      -- Avaliações da Rodada (Equilíbrio + Notas dos colegas juntas em ação única)
      INSERT INTO activity_logs (id, user_name, user_phone, action, description, category, created_at)
      SELECT
        'log_hist_bf_' || bf.id,
        COALESCE(
          (SELECT name FROM players WHERE id = bf.evaluator_player_id LIMIT 1),
          (SELECT name FROM players WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = REGEXP_REPLACE(bf.evaluator_phone, '\\D', '', 'g') LIMIT 1),
          'Atleta'
        ),
        bf.evaluator_phone,
        'Avaliação da Rodada',
        'Registrou avaliação da rodada (equilíbrio e notas dos colegas de time).',
        'voto',
        bf.created_at
      FROM balance_feedbacks bf
      ON CONFLICT (id) DO NOTHING;

      -- Votos no Craque da Partida (MVP) - log separado
      INSERT INTO activity_logs (id, user_name, user_phone, action, description, category, created_at)
      SELECT
        'log_hist_mv_' || mv.id,
        COALESCE(
          (SELECT name FROM players WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = REGEXP_REPLACE(mv.evaluator_phone, '\\D', '', 'g') LIMIT 1),
          'Atleta'
        ),
        mv.evaluator_phone,
        'Voto no Craque (MVP)',
        'Registrou voto anônimo para Craque da Partida.',
        'voto',
        mv.created_at
      FROM mvp_votes mv
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Logs de auditoria históricos prontos no PostgreSQL!');
  } catch (err) {
    throw err;
  }
}
