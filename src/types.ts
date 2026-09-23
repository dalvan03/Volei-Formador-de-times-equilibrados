export type Position = 'Levantador' | 'Ponteiro' | 'Oposto' | 'Central' | 'Líbero' | 'Geral';

export interface Player {
  id: string;
  name: string;
  phone: string;
  position?: Position;
  photoUrl?: string;
  rating?: number; // Internal calculation only; omitted from public and administrator responses
  ratingCount?: number;
  ratingWeight?: number;
  setBalance?: number;
  rank?: number;
  medals?: { gold: number; silver: number; bronze: number };
  wins: number;
  losses: number;
  draws?: number;
  matchesPlayed: number;
  mvpCount?: number; // Total times elected Match MVP / Craque da Partida
  avatarBg: string;
  isAdmin?: boolean;
  active?: boolean; // Active in group
  isGuest?: boolean; // True if player is a guest without registration
}

export interface Team {
  id: 'teamA' | 'teamB';
  name: string; // e.g. "Time Azul", "Time Amarelo"
  color: string;
  playerIds: string[];
  setWins?: number;
}

export interface SetScore {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
}

export interface BalanceFeedback {
  id: string;
  matchId: string;
  evaluatorPlayerId?: string;
  evaluatorPhone: string;
  wasBalanced: boolean;
  strongerTeam?: 'teamA' | 'teamB' | null;
  createdAt: string;
}


export interface PlayerRatingFeedback {
  id: string;
  matchId: string;
  evaluatorPhone: string;
  targetPlayerId: string;
  rating: number; // 1 to 5
  createdAt: string;
}

export interface MvpVoteFeedback {
  id: string;
  matchId: string;
  evaluatorPhone: string;
  targetPlayerId: string;
  createdAt: string;
}

export interface Match {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string;
  status: 'agendada' | 'em_andamento' | 'finalizada' | 'encerrada';
  seasonId?: string;
  votingClosesAt?: string;
  mvpResult?: { totalVotes: number; counts: Record<string, number>; voterIds: string[] };
  teamA: Team;
  teamB: Team;
  finalScore?: {
    teamASets: number;
    teamBSets: number;
  };
  setScores?: SetScore[];
  presentPlayerIds: string[];
  createdAt: string;
  finalizedAt?: string; // Timestamp ISO when match was finalized (marks start of the 96h voting window)
}

export interface UserSession {
  phone: string;
  player?: Player;
  isLoggedIn: boolean;
  isAdmin: boolean;
}

export type PublicPlayer = Omit<Player, 'rating' | 'ratingCount' | 'ratingWeight'>;
export interface PrivateSeasonResult { seasonId: string; rating: number; votesReceived: number }
export interface SeasonSummary { id: string; closed: boolean }
export type LogCategory = 'partida' | 'atleta' | 'voto' | 'auth' | 'admin';

export interface ActivityLog {
  id: string;
  userName: string;
  userPhone?: string;
  action: string;
  description: string;
  category: LogCategory;
  createdAt: string;
}
