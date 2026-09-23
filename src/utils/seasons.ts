import type { Match, Player } from '../types';

export const FIRST_SEASON = '2026-Q3';
export const VOTING_HOURS = 96;
export function localDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function seasonForDate(date: string) {
  return `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}
export function seasonBounds(id: string) {
  if (!/^\d{4}-Q[1-4]$/.test(id)) throw new Error('Temporada inválida');
  const year = Number(id.slice(0, 4)), quarter = Number(id.slice(-1));
  const startDate = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const endDate = `${quarter === 4 ? year + 1 : year}-${String(quarter === 4 ? 1 : quarter * 3 + 1).padStart(2, '0')}-01`;
  return { id, startDate, endDate, startsAt: `${startDate}T00:00:00-03:00`, endsAt: `${endDate}T00:00:00-03:00` };
}
export function nextSeason(id: string) { return seasonForDate(seasonBounds(id).endDate); }
export function votingDeadline(match: Match) {
  if (match.votingClosesAt) return Date.parse(match.votingClosesAt);
  return Math.min(Date.parse(match.finalizedAt || match.createdAt) + VOTING_HOURS * 3600000, Date.parse(seasonBounds(seasonForDate(match.date)).endsAt));
}
export function votingOpen(match: Match, now = Date.now()) {
  return match.status === 'finalizada' && now < votingDeadline(match);
}
export const MVP_VOTING_HOURS = 24;
export function mvpVotingDeadline(match: Match) {
  return Math.min(votingDeadline(match), Date.parse(match.finalizedAt || match.createdAt) + MVP_VOTING_HOURS * 3600000);
}
export function mvpVotingOpen(match: Match, now = Date.now()) {
  return match.status === 'finalizada' && now < mvpVotingDeadline(match);
}
export function compareRanking(a: Pick<Player, 'wins'|'draws'|'losses'|'setBalance'>, b: Pick<Player, 'wins'|'draws'|'losses'|'setBalance'>) {
  return (b.wins * 3 + (b.draws || 0)) - (a.wins * 3 + (a.draws || 0)) || b.wins - a.wins || a.losses - b.losses || (b.setBalance || 0) - (a.setBalance || 0);
}
export function rankedPlayers<T extends Player>(players: T[]) {
  const sorted = players.filter(p => !p.isGuest && p.matchesPlayed > 0).sort(compareRanking);
  let rank = 0;
  return sorted.map((p, i) => { if (!i || compareRanking(p, sorted[i - 1])) rank = i + 1; return { ...p, rank }; });
}
export function weightedRating(mean: number, inheritedWeight: number, ratings: number[]) {
  const weight = inheritedWeight + ratings.length;
  return { mean: weight ? (mean * inheritedWeight + ratings.reduce((a, b) => a + b, 0)) / weight : mean, weight, votes: ratings.length };
}
