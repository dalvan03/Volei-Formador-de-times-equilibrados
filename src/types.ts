export type Position = 'Levantador' | 'Ponteiro' | 'Oposto' | 'Central' | 'Líbero' | 'Geral';

export interface Player {
  id: string;
  name: string;
  phone: string;
  position?: Position;
  photoUrl?: string;
  rating: number; // Dynamic average rating (1.0 to 5.0)
  ratingCount: number; // Total star ratings received
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
  status: 'agendada' | 'em_andamento' | 'finalizada';
  teamA: Team;
  teamB: Team;
  finalScore?: {
    teamASets: number;
    teamBSets: number;
  };
  setScores?: SetScore[];
  presentPlayerIds: string[];
  createdAt: string;
  finalizedAt?: string; // Timestamp ISO when match was finalized (marks start of 24h voting window)
}

export interface UserSession {
  phone: string;
  player?: Player;
  isLoggedIn: boolean;
  isAdmin: boolean;
}
