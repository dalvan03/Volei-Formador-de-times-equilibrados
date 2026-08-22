import { Player, Match, BalanceFeedback, PlayerRatingFeedback, MvpVoteFeedback, UserSession } from '../types';
import { INITIAL_PLAYERS, INITIAL_MATCHES } from '../data/initialData';

const KEYS = {
  PLAYERS: 'volei_app_players_v1',
  MATCHES: 'volei_app_matches_v1',
  BALANCE_FEEDBACKS: 'volei_app_balance_feedbacks_v1',
  RATING_FEEDBACKS: 'volei_app_rating_feedbacks_v1',
  MVP_VOTES: 'volei_app_mvp_votes_v1',
  SESSION: 'volei_app_session_v1',
};

export function getStoredPlayers(): Player[] {
  try {
    const data = localStorage.getItem(KEYS.PLAYERS);
    return data ? JSON.parse(data) : INITIAL_PLAYERS;
  } catch {
    return INITIAL_PLAYERS;
  }
}

export function savePlayers(players: Player[]): void {
  try {
    localStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
    syncDbToServer();
  } catch (e) {
    console.error('Error saving players', e);
  }
}

export function getStoredMatches(): Match[] {
  try {
    const data = localStorage.getItem(KEYS.MATCHES);
    return data ? JSON.parse(data) : INITIAL_MATCHES;
  } catch {
    return INITIAL_MATCHES;
  }
}

export function saveMatches(matches: Match[]): void {
  try {
    localStorage.setItem(KEYS.MATCHES, JSON.stringify(matches));
    syncDbToServer();
  } catch (e) {
    console.error('Error saving matches', e);
  }
}

export function getStoredBalanceFeedbacks(): BalanceFeedback[] {
  try {
    const data = localStorage.getItem(KEYS.BALANCE_FEEDBACKS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveBalanceFeedback(feedback: BalanceFeedback): void {
  const current = getStoredBalanceFeedbacks();
  const filtered = current.filter(
    (f) => !(f.matchId === feedback.matchId && f.evaluatorPhone === feedback.evaluatorPhone)
  );
  filtered.push(feedback);
  localStorage.setItem(KEYS.BALANCE_FEEDBACKS, JSON.stringify(filtered));
  syncDbToServer();
}

export function getStoredRatingFeedbacks(): PlayerRatingFeedback[] {
  try {
    const data = localStorage.getItem(KEYS.RATING_FEEDBACKS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function savePlayerRatingFeedbacks(
  matchId: string,
  evaluatorPhone: string,
  ratings: { targetPlayerId: string; rating: number }[]
): void {
  const currentFeedbacks = getStoredRatingFeedbacks();
  
  const updatedFeedbacks = currentFeedbacks.filter(
    (rf) => !(rf.matchId === matchId && rf.evaluatorPhone === evaluatorPhone)
  );

  const newFeedbacks: PlayerRatingFeedback[] = ratings.map((r) => ({
    id: `rf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    matchId,
    evaluatorPhone,
    targetPlayerId: r.targetPlayerId,
    rating: r.rating,
    createdAt: new Date().toISOString(),
  }));

  const allFeedbacks = [...updatedFeedbacks, ...newFeedbacks];
  localStorage.setItem(KEYS.RATING_FEEDBACKS, JSON.stringify(allFeedbacks));

  recalculateAllPlayerRatings();
  syncDbToServer();
}

export function getStoredMvpVotes(): MvpVoteFeedback[] {
  try {
    const data = localStorage.getItem(KEYS.MVP_VOTES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveMvpVote(matchId: string, evaluatorPhone: string, targetPlayerId: string): void {
  const current = getStoredMvpVotes();
  const filtered = current.filter(
    (v) => !(v.matchId === matchId && v.evaluatorPhone === evaluatorPhone)
  );

  const newVote: MvpVoteFeedback = {
    id: `mvp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    matchId,
    evaluatorPhone,
    targetPlayerId,
    createdAt: new Date().toISOString(),
  };

  filtered.push(newVote);
  localStorage.setItem(KEYS.MVP_VOTES, JSON.stringify(filtered));

  recalculatePlayerMvpCounts();
  syncDbToServer();
}

export function deleteFeedbacksForMatch(matchId: string): void {
  const balanceFeedbacks = getStoredBalanceFeedbacks();
  const updatedBalance = balanceFeedbacks.filter((f) => f.matchId !== matchId);
  localStorage.setItem(KEYS.BALANCE_FEEDBACKS, JSON.stringify(updatedBalance));

  const ratingFeedbacks = getStoredRatingFeedbacks();
  const updatedRating = ratingFeedbacks.filter((rf) => rf.matchId !== matchId);
  localStorage.setItem(KEYS.RATING_FEEDBACKS, JSON.stringify(updatedRating));

  const mvpVotes = getStoredMvpVotes();
  const updatedMvp = mvpVotes.filter((v) => v.matchId !== matchId);
  localStorage.setItem(KEYS.MVP_VOTES, JSON.stringify(updatedMvp));

  recalculatePlayerMvpCounts();
  syncDbToServer();
}

export interface MvpTopItem {
  player: Player;
  voteCount: number;
  percentage: number;
  isWinner: boolean;
}

export interface MatchMvpResult {
  isVotingOpen: boolean;
  timeLeftMs: number;
  formattedTimeLeft: string;
  totalVotes: number;
  top3: MvpTopItem[];
  winners: Player[];
}

export function getMatchMvpResult(
  match: Match,
  players: Player[],
  optionalVotes?: MvpVoteFeedback[]
): MatchMvpResult {
  const allVotes = optionalVotes || getStoredMvpVotes();
  const matchVotes = allVotes.filter((v) => v.matchId === match.id);
  const totalVotes = matchVotes.length;

  const finalizedTime = match.finalizedAt
    ? new Date(match.finalizedAt).getTime()
    : match.createdAt
    ? new Date(match.createdAt).getTime()
    : new Date(match.date + 'T00:00:00').getTime();

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const elapsed = now - finalizedTime;
  const isVotingOpen = match.status === 'finalizada' && elapsed < TWENTY_FOUR_HOURS_MS;
  const timeLeftMs = Math.max(0, TWENTY_FOUR_HOURS_MS - elapsed);

  const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
  const formattedTimeLeft = `${hours}h ${minutes.toString().padStart(2, '0')}m`;

  // Aggregate votes per player
  const countMap: Record<string, number> = {};
  matchVotes.forEach((v) => {
    countMap[v.targetPlayerId] = (countMap[v.targetPlayerId] || 0) + 1;
  });

  // Get all players involved in the match
  const matchPlayerIds = [
    ...(match.teamA?.playerIds || []),
    ...(match.teamB?.playerIds || []),
  ];
  const uniquePlayerIds = Array.from(new Set(matchPlayerIds));

  const sortedList: { player: Player; voteCount: number; percentage: number }[] = uniquePlayerIds
    .map((pId) => {
      const p: Player = players.find((item) => item.id === pId) || {
        id: pId,
        name: 'Atleta',
        phone: '',
        rating: 3.0,
        ratingCount: 0,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        avatarBg: 'bg-slate-600',
      };
      const voteCount = countMap[pId] || 0;
      const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
      return { player: p, voteCount, percentage };
    })
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      return (b.player.rating || 3.0) - (a.player.rating || 3.0);
    });

  const maxVotes = sortedList.length > 0 && totalVotes > 0 ? sortedList[0].voteCount : 0;
  const winners = maxVotes > 0 ? sortedList.filter((item) => item.voteCount === maxVotes).map((i) => i.player) : [];

  const top3: MvpTopItem[] = sortedList.slice(0, 3).map((item, idx) => ({
    player: item.player,
    voteCount: item.voteCount,
    percentage: Number(item.percentage.toFixed(1)),
    isWinner: maxVotes > 0 && item.voteCount === maxVotes,
  }));

  return {
    isVotingOpen,
    timeLeftMs,
    formattedTimeLeft,
    totalVotes,
    top3,
    winners,
  };
}

export function recalculatePlayerMvpCounts(
  currentPlayers?: Player[],
  currentMatches?: Match[]
): Player[] {
  const players = currentPlayers || getStoredPlayers();
  const matches = currentMatches || getStoredMatches();
  const allVotes = getStoredMvpVotes();

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Completed matches where voting window has expired
  const closedMatches = matches.filter((m) => {
    if (m.status !== 'finalizada') return false;
    const finTime = m.finalizedAt
      ? new Date(m.finalizedAt).getTime()
      : m.createdAt
      ? new Date(m.createdAt).getTime()
      : new Date(m.date + 'T00:00:00').getTime();
    return now - finTime >= TWENTY_FOUR_HOURS_MS;
  });

  const mvpCounter: Record<string, number> = {};

  closedMatches.forEach((m) => {
    const result = getMatchMvpResult(m, players, allVotes);
    if (!result.isVotingOpen && result.totalVotes > 0) {
      result.winners.forEach((winner) => {
        mvpCounter[winner.id] = (mvpCounter[winner.id] || 0) + 1;
      });
    }
  });

  const updatedPlayers = players.map((p) => ({
    ...p,
    mvpCount: mvpCounter[p.id] || 0,
  }));

  try {
    localStorage.setItem(KEYS.PLAYERS, JSON.stringify(updatedPlayers));
    syncDbToServer();
  } catch {}

  return updatedPlayers;
}

export function recalculateAllPlayerRatings(): Player[] {
  const players = getStoredPlayers();
  const allRatings = getStoredRatingFeedbacks();

  const updatedPlayers = players.map((player) => {
    const receivedRatings = allRatings.filter((r) => r.targetPlayerId === player.id);
    if (receivedRatings.length === 0) {
      return {
        ...player,
        rating: player.ratingCount && player.ratingCount > 0 ? player.rating : 3.0,
        ratingCount: player.ratingCount && player.ratingCount > 0 ? player.ratingCount : 0,
      };
    }

    const sum = receivedRatings.reduce((acc, curr) => acc + curr.rating, 0);
    const avg = sum / receivedRatings.length;

    return {
      ...player,
      rating: Number(avg.toFixed(1)),
      ratingCount: receivedRatings.length,
    };
  });

  try {
    localStorage.setItem(KEYS.PLAYERS, JSON.stringify(updatedPlayers));
  } catch {}
  return updatedPlayers;
}

export function getStoredSession(): UserSession | null {
  try {
    const data = localStorage.getItem(KEYS.SESSION);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession | null): void {
  if (session) {
    localStorage.setItem(KEYS.SESSION, JSON.stringify(session));
  } else {
    localStorage.removeItem(KEYS.SESSION);
  }
}

export function resetAllData(): void {
  localStorage.removeItem(KEYS.PLAYERS);
  localStorage.removeItem(KEYS.MATCHES);
  localStorage.removeItem(KEYS.BALANCE_FEEDBACKS);
  localStorage.removeItem(KEYS.RATING_FEEDBACKS);
  localStorage.removeItem(KEYS.MVP_VOTES);
  localStorage.removeItem(KEYS.SESSION);

  fetch('/api/reset', { method: 'POST' }).catch(() => {});
}

// SERVER BACKEND DB SYNC
export async function syncDbToServer(): Promise<void> {
  try {
    const payload = {
      players: getStoredPlayers(),
      matches: getStoredMatches(),
      balanceFeedbacks: getStoredBalanceFeedbacks(),
      ratingFeedbacks: getStoredRatingFeedbacks(),
      mvpVotes: getStoredMvpVotes(),
    };
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Unable to sync database to local server:', err);
  }
}

export async function fetchDbFromServer(retries = 1): Promise<{
  players: Player[];
  matches: Match[];
  balanceFeedbacks: BalanceFeedback[];
  ratingFeedbacks: PlayerRatingFeedback[];
  mvpVotes: MvpVoteFeedback[];
} | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api/db');
      if (!res.ok) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        return null;
      }
      const json = await res.json();
      if (json && json.success) {
        if (!json.data) {
          // Initial server seed
          await syncDbToServer();
          return {
            players: getStoredPlayers(),
            matches: getStoredMatches(),
            balanceFeedbacks: getStoredBalanceFeedbacks(),
            ratingFeedbacks: getStoredRatingFeedbacks(),
            mvpVotes: getStoredMvpVotes(),
          };
        }

        const { players, matches, balanceFeedbacks, ratingFeedbacks, mvpVotes } = json.data;
        if (Array.isArray(players)) {
          localStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
        }
        if (Array.isArray(matches)) {
          localStorage.setItem(KEYS.MATCHES, JSON.stringify(matches));
        }
        if (Array.isArray(balanceFeedbacks)) {
          localStorage.setItem(KEYS.BALANCE_FEEDBACKS, JSON.stringify(balanceFeedbacks));
        }
        if (Array.isArray(ratingFeedbacks)) {
          localStorage.setItem(KEYS.RATING_FEEDBACKS, JSON.stringify(ratingFeedbacks));
        }
        if (Array.isArray(mvpVotes)) {
          localStorage.setItem(KEYS.MVP_VOTES, JSON.stringify(mvpVotes));
        }

        return {
          players: players || getStoredPlayers(),
          matches: matches || getStoredMatches(),
          balanceFeedbacks: balanceFeedbacks || getStoredBalanceFeedbacks(),
          ratingFeedbacks: ratingFeedbacks || getStoredRatingFeedbacks(),
          mvpVotes: mvpVotes || getStoredMvpVotes(),
        };
      }
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      console.warn('Unable to fetch database from local server, fallback to client state:', err);
    }
  }
  return null;
}
