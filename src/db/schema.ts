import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core';

// 1. Tabela de Jogadores (Sem acúmulo estático de wins/losses/draws/rating)
export const players = pgTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  position: text('position'),
  photoUrl: text('photo_url'),
  avatarBg: text('avatar_bg').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  isGuest: boolean('is_guest').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Tabela de Partidas
export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  title: text('title'),
  status: text('status').notNull(), // 'agendada' | 'em_andamento' | 'finalizada'
  teamAName: text('team_a_name').notNull(),
  teamAColor: text('team_a_color').notNull(),
  teamASetWins: integer('team_a_set_wins').default(0).notNull(),
  teamBName: text('team_b_name').notNull(),
  teamBColor: text('team_b_color').notNull(),
  teamBSetWins: integer('team_b_set_wins').default(0).notNull(),
  finalScoreA: integer('final_score_a'),
  finalScoreB: integer('final_score_b'),
  finalizedAt: text('finalized_at'),
  createdAt: text('created_at').notNull(),
  seasonId: text('season_id'),
  votingClosesAt: text('voting_closes_at'),
});

// 3. Relacionamento Jogadores x Partidas (Time A, Time B e Presença)
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    team: text('team'), // 'teamA' | 'teamB' | null
    isPresent: boolean('is_present').default(true).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.playerId] }),
  ]
);

// 4. Avaliações de Equilíbrio
export const balanceFeedbacks = pgTable(
  'balance_feedbacks',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    evaluatorPlayerId: text('evaluator_player_id')
      .references(() => players.id, { onDelete: 'cascade' }),
    evaluatorPhone: text('evaluator_phone').notNull(),
    wasBalanced: boolean('was_balanced').notNull(),
    strongerTeam: text('stronger_team'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    unique('balance_feedbacks_match_evaluator_key').on(table.matchId, table.evaluatorPhone),
  ]
);


// 5. Avaliações de Estrelas aos Jogadores
export const ratingFeedbacks = pgTable(
  'rating_feedbacks',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    evaluatorPhone: text('evaluator_phone').notNull(),
    targetPlayerId: text('target_player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    unique('rating_feedbacks_match_evaluator_target_key').on(
      table.matchId,
      table.evaluatorPhone,
      table.targetPlayerId
    ),
  ]
);

// 6. Votos no Craque da Rodada (MVP)
export const mvpVotes = pgTable(
  'mvp_votes',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    evaluatorPhone: text('evaluator_phone').notNull(),
    targetPlayerId: text('target_player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    unique('mvp_votes_match_evaluator_key').on(table.matchId, table.evaluatorPhone),
  ]
);

// 7. Logs de Auditoria de Ações do Sistema (Apenas Admin)
export const activityLogs = pgTable('activity_logs', {
  id: text('id').primaryKey(),
  userName: text('user_name').notNull(),
  userPhone: text('user_phone'),
  action: text('action').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(), // 'partida' | 'atleta' | 'voto' | 'auth' | 'admin'
  createdAt: text('created_at').notNull(),
});

export const seasons = pgTable('seasons', {
  id: text('id').primaryKey(),
  closed: boolean('closed').notNull().default(false),
});
export const seasonResults = pgTable('season_results', {
  seasonId: text('season_id').notNull().references(() => seasons.id),
  playerId: text('player_id').notNull().references(() => players.id),
  publicResult: jsonb('public_result').notNull(),
  rating: doublePrecision('rating').notNull(),
  weight: doublePrecision('weight').notNull(),
  votesReceived: integer('votes_received').notNull(),
  medal: text('medal'),
}, t => [primaryKey({ columns: [t.seasonId, t.playerId] })]);
export const credentials = pgTable('credentials', {
  playerId: text('player_id').primaryKey().references(() => players.id),
  pinHash: text('pin_hash').notNull(),
});
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  playerId: text('player_id').notNull().references(() => players.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const authAttempts = pgTable('auth_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
});

// No cascade: deleting/recreating a match must not erase delivery deduplication.
export const whatsappDeliveries = pgTable('whatsapp_deliveries', {
  matchId: text('match_id').notNull(),
  kind: text('kind').notNull(),
  groupJid: text('group_jid').notNull(),
  status: text('status').notNull(),
  messageId: text('message_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.matchId, t.kind] })]);
