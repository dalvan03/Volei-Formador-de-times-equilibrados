import { client } from './index';
import type { Match, Player } from '../types';
import { FIRST_SEASON, localDate, seasonForDate, seasonBounds, nextSeason, rankedPlayers, weightedRating, mvpVotingOpen } from '../utils/seasons';

export async function readState(sql: any, seasonId: string, now = Date.now()) {
  const rows = await sql`SELECT * FROM players`;
  const matchRows = await sql`SELECT * FROM matches`;
  const links = await sql`SELECT * FROM match_players`;
  const ratings = await sql`SELECT * FROM rating_feedbacks`;
  const votes = await sql`SELECT * FROM mvp_votes`;
  const results = await sql`SELECT * FROM season_results`;
  const matches: Match[] = matchRows.map((m: any) => ({
    id: m.id, date: m.date, title: m.title, status: m.status, seasonId: m.season_id, votingClosesAt: m.voting_closes_at,
    createdAt: m.created_at, finalizedAt: m.finalized_at,
    presentPlayerIds: links.filter((l: any) => l.match_id === m.id && l.is_present).map((l: any) => l.player_id),
    teamA: { id: 'teamA', name: m.team_a_name, color: m.team_a_color, setWins: m.team_a_set_wins, playerIds: links.filter((l: any) => l.match_id === m.id && l.team === 'teamA').map((l: any) => l.player_id) },
    teamB: { id: 'teamB', name: m.team_b_name, color: m.team_b_color, setWins: m.team_b_set_wins, playerIds: links.filter((l: any) => l.match_id === m.id && l.team === 'teamB').map((l: any) => l.player_id) },
    finalScore: m.final_score_a == null ? undefined : { teamASets: m.final_score_a, teamBSets: m.final_score_b },
  }));
  for (const m of matches) {
    const unique = new Map<string, any>();
    votes.filter((v: any) => v.match_id === m.id).forEach((v: any) => unique.set(v.evaluator_phone.replace(/\D/g, ''), v));
    const counts: Record<string, number> = {};
    if (!mvpVotingOpen(m, now)) for (const v of unique.values()) counts[v.target_player_id] = (counts[v.target_player_id] || 0) + 1;
    m.mvpResult = { totalVotes: unique.size, counts, voterIds: rows.filter((p: any) => unique.has(p.phone.replace(/\D/g, ''))).map((p: any) => p.id) };
  }
  const players: Player[] = rows.map((p: any) => {
    const previous = results.filter((r: any) => r.player_id === p.id && r.season_id < seasonId).sort((a: any, b: any) => b.season_id.localeCompare(a.season_id))[0];
    const ownRatings = ratings.filter((r: any) => r.target_player_id === p.id);
    const dateById = new Map(matches.map(m => [m.id, m.seasonId || seasonForDate(m.date)]));
    const baseline = ownRatings.filter((r: any) => (dateById.get(r.match_id) || '') < FIRST_SEASON).map((r: any) => r.rating);
    const current = ownRatings.filter((r: any) => dateById.get(r.match_id) === seasonId).map((r: any) => r.rating);
    const base = weightedRating(3, 0, baseline);
    const rating = weightedRating(previous ? previous.rating : base.mean, previous ? previous.weight / 2 : base.weight, current);
    let wins = 0, losses = 0, draws = 0, matchesPlayed = 0, setBalance = 0, mvpCount = 0;
    for (const m of matches.filter(m => m.status === 'finalizada')) {
      const counts = m.mvpResult!.counts;
      const max = Math.max(0, ...Object.values(counts));
      if (max && counts[p.id] === max) mvpCount++;
      if (m.seasonId !== seasonId) continue;
      const inA = m.teamA.playerIds.includes(p.id), inB = m.teamB.playerIds.includes(p.id);
      if (!inA && !inB) continue;
      const difference = (m.finalScore?.teamASets ?? m.teamA.setWins ?? 0) - (m.finalScore?.teamBSets ?? m.teamB.setWins ?? 0);
      const ownDiff = inA ? difference : -difference;
      matchesPlayed++; setBalance += ownDiff;
      if (ownDiff > 0) wins++; else if (ownDiff < 0) losses++; else draws++;
    }
    const medals = { gold: 0, silver: 0, bronze: 0 };
    results.filter((r: any) => r.player_id === p.id && r.medal).forEach((r: any) => medals[r.medal as keyof typeof medals]++);
    return { id: p.id, name: p.name, phone: p.phone, position: p.position, photoUrl: p.photo_url, avatarBg: p.avatar_bg, isAdmin: p.is_admin, active: p.active, isGuest: p.is_guest,
      rating: rating.mean, ratingCount: current.length, ratingWeight: rating.weight, wins, losses, draws, matchesPlayed, setBalance, mvpCount, medals };
  });
  const ranks = new Map(rankedPlayers(players).map(p => [p.id, p.rank]));
  players.forEach(p => { p.rank = ranks.get(p.id); });
  return { players, matches, ratings, results };
}

export function publicPlayer(p: Player): Player {
  const { rating, ratingCount, ratingWeight, ...safe } = p;
  return safe;
}

// Same transaction lock is taken by writes, so closing and a last vote cannot race.
export async function advanceSeasons(sql: any, now: number) {
  let [{ id }] = await sql`SELECT id FROM seasons ORDER BY id DESC LIMIT 1`;
  const currentId = seasonForDate(localDate(new Date(now)));
  await sql`UPDATE matches SET status = 'encerrada' WHERE season_id < ${currentId} AND status IN ('agendada','em_andamento')`;
  while (id < currentId) {
    const [season] = await sql`SELECT * FROM seasons WHERE id = ${id}`;
    if (!season.closed) {
      await sql`UPDATE matches SET status = 'encerrada' WHERE season_id = ${id} AND status IN ('agendada','em_andamento')`;
      const state = await readState(sql, id, Date.parse(seasonBounds(id).endsAt));
      for (const p of state.players) {
        const medal = p.rank === 1 ? 'gold' : p.rank === 2 ? 'silver' : p.rank === 3 ? 'bronze' : null;
        await sql`INSERT INTO season_results (season_id, player_id, public_result, rating, weight, votes_received, medal)
          VALUES (${id}, ${p.id}, ${JSON.stringify(publicPlayer(p))}::jsonb, ${p.rating}, ${p.ratingWeight}, ${p.ratingCount}, ${medal}) ON CONFLICT DO NOTHING`;
      }
      await sql`UPDATE seasons SET closed = true WHERE id = ${id}`;
    }
    id = nextSeason(id);
    await sql`INSERT INTO seasons(id) VALUES (${id}) ON CONFLICT DO NOTHING`;
  }
  return currentId;
}
export async function seasonTransaction<T>(fn: (sql: any, seasonId: string, now: number) => Promise<T>): Promise<T> {
  return await client.begin(async sql => {
    await sql`SELECT pg_advisory_xact_lock(260917)`;
    const [{ now }] = await sql`SELECT clock_timestamp() AS now`;
    const time = new Date(now).getTime();
    const id = await advanceSeasons(sql, time);
    return fn(sql, id, time);
  }) as T;
}
