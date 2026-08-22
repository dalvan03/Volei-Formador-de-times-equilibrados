import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  primaryKey,
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
export const balanceFeedbacks = pgTable('balance_feedbacks', {
  id: text('id').primaryKey(),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  evaluatorPhone: text('evaluator_phone').notNull(),
  wasBalanced: boolean('was_balanced').notNull(),
  strongerTeam: text('stronger_team'),
  createdAt: text('created_at').notNull(),
});

// 5. Avaliações de Estrelas aos Jogadores
export const ratingFeedbacks = pgTable('rating_feedbacks', {
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
});

// 6. Votos no Craque da Rodada (MVP)
export const mvpVotes = pgTable('mvp_votes', {
  id: text('id').primaryKey(),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  evaluatorPhone: text('evaluator_phone').notNull(),
  targetPlayerId: text('target_player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
});
