import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Star, CheckCircle2, ShieldAlert, Award, ThumbsUp, ThumbsDown, Crown, Loader2, AlertCircle } from 'lucide-react';
import { Match, Player, UserSession } from '../types';
import {
  submitFeedbackToServer,
  cleanPhone,
  getStoredBalanceFeedbacks,
  logActivity,
} from '../utils/storage';
import { StarRating } from './StarRating';
import { votingOpen, mvpVotingOpen } from '../utils/seasons';
import { PlayerAvatar } from './PlayerAvatar';
import { UserMatchResultBadge } from './UserMatchResultBadge';

interface FeedbackTabProps {
  currentMatch: Match | null;
  pastMatches: Match[];
  players: Player[];
  session: UserSession | null;
  onOpenAuth: () => void;
  onFeedbackSubmitted: () => void;
}

export const FeedbackTab: React.FC<FeedbackTabProps> = ({
  currentMatch,
  pastMatches,
  players,
  session,
  onOpenAuth,
  onFeedbackSubmitted,
}) => {
  const currentUser = session?.player;
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const userPhone = session?.phone || '';

  // Local state trigger to recalculate pending matches when feedback is submitted
  const [submissionCount, setSubmissionCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Form input states
  const [wasBalanced, setWasBalanced] = useState<boolean | null>(null);
  const [strongerTeam, setStrongerTeam] = useState<'teamA' | 'teamB' | null>(null);
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});
  const [selectedMvpId, setSelectedMvpId] = useState<string | null>(null);

  // Validation error states for each card
  const [validationErrors, setValidationErrors] = useState<{
    balance?: boolean;
    ratings?: boolean;
    mvp?: boolean;
  }>({});

  // Refs for scrolling to invalid cards
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);

  // Get all finalized matches, sorted by most recent first
  const allFinalizedMatches = useMemo(() => {
    const list = [
      ...(currentMatch?.status === 'finalizada' ? [currentMatch] : []),
      ...pastMatches.filter((m) => m.status === 'finalizada' && m.id !== currentMatch?.id),
    ];
    return list.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
  }, [currentMatch, pastMatches]);

  // Pending unrated matches where the logged in user actually played
  const pendingMatchesToRate = useMemo(() => {
    if (!currentUser || !userPhone) return [];
    const balanceFeedbacks = getStoredBalanceFeedbacks();
    const cleanUserPhone = cleanPhone(userPhone);

    return allFinalizedMatches.filter((m) => {
      if (!votingOpen(m)) return false;
      const played =
        m.teamA?.playerIds?.includes(currentUser.id) ||
        m.teamB?.playerIds?.includes(currentUser.id) ||
        m.presentPlayerIds?.includes(currentUser.id);
      if (!played) return false;

      const rated = balanceFeedbacks.some(
        (f) => f.matchId === m.id && cleanPhone(f.evaluatorPhone) === cleanUserPhone
      );
      return !rated;
    });
  }, [allFinalizedMatches, currentUser, userPhone, submissionCount, clock]);

  // A WhatsApp link prioritizes its match; authentication and eligibility still apply.
  const requestedMatch = new URLSearchParams(window.location.search).get('match');
  const targetMatch = pendingMatchesToRate.find(m => m.id === requestedMatch) || pendingMatchesToRate[0] || null;
  useEffect(() => {
    setWasBalanced(null); setStrongerTeam(null); setRatingsMap({}); setSelectedMvpId(null); setValidationErrors({}); setServerError(null);
  }, [targetMatch?.id]);

  // Determine all players from both teams who played this match
  const allMatchPlayers = useMemo(() => {
    if (!targetMatch) return [];
    const playerIds = [
      ...(targetMatch.teamA?.playerIds || []),
      ...(targetMatch.teamB?.playerIds || []),
    ];
    const uniqueIds = Array.from(new Set(playerIds));
    return uniqueIds
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as Player[];
  }, [targetMatch, players]);

  // Check if MVP voting window is still open for target match (24 hours or season end) - MUST BE DECLARED BEFORE EARLY RETURNS
  const isMvpVotingOpen = useMemo(() => {
    if (!targetMatch) return false;
    return mvpVotingOpen(targetMatch);
  }, [targetMatch, clock]);

  if (!session?.isLoggedIn || !currentUser) {
    return (
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 text-center space-y-4 my-4 animate-fade-in">
        <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
          <Star className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Identifique-se para Avaliar</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          Digite seu número de telefone para avaliar anonimamente a partida e os companheiros do seu time.
        </p>
        <button
          onClick={onOpenAuth}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer text-sm"
        >
          Informar Meu Telefone
        </button>
      </div>
    );
  }

  // All finalized matches rated or no finalized matches exist
  if (!targetMatch) {
    return (
      <div className="space-y-5 pb-24 animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="px-2.5 py-0.5 bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider rounded-full inline-block mb-1">
                Avaliação Anônima
              </span>
              <h2 className="text-xl font-extrabold tracking-tight">Avaliar Rodada</h2>
              <p className="text-xs text-amber-100 mt-1">Sua nota ajuda a equilibrar o próximo jogo</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shadow-inner">
              <Star className="w-7 h-7 fill-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/80 text-center space-y-4 my-2">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900">Nenhuma avaliação pendente</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Você já avaliou suas rodadas ou o prazo expirou. O MVP fica aberto por até 24 horas e as notas gerais por até 96 horas e encerram na virada da temporada.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine user's team in the target match
  const isInTeamA = targetMatch.teamA?.playerIds?.includes(currentUser.id) ?? false;
  const isInTeamB = targetMatch.teamB?.playerIds?.includes(currentUser.id) ?? false;
  const userTeam = isInTeamA ? targetMatch.teamA : isInTeamB ? targetMatch.teamB : null;

  // Teammates excluding self
  const teammatesToRate = userTeam
    ? (userTeam.playerIds || [])
        .filter((id) => id !== currentUser.id)
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as Player[]
  : [];

  const otherEligiblePlayers = allMatchPlayers.filter((p) => p.id !== currentUser.id);

  const handleRatingChange = (playerId: string, rating: number) => {
    setRatingsMap((prev) => ({ ...prev, [playerId]: rating }));
    setValidationErrors((prev) => ({ ...prev, ratings: false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Check card 1 (Balance)
    const isCard1Invalid =
      wasBalanced === null || (wasBalanced === false && !strongerTeam);

    // 2. Check card 2 (Teammate ratings)
    const isCard2Invalid = teammatesToRate.some(
      (p) => !ratingsMap[p.id] || ratingsMap[p.id] < 1
    );

    // 3. Check card 3 (Match MVP vote) - Only required if MVP voting is still open (24 hours or season end)
    const isCard3Invalid =
      isMvpVotingOpen && otherEligiblePlayers.length > 0 && !selectedMvpId;

    if (isCard1Invalid || isCard2Invalid || isCard3Invalid) {
      setValidationErrors({
        balance: isCard1Invalid,
        ratings: isCard2Invalid,
        mvp: isCard3Invalid,
      });

      // Scroll smoothly to the first invalid card
      if (isCard1Invalid && card1Ref.current) {
        card1Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (isCard2Invalid && card2Ref.current) {
        card2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (isCard3Invalid && card3Ref.current) {
        card3Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Clear any previous error
    setValidationErrors({});
    setServerError(null);
    setIsSubmitting(true);

    try {
      // 1. Array de notas dos colegas
      const ratingsArray = teammatesToRate.map((p) => ({
        targetPlayerId: p.id,
        rating: Number(ratingsMap[p.id]),
      }));

      // 2. Voto no MVP se selecionado e janela aberta
      const votedMvp = isMvpVotingOpen && Boolean(selectedMvpId);
      const matchName = targetMatch.title || `Partida de ${targetMatch.date}`;

      const logsToRecord: any[] = [
        {
          userName: currentUser.name,
          userPhone: cleanPhone(userPhone),
          action: 'Avaliação da Rodada',
          description: `${currentUser.name} registrou avaliação da rodada "${matchName}" (equilíbrio e notas dos colegas de time).`,
          category: 'voto',
        },
      ];

      if (votedMvp) {
        logsToRecord.push({
          userName: currentUser.name,
          userPhone: cleanPhone(userPhone),
          action: 'Voto no Craque (MVP)',
          description: `${currentUser.name} registrou voto anônimo para Craque da Partida da rodada "${matchName}".`,
          category: 'voto',
        });
      }

      // Disparar logs de auditoria imediatamente
      logsToRecord.forEach((log) => {
        try {
          logActivity(log);
        } catch (logErr) {
          console.warn('Erro ao disparar logActivity:', logErr);
        }
      });

      // 3. Envio atômico e seguro para o servidor
      const result = await submitFeedbackToServer({
        matchId: targetMatch.id,
        evaluatorPhone: cleanPhone(userPhone),
        evaluatorPlayerId: currentUser.id,
        balanceFeedback: {
          wasBalanced: wasBalanced!,
          strongerTeam: wasBalanced ? null : strongerTeam,
        },
        ratingFeedbacks: ratingsArray,
        mvpVote: votedMvp && selectedMvpId ? { targetPlayerId: selectedMvpId } : undefined,
        activityLogs: logsToRecord,
      });

      if (!result.success) {
        setServerError(result.error || 'Não foi possível salvar sua avaliação no servidor. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      // 4. Reset form state for next round if any
      setWasBalanced(null);
      setStrongerTeam(null);
      setRatingsMap({});
      setSelectedMvpId(null);
      setValidationErrors({});
      setSubmissionCount((prev) => prev + 1);

      onFeedbackSubmitted();
    } catch (err: any) {
      console.error('Erro ao enviar avaliação:', err);
      setServerError('Falha de comunicação com o servidor. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider rounded-full inline-block">
                Avaliação Anônima
              </span>
              {pendingMatchesToRate.length > 1 && (
                <span className="px-2 py-0.5 bg-amber-900/40 text-amber-100 text-[10px] font-extrabold rounded-full">
                  1 de {pendingMatchesToRate.length} pendentes
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">{targetMatch.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-xs text-amber-100">
                📅 {new Date(targetMatch.date + 'T00:00:00').toLocaleDateString('pt-BR')} • Placar: {targetMatch.finalScore?.teamASets ?? 0} x {targetMatch.finalScore?.teamBSets ?? 0}
              </p>
              <UserMatchResultBadge match={targetMatch} currentUser={currentUser} compact />
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shadow-inner">
            <Star className="w-7 h-7 fill-white" />
          </div>
        </div>
      </div>

      {!userTeam ? (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-center text-xs text-amber-900">
          <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-2" />
          <p className="font-bold text-sm">Você não participou desta rodada</p>
          <p className="mt-1 text-slate-600">
            Apenas os jogadores que estiveram em quadra no <strong>{targetMatch.teamA.name}</strong> ou{' '}
            <strong>{targetMatch.teamB.name}</strong> podem avaliar seus companheiros de time.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Question 1: Balance */}
          <div
            ref={card1Ref}
            className={`bg-white rounded-3xl p-5 shadow-sm transition-all duration-300 space-y-3.5 border ${
              validationErrors.balance
                ? 'border-2 border-rose-500 ring-4 ring-rose-500/20 bg-rose-50/20 animate-shake'
                : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    validationErrors.balance
                      ? 'bg-rose-500 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  1
                </span>
                <h3 className="text-base font-extrabold text-slate-900">O jogo estava balanceado?</h3>
              </div>

              {validationErrors.balance && (
                <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Campo obrigatório
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setWasBalanced(true);
                  setStrongerTeam(null);
                  setValidationErrors((prev) => ({ ...prev, balance: false }));
                }}
                className={`py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base transition-all border cursor-pointer ${
                  wasBalanced === true
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                👍 Sim, foi equilibrado
              </button>

              <button
                type="button"
                onClick={() => {
                  setWasBalanced(false);
                  setValidationErrors((prev) => ({ ...prev, balance: false }));
                }}
                className={`py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base transition-all border cursor-pointer ${
                  wasBalanced === false
                    ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                👎 Não, foi desequilibrado
              </button>
            </div>

            {/* Follow up if NOT balanced */}
            {wasBalanced === false && (
              <div className="mt-3 pt-3 border-t border-slate-100 animate-fade-in space-y-2">
                <p className="text-xs sm:text-sm font-extrabold text-slate-800">Qual time estava mais forte?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStrongerTeam('teamA');
                      setValidationErrors((prev) => ({ ...prev, balance: false }));
                    }}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-black transition-all cursor-pointer ${
                      strongerTeam === 'teamA'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {targetMatch.teamA.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStrongerTeam('teamB');
                      setValidationErrors((prev) => ({ ...prev, balance: false }));
                    }}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-black transition-all cursor-pointer ${
                      strongerTeam === 'teamB'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {targetMatch.teamB.name}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Question 2: Rate teammates */}
          <div
            ref={card2Ref}
            className={`bg-white rounded-3xl p-5 shadow-sm transition-all duration-300 space-y-4 border ${
              validationErrors.ratings
                ? 'border-2 border-rose-500 ring-4 ring-rose-500/20 bg-rose-50/20 animate-shake'
                : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    validationErrors.ratings
                      ? 'bg-rose-500 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  2
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Avalie os jogadores do seu time</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Sua equipe: <strong className="text-emerald-700">{userTeam.name}</strong> (Você não pode se auto-avaliar)
                  </p>
                </div>
              </div>

              {validationErrors.ratings && (
                <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1 shrink-0">
                  <AlertCircle className="w-4 h-4" /> Avalie todos
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {teammatesToRate.map((teammate) => {
                const currentVal = ratingsMap[teammate.id] || 0;
                const isTeammateMissing = validationErrors.ratings && currentVal < 1;

                return (
                  <div
                    key={teammate.id}
                    className={`py-3.5 px-2 rounded-2xl flex items-center justify-between transition-colors ${
                      isTeammateMissing ? 'bg-rose-50/60 ring-1 ring-rose-400/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <PlayerAvatar player={teammate} size="md" />
                      <div>
                        <p className="text-sm font-black text-slate-900">{teammate.name}</p>
                        {isTeammateMissing && (
                          <span className="text-xs text-rose-600 font-extrabold">
                            Nota pendente
                          </span>
                        )}
                      </div>
                    </div>

                    <StarRating
                      value={currentVal}
                      onChange={(r) => handleRatingChange(teammate.id, r)}
                      size="md"
                      showLabel
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Question 3: Vote for Craque da Partida (Match MVP) - Rendered ONLY if within the voting window */}
          {isMvpVotingOpen && (
            <div
              ref={card3Ref}
              className={`bg-white rounded-3xl p-5 shadow-sm transition-all duration-300 space-y-4 border ${
                validationErrors.mvp
                  ? 'border-2 border-rose-500 ring-4 ring-rose-500/20 bg-rose-50/20 animate-shake'
                  : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      validationErrors.mvp
                        ? 'bg-rose-500 text-white'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    3
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Crown className="w-4.5 h-4.5 text-amber-500" />
                      Craque da Partida
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Vote no melhor jogador da rodada (ambos os times). Auto-voto bloqueado.
                    </p>
                  </div>
                </div>

                {validationErrors.mvp && (
                  <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1 shrink-0">
                    <AlertCircle className="w-4 h-4" /> Escolha 1 jogador
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {allMatchPlayers.map((player) => {
                  const isSelf = player.id === currentUser.id;
                  const isSelected = selectedMvpId === player.id;
                  const inTeamA = targetMatch.teamA.playerIds.includes(player.id);
                  const teamName = inTeamA ? targetMatch.teamA.name : targetMatch.teamB.name;
                  const teamBadgeColor = inTeamA
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200';

                  return (
                    <button
                      key={player.id}
                      type="button"
                      disabled={isSelf}
                      onClick={() => {
                        setSelectedMvpId(player.id);
                        setValidationErrors((prev) => ({ ...prev, mvp: false }));
                      }}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 relative ${
                        isSelf
                          ? 'bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed'
                          : isSelected
                          ? 'bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-transparent border-amber-500 ring-2 ring-amber-400/40 shadow-sm cursor-pointer'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar player={player} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900 truncate">{player.name}</p>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md border inline-block truncate max-w-full ${teamBadgeColor}`}
                          >
                            {teamName}
                          </span>
                        </div>
                      </div>

                      {isSelf && (
                        <span className="text-xs text-slate-400 font-semibold italic">
                          Você (Não permitido)
                        </span>
                      )}

                      {isSelected && !isSelf && (
                        <span className="text-xs font-black text-amber-600 flex items-center gap-1">
                          <Crown className="w-3.5 h-3.5 fill-amber-500" /> Seu voto
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mensagem de Erro de Conexão com Servidor */}
          {serverError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <div className="text-xs font-semibold leading-relaxed">
                {serverError}
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 px-4 font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${
              isSubmitting
                ? 'bg-slate-400 text-white cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-emerald-600/20 cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Gravando seus votos com segurança...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Enviar Avaliação Anônima
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
