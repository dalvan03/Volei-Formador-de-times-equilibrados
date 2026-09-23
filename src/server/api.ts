import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { seasonTransaction, readState, publicPlayer } from '../db/seasonService';
import { FIRST_SEASON, seasonForDate, votingDeadline, votingOpen, mvpVotingOpen, localDate } from '../utils/seasons';
import { generateBalancedTeams } from '../utils/teamGenerator';
import { isValidMobilePhone } from '../utils/phone';
import { actorFor, accountBlocked, clearCookie, consumeAttempt, hashPin, hashToken, issueSession, phoneNumber, sessionToken, validPin, verifyPin } from './auth';
import type { Match } from '../types';
import { whatsappConfig } from './whatsapp';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function requireValue(value: unknown, message = 'Dados inválidos'): asserts value { if (!value) throw new HttpError(400, message); }
const sessionData = (p: any, player: any) => ({ phone: p.phone, player, isLoggedIn: true, isAdmin: p.is_admin });
const cleanText = (v: unknown, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export function createApi() {
  const api = Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['POST','PATCH','DELETE','PUT'].includes(req.method)) {
      const origin = req.get('origin');
      let badOrigin = false;
      try { badOrigin = !!origin && new URL(origin).host !== req.get('host'); } catch { badOrigin = true; }
      if (req.get('sec-fetch-site') === 'cross-site' || badOrigin) return res.status(403).json({ success: false, error: 'Origem não permitida' });
      if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ success: false, error: 'Envie JSON' });
    }
    next();
  });
  const route = (handler: (ctx: any) => Promise<any>, access: 'public'|'user'|'admin' = 'user') => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await seasonTransaction(async (sql, seasonId, now) => {
        const actor = await actorFor(sql, req);
        if (access !== 'public' && !actor) throw new HttpError(401, 'Entre com seu telefone e PIN');
        if (access === 'admin' && !actor.is_admin) throw new HttpError(403, 'Acesso exclusivo para administradores');
        return handler({ sql, seasonId, now, actor, req, res });
      });
      res.status(result?.status || 200).json(result?.body || { success: true, data: result });
    } catch (err) { next(err); }
  };

  api.get('/health', route(async ({ sql, seasonId }) => {
    await sql`SELECT 1`;
    return { healthy: true, seasonId };
  }, 'public'));
  api.get('/admin/whatsapp', route(async ({ sql }) => ({
    enabled: !!whatsappConfig(),
    deliveries: await sql`SELECT match_id,kind,status,updated_at FROM whatsapp_deliveries ORDER BY updated_at DESC LIMIT 100`,
  }), 'admin'));
  api.post('/auth/check', route(async ({ sql, req, now }) => {
    if (!await consumeAttempt(sql, `ip:${req.ip}`, 30, now)) return { status: 429, body: { error: 'Muitas tentativas. Aguarde 15 minutos.' } };
    const phone = phoneNumber(req.body.phone);
    requireValue(isValidMobilePhone(phone), 'Informe um celular com DDD e 11 dígitos');
    const rows = await sql`SELECT p.id, p.active, c.pin_hash FROM players p LEFT JOIN credentials c ON c.player_id = p.id WHERE regexp_replace(p.phone, '[^0-9]', '', 'g') = ${phone} AND p.is_guest = false`;
    if (rows.length > 1) throw new HttpError(409, 'Telefone duplicado. Solicite correção ao administrador.');
    if (!rows.length) throw new HttpError(404, 'Conta não cadastrada. Fale com um administrador.');
    if (!rows[0].active) throw new HttpError(403, 'Conta desativada. Fale com um administrador.');
    return { needsPin: !!rows[0].pin_hash };
  }, 'public'));
  api.post('/auth/login', route(async ({ sql, req, res, now, seasonId }) => {
    const phone = phoneNumber(req.body.phone), pin = req.body.pin;
    if (!await consumeAttempt(sql, `ip:${req.ip}`, 30, now) || await accountBlocked(sql, phone, now)) return { status: 429, body: { error: 'Muitas tentativas. Aguarde 15 minutos.' } };
    requireValue(isValidMobilePhone(phone), 'Informe um celular com DDD e 11 dígitos');
    const rows = await sql`SELECT p.*, c.pin_hash FROM players p LEFT JOIN credentials c ON c.player_id = p.id WHERE regexp_replace(p.phone, '[^0-9]', '', 'g') = ${phone} AND p.is_guest = false`;
    if (rows.length > 1) throw new HttpError(409, 'Telefone duplicado. Solicite correção ao administrador.');
    const p = rows[0];
    if (!p) throw new HttpError(404, 'Conta não cadastrada. Fale com um administrador.');
    if (!p.active) throw new HttpError(403, 'Conta desativada. Fale com um administrador.');
    requireValue(validPin(pin), 'Informe um PIN de quatro dígitos');
    if (p.pin_hash) {
      if (!await verifyPin(pin, p.pin_hash)) {
        await consumeAttempt(sql, `phone:${phone}`, 5, now);
        return { status: 401, body: { success: false, error: 'PIN incorreto' } };
      }
    } else {
      requireValue(req.body.confirmPin === pin, 'Confirme o PIN');
      await sql`INSERT INTO credentials(player_id, pin_hash) VALUES (${p.id}, ${await hashPin(pin)})`;
    }
    await sql`DELETE FROM auth_attempts WHERE key = ${'phone:' + phone}`;
    await issueSession(sql, res, p.id, now);
    const state = await readState(sql, seasonId, now);
    return sessionData(p, publicPlayer(state.players.find(x => x.id === p.id)!));
  }, 'public'));
  api.get('/auth/session', route(async ({ sql, actor, seasonId, now }) => {
    if (!actor) return null;
    const state = await readState(sql, seasonId, now);
    return sessionData(actor, publicPlayer(state.players.find(p => p.id === actor.id)!));
  }, 'public'));
  api.post('/auth/logout', route(async ({ sql, req, res }) => {
    await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(sessionToken(req))}`;
    clearCookie(res); return null;
  }, 'public'));
  api.post('/admin/players/:id/reset-pin', route(async ({ sql, req, actor, now }) => {
    await sql`DELETE FROM credentials WHERE player_id = ${req.params.id}`;
    await sql`DELETE FROM sessions WHERE player_id = ${req.params.id}`;
    const [p] = await sql`SELECT phone FROM players WHERE id = ${req.params.id}`;
    if (p) await sql`DELETE FROM auth_attempts WHERE key = ${'phone:' + phoneNumber(p.phone)}`;
    await sql`INSERT INTO activity_logs(id,user_name,action,description,category,created_at) VALUES (${randomUUID()},${actor.name},'RESET_PIN',${'Acesso redefinido: ' + req.params.id},'admin',${new Date(now).toISOString()})`;
    return null;
  }, 'admin'));

  api.get('/db', route(async ({ sql, actor, seasonId, now }) => {
    const state = await readState(sql, seasonId, now);
    const balance = await sql`SELECT * FROM balance_feedbacks WHERE evaluator_player_id = ${actor.id} OR regexp_replace(evaluator_phone, '[^0-9]', '', 'g') = ${phoneNumber(actor.phone)}`;
    return { players: state.players.map(p => publicPlayer(p)), matches: state.matches, seasonId,
      balanceFeedbacks: balance.map((b: any) => ({ id: b.id, matchId: b.match_id, evaluatorPhone: actor.phone, evaluatorPlayerId: actor.id, wasBalanced: b.was_balanced, createdAt: b.created_at })),
      ratingFeedbacks: [], mvpVotes: [], activityLogs: [], session: sessionData(actor, publicPlayer(state.players.find(p => p.id === actor.id)!)) };
  }));
  api.post('/db', route(async () => { throw new HttpError(410, 'Sincronização antiga desativada. Atualize o aplicativo.'); }));
  api.post('/reset', route(async () => { throw new HttpError(409, 'Histórico e conquistas não podem ser apagados por este endpoint.'); }, 'admin'));
  api.get('/seasons', route(async ({ sql }) => await sql`SELECT id, closed FROM seasons ORDER BY id DESC`));
  api.get('/seasons/:id/ranking', route(async ({ sql, req, seasonId, now }) => {
    if (req.params.id === seasonId) return (await readState(sql, seasonId, now)).players.map(p => publicPlayer(p));
    const rows = await sql`SELECT public_result FROM season_results WHERE season_id = ${req.params.id}`;
    return rows.map((r: any) => r.public_result);
  }));
  api.get('/me/seasons', route(async ({ sql, actor }) => {
    const rows = await sql`SELECT season_id, rating, votes_received FROM season_results WHERE player_id = ${actor.id} ORDER BY season_id DESC`;
    return rows.map((r: any) => ({ seasonId: r.season_id, rating: r.rating, votesReceived: r.votes_received }));
  }));
  api.get('/admin/ratings', route(async () => { throw new HttpError(403, 'Notas são privadas. Consulte apenas suas temporadas encerradas no perfil.'); }, 'admin'));
  api.post('/teams/generate', route(async ({ sql, req, seasonId, now }) => {
    const state = await readState(sql, seasonId, now);
    requireValue(Array.isArray(req.body.playerIds), 'Selecione os jogadores');
    const selected = state.players.filter(p => p.active !== false && req.body.playerIds.includes(p.id));
    requireValue(selected.length >= 2 && selected.length === new Set(req.body.playerIds).size, 'Jogadores inválidos');
    const { teamA, teamB } = generateBalancedTeams(selected, state.matches.filter(m => m.status === 'finalizada'), { teamAColor: 'bg-blue-600', teamBColor: 'bg-amber-600' });
    return { teamA, teamB };
  }));

  api.patch('/players/:id', route(async ({ sql, req, actor }) => {
    const [existing] = await sql`SELECT * FROM players WHERE id = ${req.params.id}`;
    if (!existing) throw new HttpError(404, 'Jogador não encontrado');
    if (!actor.is_admin && actor.id !== existing.id) throw new HttpError(403, 'Você só pode editar seu perfil');
    const p = req.body;
    requireValue(cleanText(p.name), 'Informe o nome');
    if (!actor.is_admin && (p.isAdmin !== undefined && p.isAdmin !== existing.is_admin || p.phone !== undefined && p.phone !== existing.phone || p.active !== undefined && p.active !== existing.active || p.position !== undefined && p.position !== existing.position)) throw new HttpError(403, 'Campo restrito');
    const phone = actor.is_admin ? phoneNumber(p.phone ?? existing.phone) : existing.phone;
    if (!existing.is_guest) {
      requireValue(isValidMobilePhone(phone), 'Informe um celular com DDD e 11 dígitos');
      const duplicates = await sql`SELECT id FROM players WHERE id <> ${existing.id} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}`;
      requireValue(!duplicates.length, 'Telefone já cadastrado');
    }
    const isAdmin = actor.is_admin && typeof p.isAdmin === 'boolean' ? p.isAdmin : existing.is_admin;
    if (existing.is_admin && !isAdmin) {
      const admins = await sql`SELECT id FROM players WHERE is_admin = true`;
      requireValue(admins.length > 1, 'Mantenha ao menos um administrador');
    }
    await sql`UPDATE players SET name = ${cleanText(p.name)}, photo_url = ${typeof p.photoUrl === 'string' ? p.photoUrl : null}, phone = ${phone}, is_admin = ${isAdmin},
      active = ${actor.is_admin && typeof p.active === 'boolean' ? p.active : existing.active},
      position = ${actor.is_admin ? p.position || null : existing.position} WHERE id = ${existing.id}`;
    return null;
  }));
  api.post('/players', route(async ({ sql, req }) => {
    const p = req.body, phone = phoneNumber(p.phone);
    requireValue(cleanText(p.name) && typeof p.id === 'string');
    if (!p.isGuest) {
      requireValue(isValidMobilePhone(phone), 'Informe um celular com DDD e 11 dígitos');
      requireValue(!(await sql`SELECT id FROM players WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}`).length, 'Telefone já cadastrado');
    }
    await sql`INSERT INTO players(id,name,phone,photo_url,avatar_bg,is_guest) VALUES (${p.id},${cleanText(p.name)},${phone},${p.photoUrl || null},${cleanText(p.avatarBg) || 'bg-emerald-600'},${p.isGuest === true})`;
    return null;
  }, 'admin'));
  api.delete('/players/:id', route(async ({ sql, req }) => {
    const [p] = await sql`SELECT * FROM players WHERE id = ${req.params.id}`;
    requireValue(p && !p.is_admin, 'Remova o privilégio de administrador antes de desativar');
    await sql`UPDATE players SET active = false WHERE id = ${p.id}`;
    await sql`DELETE FROM sessions WHERE player_id = ${p.id}`;
    return null;
  }, 'admin'));

  api.post('/matches', route(async ({ sql, req, seasonId, now }) => {
    const m: Match = req.body;
    requireValue(m && typeof m.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && !isNaN(Date.parse(m.date)) && new Date(m.date).toISOString().slice(0,10) === m.date, 'Partida inválida');
    requireValue(seasonForDate(m.date) === seasonId && m.date <= localDate(new Date(now)), 'Partida deve pertencer à temporada atual e não pode estar no futuro');
    const [old] = await sql`SELECT * FROM matches WHERE id = ${m.id}`;
    if (old && old.season_id !== seasonId) throw new HttpError(409, 'Temporada encerrada');
    requireValue(['agendada','em_andamento','finalizada'].includes(m.status));
    if (old?.status === 'finalizada') throw new HttpError(409, 'Partida finalizada não pode ser alterada');
    if (m.status !== 'finalizada') {
      const active = await sql`SELECT id FROM matches WHERE season_id = ${seasonId} AND status IN ('agendada','em_andamento') AND id <> ${m.id}`;
      requireValue(!active.length, 'Já existe uma rodada em andamento ou agendada');
    }
    const a = m.teamA?.playerIds, b = m.teamB?.playerIds;
    requireValue(Array.isArray(a) && Array.isArray(b) && a.every(x => typeof x === 'string') && b.every(x => typeof x === 'string'));
    requireValue(new Set([...a, ...b]).size === a.length + b.length, 'Jogador duplicado nos times');
    if (m.status !== 'agendada') requireValue(a.length && b.length, 'Preencha ambos os times');
    const ids = [...new Set([...a, ...b, ...(m.presentPlayerIds || [])])];
    const valid = await sql`SELECT id FROM players WHERE id IN ${sql(ids.length ? ids : [''])}`;
    requireValue(valid.length === ids.length, 'Jogador não cadastrado');
    const scoreA = m.finalScore?.teamASets ?? m.teamA.setWins ?? 0, scoreB = m.finalScore?.teamBSets ?? m.teamB.setWins ?? 0;
    requireValue([scoreA, scoreB].every(n => Number.isInteger(n) && n >= 0 && n <= 1000), 'Placar inválido');
    const finalizedAt = m.status === 'finalizada' ? new Date(now).toISOString() : null;
    const deadline = finalizedAt ? new Date(votingDeadline({ ...m, finalizedAt, votingClosesAt: undefined })).toISOString() : null;
    await sql`INSERT INTO matches(id,date,title,status,team_a_name,team_a_color,team_a_set_wins,team_b_name,team_b_color,team_b_set_wins,final_score_a,final_score_b,created_at,finalized_at,season_id,voting_closes_at)
      VALUES (${m.id},${m.date},${cleanText(m.title)},${m.status},${cleanText(m.teamA.name)},${cleanText(m.teamA.color)},${scoreA},${cleanText(m.teamB.name)},${cleanText(m.teamB.color)},${scoreB},${finalizedAt ? scoreA : null},${finalizedAt ? scoreB : null},${old?.created_at || new Date(now).toISOString()},${finalizedAt},${seasonId},${deadline})
      ON CONFLICT(id) DO UPDATE SET date=excluded.date,title=excluded.title,status=excluded.status,team_a_name=excluded.team_a_name,team_a_color=excluded.team_a_color,team_a_set_wins=excluded.team_a_set_wins,team_b_name=excluded.team_b_name,team_b_color=excluded.team_b_color,team_b_set_wins=excluded.team_b_set_wins,final_score_a=excluded.final_score_a,final_score_b=excluded.final_score_b,finalized_at=excluded.finalized_at,voting_closes_at=excluded.voting_closes_at`;
    await sql`DELETE FROM match_players WHERE match_id = ${m.id}`;
    for (const id of ids) await sql`INSERT INTO match_players(match_id,player_id,team,is_present) VALUES (${m.id},${id},${a.includes(id) ? 'teamA' : b.includes(id) ? 'teamB' : null},${(m.presentPlayerIds || []).includes(id)})`;
    return null;
  }, 'admin'));
  api.delete('/matches/:id', route(async ({ sql, req, seasonId }) => {
    const [m] = await sql`SELECT * FROM matches WHERE id = ${req.params.id}`;
    if (!m) throw new HttpError(404, 'Partida não encontrada');
    if (m.season_id !== seasonId) throw new HttpError(409, 'Temporada encerrada');
    await sql`DELETE FROM matches WHERE id = ${m.id}`; return null;
  }, 'admin'));

  api.post('/feedback', route(async ({ sql, req, actor, seasonId, now }) => {
    const state = await readState(sql, seasonId, now), body = req.body;
    const m = state.matches.find(m => m.id === body.matchId);
    if (!m) throw new HttpError(404, 'Partida não encontrada');
    if (m.seasonId !== seasonId || !votingOpen(m, now)) throw new HttpError(409, 'Votação expirada');
    const team = m.teamA.playerIds.includes(actor.id) ? m.teamA.playerIds : m.teamB.playerIds.includes(actor.id) ? m.teamB.playerIds : [];
    if (!team.length) throw new HttpError(403, 'Somente participantes podem votar');
    const bf = body.balanceFeedback, ratings = body.ratingFeedbacks, mvp = body.mvpVote;
    requireValue(bf && typeof bf.wasBalanced === 'boolean' && [undefined,null,'teamA','teamB'].includes(bf.strongerTeam), 'Avaliação de equilíbrio inválida');
    requireValue(Array.isArray(ratings) && ratings.every(r => r && team.includes(r.targetPlayerId) && r.targetPlayerId !== actor.id && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5), 'Notas inválidas');
    requireValue(new Set(ratings.map(r => r.targetPlayerId)).size === ratings.length, 'Avaliação duplicada');
    requireValue(ratings.length === team.filter(id => id !== actor.id).length, 'Avalie todos os companheiros de time');
    if (!mvpVotingOpen(m, now) && mvp != null) throw new HttpError(409, 'Votação de MVP encerrada');
    if (mvpVotingOpen(m, now)) requireValue(mvp && mvp.targetPlayerId !== actor.id && [...m.teamA.playerIds,...m.teamB.playerIds].includes(mvp.targetPlayerId), 'Voto MVP inválido');
    const phone = phoneNumber(actor.phone), time = new Date(now).toISOString();
    await sql`INSERT INTO balance_feedbacks(id,match_id,evaluator_player_id,evaluator_phone,was_balanced,stronger_team,created_at) VALUES (${randomUUID()},${m.id},${actor.id},${phone},${bf.wasBalanced},${bf.strongerTeam || null},${time}) ON CONFLICT(match_id,evaluator_phone) DO UPDATE SET was_balanced=excluded.was_balanced,stronger_team=excluded.stronger_team`;
    for (const r of ratings) await sql`INSERT INTO rating_feedbacks(id,match_id,evaluator_phone,target_player_id,rating,created_at) VALUES (${randomUUID()},${m.id},${phone},${r.targetPlayerId},${r.rating},${time}) ON CONFLICT(match_id,evaluator_phone,target_player_id) DO UPDATE SET rating=excluded.rating`;
    if (mvpVotingOpen(m, now)) await sql`INSERT INTO mvp_votes(id,match_id,evaluator_phone,target_player_id,created_at) VALUES (${randomUUID()},${m.id},${phone},${mvp.targetPlayerId},${time}) ON CONFLICT(match_id,evaluator_phone) DO UPDATE SET target_player_id=excluded.target_player_id`;
    await sql`INSERT INTO activity_logs(id,user_name,user_phone,action,description,category,created_at) VALUES (${randomUUID()},${actor.name},${phone},'VOTOU',${actor.name + ' registrou avaliações da rodada'},'voto',${time})`;
    return null;
  }));
  api.get('/logs', route(async ({ sql }) => {
    const rows = await sql`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000`;
    return rows.map((r: any) => ({ id:r.id,userName:r.user_name,userPhone:r.user_phone,action:r.action,description:r.description,category:r.category,createdAt:r.created_at }));
  }, 'admin'));
  api.post('/logs', route(async ({ sql, actor, req, now }) => {
    await sql`INSERT INTO activity_logs(id,user_name,user_phone,action,description,category,created_at) VALUES (${randomUUID()},${actor.name},${actor.phone},${cleanText(req.body.action)},${cleanText(req.body.description, 500)},${['partida','atleta','voto','auth','admin'].includes(req.body.category) ? req.body.category : 'auth'},${new Date(now).toISOString()})`;
    return null;
  }));
  api.use((_req, res) => res.status(404).json({ success: false, error: 'Rota não encontrada' }));
  api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (!(err instanceof HttpError)) console.error('Erro na API:', err.message);
    res.status(err instanceof HttpError ? err.status : 500).json({ success: false, error: err instanceof HttpError ? err.message : 'Não foi possível concluir. Tente novamente.' });
  });
  return api;
}
