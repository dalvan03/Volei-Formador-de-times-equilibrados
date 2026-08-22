import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { runMigrationAndCalculations, getAggregatedDataFromPostgres } from './src/db/services';
import { db } from './src/db/index';
import * as schema from './src/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Garante pasta de fallback caso o Postgres não esteja conectado
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDbFile() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading db.json fallback:', err);
  }
  return null;
}

function writeDbFile(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing db.json fallback:', err);
  }
}

// API Routes (Integradas com PostgreSQL / Drizzle ORM + Fallback)
app.get('/api/db', async (req, res) => {
  try {
    const data = await getAggregatedDataFromPostgres();
    return res.json({ success: true, data });
  } catch (err) {
    console.warn('Postgres indisponível no GET /api/db, utilizando fallback local:', err);
    const dbData = readDbFile();
    return res.json({ success: true, data: dbData });
  }
});

// Exclusão explícita de partida
app.delete('/api/matches/:id', async (req, res) => {
  const matchId = req.params.id;
  try {
    await db.delete(schema.matches).where(eq(schema.matches.id, matchId));
    
    // Atualiza fallback db.json
    const dbData = readDbFile();
    if (dbData && Array.isArray(dbData.matches)) {
      dbData.matches = dbData.matches.filter((m: any) => m.id !== matchId);
      if (Array.isArray(dbData.balanceFeedbacks)) {
        dbData.balanceFeedbacks = dbData.balanceFeedbacks.filter((b: any) => b.matchId !== matchId);
      }
      if (Array.isArray(dbData.ratingFeedbacks)) {
        dbData.ratingFeedbacks = dbData.ratingFeedbacks.filter((r: any) => r.matchId !== matchId);
      }
      if (Array.isArray(dbData.mvpVotes)) {
        dbData.mvpVotes = dbData.mvpVotes.filter((v: any) => v.matchId !== matchId);
      }
      writeDbFile(dbData);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar partida no Postgres:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Sincronização geral de dados
app.post('/api/db', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, error: 'Payload inválido' });
  }

  // Backup em arquivo
  writeDbFile(payload);

  try {
    const { players, matches, balanceFeedbacks, ratingFeedbacks, mvpVotes } = payload;

    // 1. Salvar / Sincronizar Jogadores
    if (Array.isArray(players)) {
      const playerIdsToKeep = players.map((p: any) => p.id).filter(Boolean);
      if (playerIdsToKeep.length > 0) {
        await db.delete(schema.players).where(notInArray(schema.players.id, playerIdsToKeep));
      }

      for (const p of players) {
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
        }).onConflictDoUpdate({
          target: schema.players.id,
          set: {
            name: p.name,
            phone: p.phone || '',
            position: p.position || null,
            photoUrl: p.photoUrl || null,
            avatarBg: p.avatarBg || 'bg-blue-600',
            isAdmin: p.isAdmin || false,
            active: p.active !== false,
            isGuest: p.isGuest || false,
          },
        });
      }
    }

    // 2. Salvar / Sincronizar Partidas e Relacionamentos matchPlayers
    if (Array.isArray(matches)) {
      const matchIdsToKeep = matches.map((m: any) => m.id).filter(Boolean);
      if (matchIdsToKeep.length > 0) {
        await db.delete(schema.matches).where(notInArray(schema.matches.id, matchIdsToKeep));
      } else {
        await db.delete(schema.matches);
      }

      for (const m of matches) {
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
        }).onConflictDoUpdate({
          target: schema.matches.id,
          set: {
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
          },
        });

        // Atualizar relacionamentos dos jogadores na partida
        const presentIds: string[] = m.presentPlayerIds || [];
        const teamAIds: string[] = m.teamA?.playerIds || [];
        const teamBIds: string[] = m.teamB?.playerIds || [];
        const allIds = Array.from(new Set([...presentIds, ...teamAIds, ...teamBIds]));

        for (const pId of allIds) {
          const team = teamAIds.includes(pId)
            ? 'teamA'
            : teamBIds.includes(pId)
            ? 'teamB'
            : null;
          const isPresent = presentIds.includes(pId);

          await db.insert(schema.matchPlayers).values({
            matchId: m.id,
            playerId: pId,
            team,
            isPresent,
          }).onConflictDoUpdate({
            target: [schema.matchPlayers.matchId, schema.matchPlayers.playerId],
            set: { team, isPresent },
          });
        }
      }
    }

    // 3. Salvar Feedbacks de Equilíbrio
    if (Array.isArray(balanceFeedbacks)) {
      for (const bf of balanceFeedbacks) {
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

    // 4. Salvar Feedbacks de Rating (Estrelas)
    if (Array.isArray(ratingFeedbacks)) {
      for (const rf of ratingFeedbacks) {
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

    // 5. Salvar Votos no MVP (Craque)
    if (Array.isArray(mvpVotes)) {
      for (const mv of mvpVotes) {
        await db.insert(schema.mvpVotes).values({
          id: mv.id,
          matchId: mv.matchId,
          evaluatorPhone: mv.evaluatorPhone,
          targetPlayerId: mv.targetPlayerId,
          createdAt: mv.createdAt || new Date().toISOString(),
        }).onConflictDoNothing();
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.warn('Erro ao sincronizar com Postgres (dados salvos em db.json fallback):', err);
    return res.json({ success: true });
  }
});

app.post('/api/reset', async (req, res) => {
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
  try {
    await db.delete(schema.mvpVotes);
    await db.delete(schema.ratingFeedbacks);
    await db.delete(schema.balanceFeedbacks);
    await db.delete(schema.matchPlayers);
    await db.delete(schema.matches);
    await db.delete(schema.players);
  } catch {}
  res.json({ success: true });
});

async function startServer() {
  // Inicializar migrações e recálculos no PostgreSQL ao iniciar
  runMigrationAndCalculations().catch((err) => {
    console.warn('Execução do servidor iniciada com suporte a fallback:', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server rodando localmente na porta ${PORT}`);
  });
}

startServer();
