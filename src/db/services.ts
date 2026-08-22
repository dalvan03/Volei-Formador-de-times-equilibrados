import fs from 'fs';
import path from 'path';
import { db, client } from './index';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

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
        evaluator_phone TEXT NOT NULL,
        was_balanced BOOLEAN NOT NULL,
        stronger_team TEXT,
        created_at TEXT NOT NULL
      );

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
    `);

    const existingPlayers = await db.select().from(schema.players);
    const jsonDbPath = path.join(process.cwd(), 'data', 'db.json');

    if (existingPlayers.length === 0 && fs.existsSync(jsonDbPath)) {
      console.log('📦 Migrando dados legados do db.json para o PostgreSQL relacional...');
      const raw = fs.readFileSync(jsonDbPath, 'utf-8');
      const data = JSON.parse(raw);

      // 1. Migrar Jogadores
      if (Array.isArray(data.players)) {
        for (const p of data.players) {
          await db.insert(schema.players).values({
            id: p.id,
            name: p.name,
            phone: p.phone || '',
            position: p.position || null,
            photoUrl: p.photoUrl || null,
            avatarBg: p.avatarBg || 'bg-blue-600',
            isAdmin: p.isAdmin || false,
            active: p.active !== false,
            isGuest: p.isGuest || false,
          }).onConflictDoNothing();
        }
      }

      // 2. Migrar Partidas e Seus Jogadores (matchPlayers)
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          await db.insert(schema.matches).values({
            id: m.id,
            date: m.date,
            title: m.title || null,
            status: m.status,
            teamAName: m.teamA?.name || 'Time A',
            teamAColor: m.teamA?.color || 'bg-blue-600',
            teamASetWins: m.teamA?.setWins ?? m.finalScore?.teamASets ?? 0,
            teamBName: m.teamB?.name || 'Time B',
            teamBColor: m.teamB?.color || 'bg-amber-600',
            teamBSetWins: m.teamB?.setWins ?? m.finalScore?.teamBSets ?? 0,
            finalScoreA: m.finalScore?.teamASets ?? null,
            finalScoreB: m.finalScore?.teamBSets ?? null,
            finalizedAt: m.finalizedAt || null,
            createdAt: m.createdAt || new Date().toISOString(),
          }).onConflictDoNothing();

          // Inserir jogadores no relacionamento matchPlayers
          const presentIds: string[] = m.presentPlayerIds || [];
          const teamAIds: string[] = m.teamA?.playerIds || [];
          const teamBIds: string[] = m.teamB?.playerIds || [];

          const allMatchPlayers = Array.from(
            new Set([...presentIds, ...teamAIds, ...teamBIds])
          );

          for (const pId of allMatchPlayers) {
            // Verifica se o jogador existe no banco
            const pExists = await db
              .select()
              .from(schema.players)
              .where(eq(schema.players.id, pId));
            if (pExists.length > 0) {
              const team = teamAIds.includes(pId)
                ? 'teamA'
                : teamBIds.includes(pId)
                ? 'teamB'
                : null;
              const isPresent = presentIds.includes(pId);

              await db
                .insert(schema.matchPlayers)
                .values({
                  matchId: m.id,
                  playerId: pId,
                  team,
                  isPresent,
                })
                .onConflictDoNothing();
            }
          }
        }
      }

      // 3. Migrar Feedbacks de Equilíbrio
      if (Array.isArray(data.balanceFeedbacks)) {
        for (const bf of data.balanceFeedbacks) {
          await db.insert(schema.balanceFeedbacks).values({
            id: bf.id,
            matchId: bf.matchId,
            evaluatorPhone: bf.evaluatorPhone,
            wasBalanced: bf.wasBalanced,
            strongerTeam: bf.strongerTeam || null,
            createdAt: bf.createdAt || new Date().toISOString(),
          }).onConflictDoNothing();
        }
      }

      // 4. Migrar Feedbacks de Estrelas (Rating)
      if (Array.isArray(data.ratingFeedbacks)) {
        for (const rf of data.ratingFeedbacks) {
          const targetExists = await db
            .select()
            .from(schema.players)
            .where(eq(schema.players.id, rf.targetPlayerId));
          if (targetExists.length > 0) {
            await db.insert(schema.ratingFeedbacks).values({
              id: rf.id,
              matchId: rf.matchId,
              evaluatorPhone: rf.evaluatorPhone,
              targetPlayerId: rf.targetPlayerId,
              rating: rf.rating,
              createdAt: rf.createdAt || new Date().toISOString(),
            }).onConflictDoNothing();
          }
        }
      }

      // 5. Migrar Votos no MVP (Craque)
      if (Array.isArray(data.mvpVotes)) {
        for (const mv of data.mvpVotes) {
          const targetExists = await db
            .select()
            .from(schema.players)
            .where(eq(schema.players.id, mv.targetPlayerId));
          if (targetExists.length > 0) {
            await db.insert(schema.mvpVotes).values({
              id: mv.id,
              matchId: mv.matchId,
              evaluatorPhone: mv.evaluatorPhone,
              targetPlayerId: mv.targetPlayerId,
              createdAt: mv.createdAt || new Date().toISOString(),
            }).onConflictDoNothing();
          }
        }
      }

      console.log('✅ Migração relacional do db.json para o PostgreSQL concluída com sucesso!');
    }
  } catch (err) {
    console.warn('Alerta na migração de dados do Postgres:', err);
  }
}

// RECÁLCULO DINÂMICO DE ESTATÍSTICAS (Derivado 100% dos relacionamentos no Postgres)
export async function getAggregatedDataFromPostgres() {
  const allPlayers = await db.select().from(schema.players);
  const allMatches = await db.select().from(schema.matches);
  const allMatchPlayers = await db.select().from(schema.matchPlayers);
  const allRatingFeedbacks = await db.select().from(schema.ratingFeedbacks);
  const allBalanceFeedbacks = await db.select().from(schema.balanceFeedbacks);
  const allMvpVotes = await db.select().from(schema.mvpVotes);

  // Reconstruir lista de partidas completas no formato esperado pelo Frontend
  const formattedMatches = allMatches.map((m) => {
    const mPlayers = allMatchPlayers.filter((mp) => mp.matchId === m.id);
    const presentPlayerIds = mPlayers.filter((mp) => mp.isPresent).map((mp) => mp.playerId);
    const teamAPlayerIds = mPlayers.filter((mp) => mp.team === 'teamA').map((mp) => mp.playerId);
    const teamBPlayerIds = mPlayers.filter((mp) => mp.team === 'teamB').map((mp) => mp.playerId);

    return {
      id: m.id,
      date: m.date,
      title: m.title || undefined,
      status: m.status as 'agendada' | 'em_andamento' | 'finalizada',
      teamA: {
        id: 'teamA' as const,
        name: m.teamAName,
        color: m.teamAColor,
        playerIds: teamAPlayerIds,
        setWins: m.teamASetWins,
      },
      teamB: {
        id: 'teamB' as const,
        name: m.teamBName,
        color: m.teamBColor,
        playerIds: teamBPlayerIds,
        setWins: m.teamBSetWins,
      },
      finalScore:
        m.finalScoreA !== null && m.finalScoreB !== null
          ? { teamASets: m.finalScoreA, teamBSets: m.finalScoreB }
          : undefined,
      setScores: [],
      presentPlayerIds,
      createdAt: m.createdAt,
      finalizedAt: m.finalizedAt || undefined,
    };
  });

  // Finalized matches
  const finalizedMatches = formattedMatches.filter((m) => m.status === 'finalizada');

  // Recalcular estatísticas dos Jogadores dinamica e relacionalmente
  const computedPlayers = allPlayers.map((p) => {
    // 1. Recalcular Média de Estrelas (Rating)
    const pRatings = allRatingFeedbacks.filter((rf) => rf.targetPlayerId === p.id);
    let rating = 3.0;
    let ratingCount = 0;
    if (pRatings.length > 0) {
      const sum = pRatings.reduce((acc, curr) => acc + curr.rating, 0);
      rating = Number((sum / pRatings.length).toFixed(1));
      ratingCount = pRatings.length;
    }

    // 2. Recalcular Vitórias / Derrotas / Empates / Partidas Jogadas
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let matchesPlayed = 0;

    finalizedMatches.forEach((m) => {
      const inA = m.teamA.playerIds.includes(p.id);
      const inB = m.teamB.playerIds.includes(p.id);

      if (inA || inB) {
        matchesPlayed += 1;
        const setsA = m.finalScore?.teamASets ?? m.teamA.setWins ?? 0;
        const setsB = m.finalScore?.teamBSets ?? m.teamB.setWins ?? 0;

        if (setsA === setsB) {
          draws += 1;
        } else if ((inA && setsA > setsB) || (inB && setsB > setsA)) {
          wins += 1;
        } else {
          losses += 1;
        }
      }
    });

    // 3. Recalcular Vitórias em Craque da Rodada (MVP)
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let mvpCount = 0;

    finalizedMatches.forEach((m) => {
      const finTime = m.finalizedAt
        ? new Date(m.finalizedAt).getTime()
        : new Date(m.createdAt).getTime();

      // Janela encerrada
      if (now - finTime >= TWENTY_FOUR_HOURS_MS) {
        const mVotes = allMvpVotes.filter((v) => v.matchId === m.id);
        const countMap: Record<string, number> = {};
        mVotes.forEach((v) => {
          countMap[v.targetPlayerId] = (countMap[v.targetPlayerId] || 0) + 1;
        });

        const maxVotes = Math.max(...Object.values(countMap), 0);
        if (maxVotes > 0 && countMap[p.id] === maxVotes) {
          mvpCount += 1;
        }
      }
    });

    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      position: (p.position as any) || undefined,
      photoUrl: p.photoUrl || undefined,
      rating,
      ratingCount,
      wins,
      draws,
      losses,
      matchesPlayed,
      avatarBg: p.avatarBg,
      isAdmin: p.isAdmin,
      active: p.active,
      isGuest: p.isGuest,
      mvpCount,
    };
  });

  return {
    players: computedPlayers,
    matches: formattedMatches,
    balanceFeedbacks: allBalanceFeedbacks,
    ratingFeedbacks: allRatingFeedbacks,
    mvpVotes: allMvpVotes,
  };
}
