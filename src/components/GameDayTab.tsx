import React, { useState, useEffect } from 'react';
import {
  Volleyball,
  Users,
  Shuffle,
  Play,
  CheckCircle2,
  Trash2,
  ArrowUpDown,
  Trophy,
  Sparkles,
  ChevronRight,
  Star,
  UserPlus,
  X,
  Plus,
  MessageCircle,
} from 'lucide-react';
import { Player, Match, UserSession } from '../types';
import { generateBalancedTeams } from '../utils/teamGenerator';
import { PlayerAvatar } from './PlayerAvatar';
import { ShareTeamsModal } from './ShareTeamsModal';
import { MvpBannerCard } from './MvpBannerCard';

interface GameDayTabProps {
  players: Player[];
  currentMatch: Match | null;
  pastMatches: Match[];
  session: UserSession | null;
  unratedMatch: Match | null;
  onUpdateMatch: (match: Match) => void;
  onDeleteMatch: (matchId: string) => void;
  onNavigateToFeedback: () => void;
  onStartManualMatch: () => void;
  onAddGuest?: (guestName?: string) => Player;
  onDeleteGuest?: (playerId: string) => void;
}

export const GameDayTab: React.FC<GameDayTabProps> = ({
  players,
  currentMatch,
  pastMatches,
  session,
  unratedMatch,
  onUpdateMatch,
  onDeleteMatch,
  onNavigateToFeedback,
  onStartManualMatch,
  onAddGuest,
  onDeleteGuest,
}) => {
  const [selectedPresentIds, setSelectedPresentIds] = useState<string[]>(() => {
    if (currentMatch && currentMatch.presentPlayerIds && currentMatch.presentPlayerIds.length > 0) {
      return currentMatch.presentPlayerIds;
    }
    // Padrão: pré-marcar todos os jogadores ativos locais
    return players.filter((p) => p.active !== false).map((p) => p.id);
  });

  const [draftMatch, setDraftMatch] = useState<Match | null>(() => {
    if (currentMatch) return currentMatch;
    return null;
  });

  // Mantém draft sincronizado quando a rodada estiver em andamento (já iniciada)
  useEffect(() => {
    if (currentMatch && currentMatch.status === 'em_andamento') {
      setDraftMatch(currentMatch);
      if (currentMatch.presentPlayerIds) {
        setSelectedPresentIds(currentMatch.presentPlayerIds);
      }
    }
  }, [currentMatch]);

  const [swapPlayerA, setSwapPlayerA] = useState<string | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [showShareTeamsModal, setShowShareTeamsModal] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState('');

  const handleAddGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddGuest) return;

    const newGuest = onAddGuest(guestNameInput);
    setGuestNameInput('');
    setShowAddGuestModal(false);

    // Auto select guest in local presence (sem salvar no DB ainda)
    setSelectedPresentIds((prev) => [...prev, newGuest.id]);
  };

  // Set wins count for finalizing match
  const [teamASets, setTeamASets] = useState<number>(
    currentMatch?.finalScore?.teamASets ?? currentMatch?.teamA?.setWins ?? 2
  );
  const [teamBSets, setTeamBSets] = useState<number>(
    currentMatch?.finalScore?.teamBSets ?? currentMatch?.teamB?.setWins ?? 1
  );

  const togglePresence = (id: string) => {
    setSelectedPresentIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const allActiveIds = players.filter((p) => p.active !== false).map((p) => p.id);
    setSelectedPresentIds(allActiveIds);
  };

  // Match ativo (em andamento) ou draft local
  const activeMatch = currentMatch?.status === 'em_andamento' ? currentMatch : draftMatch;

  const handleGenerateTeams = () => {
    const presentPlayers = players.filter((p) => selectedPresentIds.includes(p.id));
    if (presentPlayers.length < 2) {
      alert('Selecione pelo menos 2 jogadores presentes!');
      return;
    }

    const { teamA, teamB } = generateBalancedTeams(presentPlayers, pastMatches, {
      teamAColor: 'bg-blue-600',
      teamBColor: 'bg-amber-600',
    });

    const dateFormatted = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const newDraft: Match = {
      id: activeMatch ? activeMatch.id : `match_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      title: activeMatch?.title || `Rodada de Vôlei (${dateFormatted})`,
      status: 'agendada',
      teamA,
      teamB,
      presentPlayerIds: selectedPresentIds,
      createdAt: activeMatch?.createdAt || new Date().toISOString(),
    };

    // Atualiza apenas o estado local (zero chamadas de banco de dados)
    setDraftMatch(newDraft);
    setSwapPlayerA(null);
    setIsSwapping(false);
  };

  const handleManualSwap = (playerId: string) => {
    if (!activeMatch || !activeMatch.teamA || !activeMatch.teamB) return;
    if (!swapPlayerA) {
      setSwapPlayerA(playerId);
      return;
    }

    if (swapPlayerA === playerId) {
      setSwapPlayerA(null);
      return;
    }

    const inA1 = activeMatch.teamA.playerIds.includes(swapPlayerA);
    const inA2 = activeMatch.teamA.playerIds.includes(playerId);

    if (inA1 === inA2) {
      setSwapPlayerA(playerId);
      return;
    }

    const teamAPlayerIds = inA1
      ? activeMatch.teamA.playerIds.map((id) => (id === swapPlayerA ? playerId : id))
      : activeMatch.teamA.playerIds.map((id) => (id === playerId ? swapPlayerA : id));

    const teamBPlayerIds = !inA1
      ? activeMatch.teamB.playerIds.map((id) => (id === swapPlayerA ? playerId : id))
      : activeMatch.teamB.playerIds.map((id) => (id === playerId ? swapPlayerA : id));

    const updatedMatch: Match = {
      ...activeMatch,
      teamA: { ...activeMatch.teamA, playerIds: teamAPlayerIds },
      teamB: { ...activeMatch.teamB, playerIds: teamBPlayerIds },
    };

    if (activeMatch.status === 'em_andamento') {
      onUpdateMatch(updatedMatch);
    } else {
      setDraftMatch(updatedMatch);
    }
    setSwapPlayerA(null);
  };

  // Ao clicar em COMEÇAR RODADA: vincula e persiste efetivamente no banco de dados
  const handleStartRound = () => {
    if (!activeMatch || !activeMatch.teamA || !activeMatch.teamB) {
      alert('Sorteie os times antes de começar a rodada!');
      return;
    }
    const startedMatch: Match = {
      ...activeMatch,
      status: 'em_andamento',
      presentPlayerIds: selectedPresentIds,
    };
    onUpdateMatch(startedMatch);
    setDraftMatch(startedMatch);
    setIsSwapping(false);
  };

  const handleFinalizeMatch = () => {
    if (!activeMatch) return;

    const updatedMatch: Match = {
      ...activeMatch,
      status: 'finalizada',
      setScores: [],
      teamA: { ...activeMatch.teamA, setWins: teamASets },
      teamB: { ...activeMatch.teamB, setWins: teamBSets },
      finalScore: {
        teamASets: teamASets,
        teamBSets: teamBSets,
      },
      finalizedAt: new Date().toISOString(),
    };

    onUpdateMatch(updatedMatch);
  };

  const handleConfirmDelete = () => {
    if (!activeMatch) return;
    setShowDeleteModal(true);
  };

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  // Active match is any match that is agendada (draft local) or em_andamento (em jogo)
  const hasActiveMatch = !!activeMatch;

  // Finalized matches from the last 24h (or the single most recent one if older)
  const recentFinalizedMatches = React.useMemo(() => {
    const finalized = pastMatches.filter((m) => m.status === 'finalizada');
    if (finalized.length === 0) return [];

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const within24h = finalized.filter((m) => {
      const finTime = m.finalizedAt
        ? new Date(m.finalizedAt).getTime()
        : m.createdAt
        ? new Date(m.createdAt).getTime()
        : new Date(m.date + 'T00:00:00').getTime();
      return now - finTime < TWENTY_FOUR_HOURS_MS;
    });

    // If there are matches within 24h, return all of them; otherwise return the most recent one
    return within24h.length > 0 ? within24h : [finalized[0]];
  }, [pastMatches]);

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* 0. MVP Banner Cards (Top of Game Day - Hidden when a round is 'em_andamento') */}
      {activeMatch?.status !== 'em_andamento' &&
        recentFinalizedMatches.map((match) => (
          <MvpBannerCard
            key={match.id}
            lastFinalizedMatch={match}
            players={players}
            session={session}
            onNavigateToFeedback={onNavigateToFeedback}
          />
        ))}

      {/* 1. Pending Feedback Banner (If user has unrated finalized match) */}
      {unratedMatch && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-3xl p-4.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
              <Star className="w-5.5 h-5.5 fill-white" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-900 text-xs font-extrabold uppercase tracking-wider rounded-md inline-block mb-1">
                Avaliação Pendente
              </span>
              <h4 className="text-sm sm:text-base font-extrabold text-amber-950">
                {unratedMatch.title}
              </h4>
              <p className="text-xs text-amber-900 font-medium">
                Avalie o equilíbrio dos times para manter as notas atualizadas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToFeedback}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow transition-all shrink-0 cursor-pointer flex items-center gap-1"
          >
            Avaliar <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. No Active Round View -> Render "Iniciar uma rodada de vôlei hoje" */}
      {!hasActiveMatch && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 text-center space-y-4 my-2">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Volleyball className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Nenhuma rodada em andamento</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Clique no botão abaixo para iniciar a rodada de hoje, escalar os atletas e sortear as equipes!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const dateFormatted = new Date().toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
              setDraftMatch({
                id: `match_${Date.now()}`,
                date: new Date().toISOString().split('T')[0],
                title: `Rodada de Vôlei (${dateFormatted})`,
                status: 'agendada',
                teamA: { id: 'teamA', name: 'Time A', color: 'bg-blue-600', playerIds: [], setWins: 0 },
                teamB: { id: 'teamB', name: 'Time B', color: 'bg-amber-600', playerIds: [], setWins: 0 },
                presentPlayerIds: selectedPresentIds,
                createdAt: new Date().toISOString(),
              });
            }}
            className="w-full py-4 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <Volleyball className="w-5 h-5" />
            Montar e sortear times de vôlei hoje
          </button>
        </div>
      )}

      {/* 3. Active Round View (Status 'agendada' or 'em_andamento') */}
      {hasActiveMatch && activeMatch && (
        <>
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start justify-between">
              <div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-wider rounded-full inline-block mb-2">
                  {activeMatch.status === 'em_andamento' ? '🔥 Rodada Em Andamento' : '⚡ Montando Times'}
                </span>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">{activeMatch.title}</h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 flex items-center gap-1.5 font-medium">
                  <span>📅 {new Date(activeMatch.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                  <span>•</span>
                  <span>{selectedPresentIds.length} Atletas Confirmados</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  title="Excluir/Cancelar Rodada"
                  className="p-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-400 font-bold shadow-inner shrink-0">
                  <Volleyball className="w-6.5 h-6.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Presence Selection ("Quem vai jogar hoje?") - Available while status is 'agendada' */}
          {activeMatch.status === 'agendada' && (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    Quem vai jogar hoje?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Marque os atletas presentes na quadra</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAddGuestModal(true)}
                    className="text-xs font-black text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1 shadow-2xs transition-all"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-purple-600" />
                    + Convidado
                  </button>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs font-extrabold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                  >
                    Marcar Todos ({players.length})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[...players]
                  .sort((a, b) => {
                    if (a.isGuest && !b.isGuest) return 1;
                    if (!a.isGuest && b.isGuest) return -1;
                    const mA = a.matchesPlayed || 0;
                    const mB = b.matchesPlayed || 0;
                    if (mB !== mA) return mB - mA;
                    return a.name.localeCompare(b.name, 'pt-BR');
                  })
                  .map((p) => {
                    const isSelected = selectedPresentIds.includes(p.id);
                    return (
                      <div key={p.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => togglePresence(p.id)}
                          className={`w-full p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${isSelected
                              ? p.isGuest
                                ? 'bg-purple-50/95 border-purple-300 ring-2 ring-purple-500/20'
                                : 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/20'
                              : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                        >
                          <PlayerAvatar player={p} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-900 truncate">{p.name}</p>
                            {p.isGuest ? (
                              <p className="text-xs text-purple-700 font-extrabold flex items-center gap-0.5 truncate">
                                Convidado
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 font-semibold">{p.matchesPlayed || 0} jogos</p>
                            )}
                          </div>
                        </button>
                        {p.isGuest && onDeleteGuest && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteGuest(p.id);
                            }}
                            title="Remover convidado"
                            className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm transition-all cursor-pointer opacity-90 hover:opacity-100 z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerateTeams}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <Shuffle className="w-5 h-5" />
                  Sortear Times Equilibrados ({selectedPresentIds.length} Atletas)
                </button>
              </div>
            </div>
          )}

          {/* Teams Grid & Match Controls */}
          {activeMatch.teamA && activeMatch.teamB && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Confronto Equilibrado
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowShareTeamsModal(true)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 active:scale-98 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-white" />
                    <span>Compartilhar Times</span>
                  </button>
                  {activeMatch.status === 'agendada' && (
                    <button
                      type="button"
                      onClick={() => setIsSwapping(!isSwapping)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1 cursor-pointer ${isSwapping
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      {isSwapping ? 'Cancelar Troca' : 'Troca Manual'}
                    </button>
                  )}
                </div>
              </div>

              {isSwapping && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium">
                  💡 Modo Troca Ativado: Clique em um jogador de cada time para alterná-los entre as equipes.
                </div>
              )}

              {/* Teams Display */}
              {(() => {
                const teamAPlayersList = (activeMatch.teamA.playerIds || []).map((id) => getPlayer(id)).filter(Boolean) as Player[];
                const teamBPlayersList = (activeMatch.teamB.playerIds || []).map((id) => getPlayer(id)).filter(Boolean) as Player[];

                const allPlayers = [...teamAPlayersList, ...teamBPlayersList];
                const isOdd = allPlayers.length % 2 !== 0;

                let weakestPlayerId: string | null = null;
                if (isOdd && allPlayers.length > 0) {
                  const sortedByRating = [...allPlayers].sort((a, b) => {
                    const rA = a.rating ?? 3.0;
                    const rB = b.rating ?? 3.0;
                    if (rA !== rB) return rA - rB;
                    return (a.matchesPlayed || 0) - (b.matchesPlayed || 0);
                  });
                  weakestPlayerId = sortedByRating[0].id;
                }

                const teamAPlayersFiltered = weakestPlayerId
                  ? teamAPlayersList.filter((p) => p.id !== weakestPlayerId)
                  : teamAPlayersList;
                const teamASum = teamAPlayersFiltered.reduce((acc, p) => acc + (p.rating ?? 3.0), 0);
                const teamAAvg = teamAPlayersFiltered.length ? teamASum / teamAPlayersFiltered.length : 0;

                const teamBPlayersFiltered = weakestPlayerId
                  ? teamBPlayersList.filter((p) => p.id !== weakestPlayerId)
                  : teamBPlayersList;
                const teamBSum = teamBPlayersFiltered.reduce((acc, p) => acc + (p.rating ?? 3.0), 0);
                const teamBAvg = teamBPlayersFiltered.length ? teamBSum / teamBPlayersFiltered.length : 0;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* TEAM A */}
                    <div className="bg-white rounded-3xl border-2 border-blue-100 shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-base tracking-tight">{activeMatch.teamA.name}</h4>
                          <p className="text-[11px] text-blue-100 font-medium">
                            {activeMatch.teamA.playerIds.length} Jogadores
                          </p>
                        </div>
                        <div className="bg-white/20 px-2.5 py-1 rounded-xl backdrop-blur-xs border border-white/25 shrink-0 text-xs sm:text-sm font-black text-white flex items-center gap-1">
                          <span>{teamAAvg.toFixed(1)}</span>
                          <span className="text-amber-300">★</span>
                        </div>
                      </div>

                      <div className="p-3 divide-y divide-slate-100">
                        {activeMatch.teamA.playerIds.map((id) => {
                          const p = getPlayer(id);
                          if (!p) return null;
                          const isSelectedForSwap = swapPlayerA === p.id;

                          return (
                            <div
                              key={p.id}
                              onClick={() => isSwapping && handleManualSwap(p.id)}
                              className={`py-2.5 px-2 flex items-center justify-between transition-all rounded-xl ${isSwapping ? 'cursor-pointer hover:bg-blue-50' : ''
                                } ${isSelectedForSwap ? 'bg-amber-100 ring-2 ring-amber-500' : ''}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <PlayerAvatar player={p} size="sm" />
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{p.name}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* TEAM B */}
                    <div className="bg-white rounded-3xl border-2 border-amber-100 shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-base tracking-tight">{activeMatch.teamB.name}</h4>
                          <p className="text-[11px] text-amber-100 font-medium">
                            {activeMatch.teamB.playerIds.length} Jogadores
                          </p>
                        </div>
                        <div className="bg-white/20 px-2.5 py-1 rounded-xl backdrop-blur-xs border border-white/25 shrink-0 text-xs sm:text-sm font-black text-white flex items-center gap-1">
                          <span>{teamBAvg.toFixed(1)}</span>
                          <span className="text-amber-300">★</span>
                        </div>
                      </div>

                      <div className="p-3 divide-y divide-slate-100">
                        {activeMatch.teamB.playerIds.map((id) => {
                          const p = getPlayer(id);
                          if (!p) return null;
                          const isSelectedForSwap = swapPlayerA === p.id;

                          return (
                            <div
                              key={p.id}
                              onClick={() => isSwapping && handleManualSwap(p.id)}
                              className={`py-2.5 px-2 flex items-center justify-between transition-all rounded-xl ${isSwapping ? 'cursor-pointer hover:bg-amber-50' : ''
                                } ${isSelectedForSwap ? 'bg-amber-100 ring-2 ring-amber-500' : ''}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <PlayerAvatar player={p} size="sm" />
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{p.name}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* WhatsApp Share CTA Button */}
              <button
                type="button"
                onClick={() => setShowShareTeamsModal(true)}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>Compartilhar Imagem dos Times no WhatsApp</span>
              </button>

              {/* Start Round CTA (if status is 'agendada') */}
              {activeMatch.status === 'agendada' && (
                <div className="bg-slate-900 text-white rounded-3xl p-5 space-y-3 shadow-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <Play className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                    <h4 className="text-sm font-bold">Prontos para jogar?</h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Clique em <strong>Começar Rodada</strong> para travar os sorteios e liberar a contagem do placar para qualquer jogador.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleStartRound}
                      className="flex-1 py-4 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-slate-950" />
                      Começar Rodada
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="py-3 px-4 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-xs rounded-2xl border border-rose-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                      Cancelar Rodada
                    </button>
                  </div>
                </div>
              )}

              {/* Finalize Score Controls (Unlocked when status is 'em_andamento') */}
              {activeMatch.status === 'em_andamento' && (
                <div className="bg-slate-900 text-white rounded-3xl p-5 space-y-4 shadow-xl border border-slate-800">
                  <div>
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-emerald-400" />
                      Placar Final de Sets
                    </h4>
                    <p className="text-xs text-slate-400">Marque o resultado final para encerrar a rodada</p>
                  </div>

                  {/* Sets Won Input Row */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-800/90 p-4 rounded-2xl">
                    {/* Team A Sets */}
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-slate-900/60 rounded-xl border border-blue-500/30">
                      <span className="text-xs font-bold text-blue-400 truncate max-w-[130px]">{activeMatch.teamA.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTeamASets(Math.max(0, teamASets - 1))}
                          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-white text-base flex items-center justify-center cursor-pointer border border-slate-700"
                        >
                          -
                        </button>
                        <span className="text-xl font-extrabold text-white w-6 text-center">{teamASets}</span>
                        <button
                          type="button"
                          onClick={() => setTeamASets(teamASets + 1)}
                          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-white text-base flex items-center justify-center cursor-pointer border border-slate-700"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">sets vencidos</span>
                    </div>

                    {/* Team B Sets */}
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-slate-900/60 rounded-xl border border-amber-500/30">
                      <span className="text-xs font-bold text-amber-400 truncate max-w-[130px]">{activeMatch.teamB.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTeamBSets(Math.max(0, teamBSets - 1))}
                          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-white text-base flex items-center justify-center cursor-pointer border border-slate-700"
                        >
                          -
                        </button>
                        <span className="text-xl font-extrabold text-white w-6 text-center">{teamBSets}</span>
                        <button
                          type="button"
                          onClick={() => setTeamBSets(teamBSets + 1)}
                          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-white text-base flex items-center justify-center cursor-pointer border border-slate-700"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">sets vencidos</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleFinalizeMatch}
                      className="flex-1 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Finalizar Rodada
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="py-3.5 px-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-xs rounded-2xl border border-rose-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {/* Delete / Cancel Round Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Excluir e Cancelar Rodada?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Esta ação irá cancelar a rodada iniciada e remover os times montados. Todos no grupo poderão iniciar uma nova rodada quando quiserem.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeMatch) {
                    onDeleteMatch(activeMatch.id);
                    setDraftMatch(null);
                  }
                  setShowDeleteModal(false);
                }}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow-md shadow-rose-600/20"
              >
                Sim, Cancelar e Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddGuestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Adicionar Convidado</h3>
                  <p className="text-[11px] text-purple-700 font-bold">Nota 3.0 fixa para o sorteio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddGuestModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddGuestSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Convidado
                </label>
                <input
                  type="text"
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  placeholder="Ex: Carlos (Convidado)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Os convidados são atletas sem cadastro. Para o balanceamento dos times, o sistema utilizará a nota 3.0 para calcular a força da equipe.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddGuestModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold rounded-2xl shadow-md shadow-purple-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showShareTeamsModal && activeMatch && (
        <ShareTeamsModal
          match={activeMatch}
          players={players}
          onClose={() => setShowShareTeamsModal(false)}
        />
      )}
    </div>
  );
};
