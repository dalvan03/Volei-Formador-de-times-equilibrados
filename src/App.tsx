import React, { useState, useEffect } from 'react';
import {
  getStoredPlayers,
  savePlayers,
  getStoredMatches,
  saveMatches,
  getStoredSession,
  saveSession,
  recalculateAllPlayerRatings,
  recalculatePlayerMvpCounts,
  getStoredBalanceFeedbacks,
  getStoredRatingFeedbacks,
  getStoredMvpVotes,
  deleteFeedbacksForMatch,
  resetAllData,
  fetchDbFromServer,
} from './utils/storage';
import { Player, Match, UserSession } from './types';
import { generateBalancedTeams } from './utils/teamGenerator';
import { Header } from './components/Header';
import { BottomNav, TabType } from './components/BottomNav';
import { GameDayTab } from './components/GameDayTab';
import { FeedbackTab } from './components/FeedbackTab';
import { RankingTab } from './components/RankingTab';
import { AdminTab } from './components/AdminTab';
import { PhoneAuthModal } from './components/PhoneAuthModal';
import { LoginPage } from './components/LoginPage';
import { EditProfileModal } from './components/EditProfileModal';
import { PlayerScoresModal } from './components/PlayerScoresModal';

const AVATAR_BG_OPTIONS = [
  'bg-emerald-600',
  'bg-blue-600',
  'bg-indigo-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-teal-600',
  'bg-cyan-600',
  'bg-orange-600',
  'bg-violet-600',
];

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('game');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showPlayerScoresModal, setShowPlayerScoresModal] = useState<boolean>(false);

  // Helper to create a new match object with balanced teams
  const createMatchForDate = (dateString: string, titleStr: string, currentPlayers: Player[], existingPastMatches: Match[]): Match => {
    const activePlayers = currentPlayers.filter((p) => p.active !== false);
    const presentPlayerIds: string[] = [];

    let teamA, teamB;
    try {
      const result = generateBalancedTeams(activePlayers, existingPastMatches, {
        teamAColor: 'bg-blue-600',
        teamBColor: 'bg-amber-600',
      });
      teamA = result.teamA;
      teamB = result.teamB;
    } catch {
      const half = Math.ceil(activePlayers.length / 2);
      const teamAPlayers = activePlayers.slice(0, half);
      const teamBPlayers = activePlayers.slice(half);
      const randomA = teamAPlayers[Math.floor(Math.random() * (teamAPlayers.length || 1))];
      const randomB = teamBPlayers[Math.floor(Math.random() * (teamBPlayers.length || 1))];
      const nameA = randomA ? `Time ${randomA.name.split(' ')[0]}` : 'Time A';
      const nameB = randomB ? `Time ${randomB.name.split(' ')[0]}` : 'Time B';
      teamA = { id: 'teamA', name: nameA, color: 'bg-blue-600', playerIds: teamAPlayers.map((p) => p.id) };
      teamB = { id: 'teamB', name: nameB, color: 'bg-amber-600', playerIds: teamBPlayers.map((p) => p.id) };
    }

    return {
      id: `match_${Date.now()}`,
      date: dateString,
      title: titleStr,
      status: 'agendada',
      presentPlayerIds,
      teamA,
      teamB,
      createdAt: new Date().toISOString(),
    };
  };

  // Load initial state and setup real-time sync with local server DB
  useEffect(() => {
    const loadState = async () => {
      const serverData = await fetchDbFromServer();
      const loadedMatches = serverData?.matches || getStoredMatches();
      setMatches(loadedMatches);

      const ratedPlayers = recalculateAllPlayerRatings();
      const loadedPlayers = recalculatePlayerMvpCounts(ratedPlayers, loadedMatches);
      setPlayers(loadedPlayers);

      const savedSession = getStoredSession();
      if (savedSession) {
        const matchedPlayer = loadedPlayers.find(
          (p) => p.phone.replace(/\D/g, '') === savedSession.phone.replace(/\D/g, '')
        );
        setSession({
          phone: savedSession.phone,
          player: matchedPlayer,
          isLoggedIn: true,
          isAdmin: matchedPlayer ? matchedPlayer.isAdmin || false : false,
        });
      } else {
        setSession(null);
      }
    };

    loadState();
  }, []);

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('volley_session');
  };

  // Current active match (agendada or em_andamento). Null if none active.
  const currentMatch = matches.find((m) => m.status === 'agendada' || m.status === 'em_andamento') || null;
  const pastMatches = matches
    .filter((m) => m.status === 'finalizada')
    .sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime() || b.id.localeCompare(a.id));

  // Manual trigger to start a new match today
  const handleStartManualMatch = () => {
    if (currentMatch) {
      alert('Já existe uma rodada em andamento ou agendada!');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dateFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const newMatch = createMatchForDate(
      todayStr,
      `Rodada de Vôlei (${dateFormatted})`,
      players,
      matches
    );

    const updatedMatches = [newMatch, ...matches];
    saveMatches(updatedMatches);
    setMatches(updatedMatches);
    setActiveTab('game');
  };

  const handleDeleteMatch = async (matchId: string) => {
    // Dispara exclusão imediata no servidor Postgres
    fetch(`/api/matches/${matchId}`, { method: 'DELETE' }).catch((err) => {
      console.warn('Erro ao chamar DELETE /api/matches:', err);
    });

    const matchToDelete = matches.find((m) => m.id === matchId);

    // 1. Remove match from list
    const updatedMatches = matches.filter((m) => m.id !== matchId);
    saveMatches(updatedMatches);
    setMatches(updatedMatches);

    // 2. Remove feedbacks associated with this match
    deleteFeedbacksForMatch(matchId);

    // 3. Deduct player stats (wins, losses, draws, matchesPlayed) if match was finalized
    if (matchToDelete.status === 'finalizada' && matchToDelete.finalScore) {
      const { teamASets, teamBSets } = matchToDelete.finalScore;
      const isDraw = teamASets === teamBSets;
      const teamAWon = teamASets > teamBSets;
      const teamBWon = teamBSets > teamASets;

      const currentPlayers = getStoredPlayers();
      const updatedPlayers = currentPlayers.map((p) => {
        const inA = matchToDelete.teamA?.playerIds.includes(p.id);
        const inB = matchToDelete.teamB?.playerIds.includes(p.id);

        if (!inA && !inB) return p;

        if (isDraw) {
          return {
            ...p,
            matchesPlayed: Math.max(0, p.matchesPlayed - 1),
            draws: Math.max(0, (p.draws || 0) - 1),
          };
        }

        const isWinner = (inA && teamAWon) || (inB && teamBWon);
        return {
          ...p,
          matchesPlayed: Math.max(0, p.matchesPlayed - 1),
          wins: isWinner ? Math.max(0, p.wins - 1) : p.wins,
          losses: !isWinner ? Math.max(0, p.losses - 1) : p.losses,
        };
      });
      savePlayers(updatedPlayers);
    }

    // 4. Recalculate dynamic ratings after deleting feedbacks
    const refreshedPlayers = recalculateAllPlayerRatings();
    setPlayers(refreshedPlayers);
    setFeedbackCount((c) => c + 1);
  };

  // Login handler
  const handleLogin = (phone: string, newPlayerName?: string, photoUrl?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    let existingPlayer = players.find((p) => p.phone.replace(/\D/g, '') === cleanPhone);

    let updatedPlayersList = [...players];

    if (!existingPlayer && newPlayerName) {
      // Create new player
      const randomBg = AVATAR_BG_OPTIONS[Math.floor(Math.random() * AVATAR_BG_OPTIONS.length)];
      existingPlayer = {
        id: `p_${Date.now()}`,
        name: newPlayerName,
        phone: cleanPhone,
        photoUrl,
        rating: 3.0, // Default baseline rating (3.0 for 0 votes)
        ratingCount: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        matchesPlayed: 0,
        avatarBg: randomBg,
        isAdmin: false,
        active: true,
      };

      updatedPlayersList.push(existingPlayer);
      savePlayers(updatedPlayersList);
      setPlayers(updatedPlayersList);
    }

    const newSession: UserSession = {
      phone: cleanPhone,
      player: existingPlayer,
      isLoggedIn: true,
      isAdmin: existingPlayer?.isAdmin || false,
    };

    setSession(newSession);
    saveSession(newSession);
    setShowAuthModal(false);
  };

  // Add new player via Admin
  const handleAddPlayer = (name: string, phone: string, photoUrl?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const randomBg = AVATAR_BG_OPTIONS[Math.floor(Math.random() * AVATAR_BG_OPTIONS.length)];

    const newPlayer: Player = {
      id: `p_${Date.now()}`,
      name,
      phone: cleanPhone,
      photoUrl,
      rating: 3.0,
      ratingCount: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      matchesPlayed: 0,
      avatarBg: randomBg,
      isAdmin: false,
      active: true,
    };

    const updated = [...players, newPlayer];
    savePlayers(updated);
    setPlayers(updated);
  };

  // Add new guest player (no registration, fixed rating 3.0)
  const handleAddGuest = (guestName?: string): Player => {
    const existingGuests = players.filter((p) => p.isGuest || p.name.includes('(Convidado)') || p.name.startsWith('Convidado'));
    const guestIndex = existingGuests.length + 1;
    const rawName = guestName?.trim();

    let finalName = rawName || `Convidado ${guestIndex}`;
    if (rawName && !rawName.toLowerCase().includes('convidado')) {
      finalName = `${rawName} (Convidado)`;
    }

    const randomBg = AVATAR_BG_OPTIONS[Math.floor(Math.random() * AVATAR_BG_OPTIONS.length)];

    const newGuest: Player = {
      id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: finalName,
      phone: '',
      rating: 3.0,
      ratingCount: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      matchesPlayed: 0,
      avatarBg: randomBg,
      isAdmin: false,
      active: true,
      isGuest: true,
    };

    const updated = [...players, newGuest];
    savePlayers(updated);
    setPlayers(updated);
    return newGuest;
  };

  const handleUpdatePlayer = (updatedPlayer: Player) => {
    const updated = players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p));
    savePlayers(updated);
    setPlayers(updated);
  };

  const handleSaveProfile = (updatedPlayer: Player) => {
    handleUpdatePlayer(updatedPlayer);
    if (session) {
      const updatedSession: UserSession = {
        ...session,
        player: updatedPlayer,
      };
      setSession(updatedSession);
      saveSession(updatedSession);
    }
  };

  const handleDeletePlayer = (playerId: string) => {
    // 1. Remove player from players list
    const updatedPlayers = players.filter((p) => p.id !== playerId);
    savePlayers(updatedPlayers);
    setPlayers(updatedPlayers);

    // 2. Remove player from present lists / teams in active or scheduled matches
    const updatedMatches = matches.map((m) => {
      if (m.status === 'agendada' || m.status === 'em_andamento') {
        return {
          ...m,
          presentPlayerIds: m.presentPlayerIds.filter((id) => id !== playerId),
          teamA: m.teamA
            ? { ...m.teamA, playerIds: m.teamA.playerIds.filter((id) => id !== playerId) }
            : m.teamA,
          teamB: m.teamB
            ? { ...m.teamB, playerIds: m.teamB.playerIds.filter((id) => id !== playerId) }
            : m.teamB,
        };
      }
      return m;
    });
    saveMatches(updatedMatches);
    setMatches(updatedMatches);

    // 3. Clear session if deleted player is currently logged in
    if (session?.player?.id === playerId) {
      setSession(null);
      localStorage.removeItem('volley_session');
    }
  };

  const handleToggleAdmin = (playerId: string) => {
    if (!session?.isAdmin) return;
    const updated = players.map((p) => {
      if (p.id === playerId) {
        return { ...p, isAdmin: !p.isAdmin };
      }
      return p;
    });
    savePlayers(updated);
    setPlayers(updated);

    if (session?.player?.id === playerId) {
      const updatedPlayer = updated.find((p) => p.id === playerId);
      setSession({
        ...session,
        player: updatedPlayer,
        isAdmin: updatedPlayer?.isAdmin || false,
      });
    }
  };

  const handleUpdateMatch = (updatedMatch: Match) => {
    const exists = matches.some((m) => m.id === updatedMatch.id);
    let updatedMatchesList: Match[];

    if (exists) {
      updatedMatchesList = matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
    } else {
      updatedMatchesList = [updatedMatch, ...matches];
    }

    saveMatches(updatedMatchesList);
    setMatches(updatedMatchesList);

    // If match was finalized, update players wins / losses / draws stats
    if (updatedMatch.status === 'finalizada' && updatedMatch.finalScore) {
      const { teamASets, teamBSets } = updatedMatch.finalScore;
      const isDraw = teamASets === teamBSets;
      const teamAWon = teamASets > teamBSets;
      const teamBWon = teamBSets > teamASets;

      const newPlayers = players.map((p) => {
        const inA = updatedMatch.teamA.playerIds.includes(p.id);
        const inB = updatedMatch.teamB.playerIds.includes(p.id);

        if (!inA && !inB) return p;

        if (isDraw) {
          return {
            ...p,
            matchesPlayed: p.matchesPlayed + 1,
            draws: (p.draws || 0) + 1,
          };
        }

        const isWinner = (inA && teamAWon) || (inB && teamBWon);
        return {
          ...p,
          matchesPlayed: p.matchesPlayed + 1,
          wins: isWinner ? p.wins + 1 : p.wins,
          losses: !isWinner ? p.losses + 1 : p.losses,
        };
      });

      savePlayers(newPlayers);
      setPlayers(newPlayers);
    }
  };

  const handleResetPlayerStats = () => {
    const updatedPlayers = players.map((p) => ({
      ...p,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    }));
    savePlayers(updatedPlayers);
    setPlayers(updatedPlayers);
  };

  const [feedbackCount, setFeedbackCount] = useState<number>(0);

  const handleFeedbackSubmitted = () => {
    const updatedRatings = recalculateAllPlayerRatings();
    const updated = recalculatePlayerMvpCounts(updatedRatings, matches);
    setPlayers(updated);
    setFeedbackCount((c) => c + 1);
  };

  const handleResetData = () => {
    resetAllData();
    window.location.reload();
  };

  // Check if current logged-in user has pending feedback for any finalized match where they played
  const unratedMatch = React.useMemo(() => {
    if (!session?.isLoggedIn || !session?.phone || !session?.player) return null;
    const cleanUserPhone = session.phone.replace(/\D/g, '');
    const userId = session.player.id;
    const balanceFeedbacks = getStoredBalanceFeedbacks();

    // Sort finalized matches by most recent first
    const finalized = matches
      .filter((m) => m.status === 'finalizada')
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

    return (
      finalized.find((m) => {
        const played = m.teamA?.playerIds.includes(userId) || m.teamB?.playerIds.includes(userId);
        const rated = balanceFeedbacks.some(
          (f) => f.matchId === m.id && f.evaluatorPhone?.replace(/\D/g, '') === cleanUserPhone
        );
        return played && !rated;
      }) || null
    );
  }, [session, matches, feedbackCount]);

  const hasPendingFeedback = !!unratedMatch;

  if (!session || !session.isLoggedIn) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-100 text-slate-900 font-sans antialiased flex justify-center">
        <div className="w-full max-w-lg min-h-[100dvh] flex flex-col bg-slate-50 border-x-0 sm:border-x border-slate-200/60 shadow-2xl relative">
          <LoginPage players={players} onLogin={handleLogin} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 text-slate-900 font-sans antialiased flex justify-center">
      {/* Mobile viewport container */}
      <div className="w-full max-w-lg min-h-[100dvh] flex flex-col bg-slate-50 border-x-0 sm:border-x border-slate-200/60 shadow-2xl relative">
        {/* Header */}
        <Header
          session={session}
          onOpenAuth={() => setShowProfileModal(true)}
          onLogout={handleLogout}
          matchStatus={currentMatch?.status}
        />

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto px-3.5 sm:px-4 pt-3.5 pb-32">
          {activeTab === 'game' && (
            <GameDayTab
              players={players}
              currentMatch={currentMatch}
              pastMatches={pastMatches}
              session={session}
              unratedMatch={unratedMatch}
              onUpdateMatch={handleUpdateMatch}
              onDeleteMatch={handleDeleteMatch}
              onNavigateToFeedback={() => setActiveTab('feedback')}
              onStartManualMatch={handleStartManualMatch}
              onAddGuest={handleAddGuest}
              onDeleteGuest={handleDeletePlayer}
            />
          )}

          {activeTab === 'feedback' && (
            <FeedbackTab
              currentMatch={currentMatch}
              pastMatches={pastMatches}
              players={players}
              session={session}
              onOpenAuth={() => setShowProfileModal(true)}
              onFeedbackSubmitted={handleFeedbackSubmitted}
            />
          )}

          {activeTab === 'ranking' && <RankingTab players={players} />}

          {activeTab === 'admin' && (
            <AdminTab
              players={players}
              pastMatches={pastMatches}
              session={session}
              onAddPlayer={handleAddPlayer}
              onUpdatePlayer={handleUpdatePlayer}
              onDeletePlayer={handleDeletePlayer}
              onToggleAdmin={handleToggleAdmin}
              onOpenAuth={() => setShowProfileModal(true)}
              onDeleteMatch={handleDeleteMatch}
              onResetPlayerStats={handleResetPlayerStats}
            />
          )}
        </main>

        {/* Bottom Navigation */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          hasPendingFeedback={hasPendingFeedback}
        />

        {/* Phone Login Modal */}
        {showAuthModal && (
          <PhoneAuthModal
            players={players}
            onLogin={handleLogin}
            onClose={() => setShowAuthModal(false)}
            currentPhone={session?.phone}
          />
        )}

        {/* Profile Edit Modal */}
        {showProfileModal && session?.player && (
          <EditProfileModal
            player={session.player}
            onSave={handleSaveProfile}
            onLogout={handleLogout}
            onClose={() => setShowProfileModal(false)}
            onOpenPlayerScores={() => {
              if (session.player?.isAdmin) {
                setShowPlayerScoresModal(true);
              }
            }}
          />
        )}

        {/* Player Scores & Votes Modal (Admin only) */}
        {showPlayerScoresModal && session?.player?.isAdmin && (
          <PlayerScoresModal
            isOpen={showPlayerScoresModal}
            onClose={() => setShowPlayerScoresModal(false)}
            players={players}
            pastMatches={matches}
          />
        )}
      </div>
    </div>
  );
}
