import type { Player, Match, BalanceFeedback, PlayerRatingFeedback, MvpVoteFeedback, UserSession, ActivityLog, LogCategory } from '../types';
import { localDate, seasonForDate, mvpVotingDeadline, mvpVotingOpen } from './seasons';

// Private server data lives only in memory, never in a shared browser cache.
let state: { players: Player[]; matches: Match[]; balanceFeedbacks: BalanceFeedback[]; session: UserSession | null; seasonId?: string } = { players: [], matches: [], balanceFeedbacks: [], session: null };
let logs: ActivityLog[] = [];
let generation = 0;
export function clearClientState() {
  generation++;
  state = { players: [], matches: [], balanceFeedbacks: [], session: null };
  logs = [];
  for (const key of Object.keys(localStorage)) if (key.startsWith('volei_app_') || key === 'volley_session') localStorage.removeItem(key);
}
// Invalidate legacy authentication and private caches on every application load.
if (typeof localStorage !== 'undefined') {
  for (const key of Object.keys(localStorage)) if (key.startsWith('volei_app_') && !key.includes('local_draft') || key === 'volley_session') localStorage.removeItem(key);
}
export async function apiRequest<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}) });
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) { clearClientState(); window.dispatchEvent(new Event('session-expired')); }
    throw new Error(json.error || 'Não foi possível concluir a operação');
  }
  return json.data;
}
export const cleanPhone = (phone?: string | null) => (phone || '').replace(/\D/g, '');
export const getStoredPlayers = () => state.players;
export const getStoredMatches = () => state.matches;
export const getStoredBalanceFeedbacks = () => state.balanceFeedbacks;
export const getStoredRatingFeedbacks = (): PlayerRatingFeedback[] => [];
export const getStoredMvpVotes = (): MvpVoteFeedback[] => [];
export const getStoredActivityLogs = () => logs;
export const getStoredSession = () => state.session;
export async function fetchDbFromServer(_retries = 0) {
  const started = generation;
  const data = await apiRequest<typeof state>('/db');
  if (started !== generation) return null;
  state = data;
  return data;
}
export async function fetchLogsFromServer() { logs = await apiRequest<ActivityLog[]>('/logs'); return logs; }
export function logActivity(params: { userName: string; userPhone?: string; action: string; description: string; category: LogCategory }): ActivityLog {
  const log = { ...params, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  void apiRequest('/logs', 'POST', log).catch(() => {});
  return log;
}
const DRAFT = 'volei_app_local_draft_match_v2', PRESENCE = 'volei_app_local_draft_presence_v2';
export function getStoredDraftMatch(): Match | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (draft && seasonForDate(draft.date) === seasonForDate(localDate())) return draft;
  } catch {}
  clearStoredDraft(); return null;
}
export function getStoredDraftPresence(): string[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESENCE) || 'null');
    return saved?.seasonId === seasonForDate(localDate()) ? saved.ids : null;
  } catch { return null; }
}
export function saveStoredDraftMatch(m: Match | null) { if (m) localStorage.setItem(DRAFT, JSON.stringify(m)); else localStorage.removeItem(DRAFT); }
export function saveStoredDraftPresence(ids: string[] | null) { if (ids) localStorage.setItem(PRESENCE, JSON.stringify({ seasonId: seasonForDate(localDate()), ids })); else localStorage.removeItem(PRESENCE); }
export function clearStoredDraft() { localStorage.removeItem(DRAFT); localStorage.removeItem(PRESENCE); }
export interface SubmitFeedbackPayload {
  matchId: string; evaluatorPhone: string; evaluatorPlayerId?: string;
  balanceFeedback?: { wasBalanced: boolean; strongerTeam?: 'teamA' | 'teamB' | null };
  ratingFeedbacks?: { targetPlayerId: string; rating: number }[];
  mvpVote?: { targetPlayerId: string };
  activityLogs?: unknown[];
}
export async function submitFeedbackToServer(payload: SubmitFeedbackPayload) {
  try {
    await apiRequest('/feedback', 'POST', payload);
    await fetchDbFromServer();
    return { success: true };
  } catch (err) { return { success: false, error: (err as Error).message }; }
}
export interface MvpTopItem { player: Player; voteCount: number; percentage: number; isWinner: boolean }
export interface MatchMvpResult { isVotingOpen: boolean; timeLeftMs: number; formattedTimeLeft: string; totalVotes: number; top3: MvpTopItem[]; winners: Player[] }
export function getMatchMvpResult(match: Match, players: Player[], _optionalVotes?: MvpVoteFeedback[]): MatchMvpResult {
  const open = mvpVotingOpen(match), timeLeftMs = open ? Math.max(0, mvpVotingDeadline(match) - Date.now()) : 0;
  const result = match.mvpResult || { totalVotes: 0, counts: {}, voterIds: [] };
  const max = Math.max(0, ...Object.values(result.counts));
  const items = Object.entries(result.counts).map(([id, voteCount]) => ({ player: players.find(p => p.id === id), voteCount, percentage: result.totalVotes ? voteCount / result.totalVotes * 100 : 0, isWinner: voteCount === max })).filter(x => x.player).sort((a,b) => b.voteCount-a.voteCount || a.player!.name.localeCompare(b.player!.name)) as MvpTopItem[];
  return { isVotingOpen: open, timeLeftMs, formattedTimeLeft: `${Math.floor(timeLeftMs/3600000)}h ${String(Math.floor(timeLeftMs%3600000/60000)).padStart(2,'0')}m`, totalVotes: result.totalVotes, top3: open ? [] : items.slice(0,3), winners: open ? [] : items.filter(x => x.isWinner).map(x => x.player) };
}
