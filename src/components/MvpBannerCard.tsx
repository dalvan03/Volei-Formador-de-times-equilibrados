import React, { useState, useEffect } from 'react';
import { Crown, Clock, Sparkles, Share2, ChevronRight } from 'lucide-react';
import { Match, Player, UserSession } from '../types';
import { getMatchMvpResult, MatchMvpResult, getStoredMvpVotes } from '../utils/storage';
import { PlayerAvatar } from './PlayerAvatar';
import { ShareMvpModal } from './ShareMvpModal';

interface MvpBannerCardProps {
  lastFinalizedMatch: Match | null;
  players: Player[];
  session: UserSession | null;
  onNavigateToFeedback?: () => void;
}

export const MvpBannerCard: React.FC<MvpBannerCardProps> = ({
  lastFinalizedMatch,
  players,
  session,
  onNavigateToFeedback,
}) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [mvpResult, setMvpResult] = useState<MatchMvpResult | null>(null);

  // Recalculate MVP result dynamically every second for smooth countdown
  useEffect(() => {
    if (!lastFinalizedMatch) {
      setMvpResult(null);
      return;
    }

    const updateResult = () => {
      const allVotes = getStoredMvpVotes();
      const res = getMatchMvpResult(lastFinalizedMatch, players, allVotes);
      setMvpResult(res);
    };

    updateResult();
    const timer = setInterval(updateResult, 1000);
    return () => clearInterval(timer);
  }, [lastFinalizedMatch?.id, lastFinalizedMatch?.finalizedAt, players]);

  if (!lastFinalizedMatch || !mvpResult) {
    return null;
  }

  // If voting is closed and no votes were cast, do not display the card
  if (!mvpResult.isVotingOpen && mvpResult.totalVotes === 0) {
    return null;
  }

  const userPhone = session?.phone || '';
  const allVotes = getStoredMvpVotes();
  const userHasVoted = allVotes.some(
    (v) => v.matchId === lastFinalizedMatch.id && v.evaluatorPhone === userPhone
  );

  const top3 = mvpResult.top3;
  const winner = top3[0];
  const second = top3[1];
  const third = top3[2];

  return (
    <>
      <div className="w-full rounded-3xl overflow-hidden shadow-xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white relative animate-fade-in">
        {/* Glow effect */}
        <div className="absolute top-0 right-1/4 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* STATE 1: Voting is OPEN (< 24 hours) -> Countdown & Vote Incentive without partials */}
        {mvpResult.isVotingOpen ? (
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Broadcast Badge */}
                <div className="w-12 h-12 rounded-full border-2 border-lime-400 bg-slate-950 text-lime-400 flex flex-col items-center justify-center font-black leading-none shadow-md shrink-0 transform -rotate-6">
                  <span className="text-[9px] tracking-tighter uppercase font-black text-lime-300">CRAQUE</span>
                  <span className="text-[8px] text-white">DO JOGO</span>
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-lime-500/20 text-lime-400 border border-lime-500/30 text-xs font-extrabold uppercase tracking-wider rounded-md inline-block mb-1">
                    VOTAÇÃO EM ANDAMENTO
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {lastFinalizedMatch.title || 'Última Partida'}
                  </h3>
                </div>
              </div>

              {/* Countdown badge */}
              <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 text-amber-300">
                <Clock className="w-4 h-4 animate-spin-slow text-amber-400" />
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block leading-none font-medium">Encerra em</span>
                  <span className="text-sm font-black text-amber-400 font-mono">
                    {mvpResult.formattedTimeLeft}
                  </span>
                </div>
              </div>
            </div>

            {/* Voting CTA or Voted Status */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4.5 h-4.5 text-lime-400 shrink-0" />
                <p className="text-xs sm:text-sm text-slate-200 truncate">
                  {userHasVoted ? (
                    <span className="text-emerald-400 font-bold">
                      ✓ Seu voto foi registrado! O resultado sairá ao fim do timer.
                    </span>
                  ) : (
                    <span>
                      Quem foi o destaque? <strong className="text-white">Dê o seu voto!</strong>
                    </span>
                  )}
                </p>
              </div>

              {!userHasVoted && onNavigateToFeedback && (
                <button
                  type="button"
                  onClick={onNavigateToFeedback}
                  className="px-3.5 py-2 bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-lime-400/20 flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
                >
                  Votar <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* STATE 2: Voting is CLOSED (>= 24 hours) -> Broadcast TV Banner Podium with Percentages */
          <div className="space-y-0">
            {/* Header Strip Broadcast */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Broadcast circular badge */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-3 border-lime-400 bg-slate-950 text-lime-400 flex flex-col items-center justify-center font-black leading-none shadow-xl shadow-lime-500/20 shrink-0 transform -rotate-6">
                  <span className="text-[11px] sm:text-xs tracking-tighter uppercase font-black text-lime-300">CRAQUE</span>
                  <span className="text-[9.5px] sm:text-[10.5px] text-white font-black">DO JOGO</span>
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-extrabold uppercase tracking-wider rounded-md inline-block mb-1">
                    ELEITO PELA GALERA
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-white truncate max-w-[180px] sm:max-w-xs">
                    {lastFinalizedMatch.title || 'Última Rodada'}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm shrink-0"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>Compartilhar</span>
              </button>
            </div>

            {/* TV Podium (3 Columns: 2º Lugar Esquerda, 1º Lugar BEM MAIOR no Centro, 3º Lugar Direita) */}
            <div className="p-3.5 pt-4 grid grid-cols-3 gap-2.5 items-end bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
              {/* 2nd Place (Left) */}
              {second && second.voteCount > 0 ? (
                <div className="col-span-1 flex flex-col items-center text-center p-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-md">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-400/80 shadow bg-slate-800 flex items-center justify-center mb-1 shrink-0">
                    {second.player.photoUrl ? (
                      <img
                        src={second.player.photoUrl}
                        alt={second.player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-full h-full ${second.player.avatarBg || 'bg-slate-700'} text-white flex items-center justify-center font-bold text-xs`}>
                        {second.player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-200 truncate max-w-full block leading-tight">
                    {second.player.name.split(' ')[0]}
                  </span>
                  <div className="mt-1 text-xs sm:text-sm font-black text-slate-100">
                    {second.percentage}%
                  </div>
                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    2º Lugar
                  </span>
                </div>
              ) : (
                <div className="col-span-1 flex flex-col items-center justify-center p-2 text-slate-600 text-[10px]">
                  -
                </div>
              )}

              {/* 1st Place (Center - CHAMPION HIGHLIGHTED WITH REFINED CIRCULAR AVATAR) */}
              {winner && winner.voteCount > 0 ? (
                <div className="col-span-1 flex flex-col items-center text-center p-3 pb-2.5 rounded-2xl bg-gradient-to-b from-amber-500/20 via-slate-900/95 to-slate-950 border-2 border-amber-400 shadow-xl shadow-amber-950/60 relative z-10 -translate-y-1.5">
                  {/* Floating Crown above avatar */}
                  <div className="absolute -top-3.5 z-20 w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-400 to-amber-500 text-amber-950 flex items-center justify-center shadow-lg border-2 border-slate-900">
                    <Crown className="w-4 h-4 fill-amber-950" />
                  </div>

                  {/* Clean Circular Champion Photo */}
                  <div className="relative mt-1 mb-1.5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-amber-400 shadow-xl shadow-amber-500/30 bg-slate-800 flex items-center justify-center">
                      {winner.player.photoUrl ? (
                        <img
                          src={winner.player.photoUrl}
                          alt={winner.player.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-full h-full ${winner.player.avatarBg || 'bg-amber-600'} text-white flex items-center justify-center font-black text-xl sm:text-2xl`}>
                          {winner.player.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-xs sm:text-sm font-black text-amber-300 truncate max-w-full block leading-tight">
                    {winner.player.name.split(' ')[0]}
                  </span>
                  <div className="mt-0.5 text-base sm:text-lg font-black text-lime-400 tracking-tight drop-shadow-md">
                    {winner.percentage}%
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[8px] font-black text-amber-300 uppercase tracking-wider mt-1">
                    👑 CRAQUE
                  </span>
                </div>
              ) : (
                <div className="col-span-1 flex flex-col items-center justify-center p-3 text-slate-500 text-xs">
                  Sem votos
                </div>
              )}

              {/* 3rd Place (Right) */}
              {third && third.voteCount > 0 ? (
                <div className="col-span-1 flex flex-col items-center text-center p-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-md">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-700/60 shadow bg-slate-800 flex items-center justify-center mb-1 shrink-0">
                    {third.player.photoUrl ? (
                      <img
                        src={third.player.photoUrl}
                        alt={third.player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-full h-full ${third.player.avatarBg || 'bg-slate-700'} text-white flex items-center justify-center font-bold text-xs`}>
                        {third.player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-200 truncate max-w-full block leading-tight">
                    {third.player.name.split(' ')[0]}
                  </span>
                  <div className="mt-1 text-xs sm:text-sm font-black text-slate-100">
                    {third.percentage}%
                  </div>
                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    3º Lugar
                  </span>
                </div>
              ) : (
                <div className="col-span-1 flex flex-col items-center justify-center p-2 text-slate-600 text-[10px]">
                  -
                </div>
              )}
            </div>

            {/* Broadcast Footer Strip */}
            <div className="bg-emerald-950 px-4 py-2 border-t border-emerald-900/60 flex items-center justify-between text-[10px] font-black text-emerald-300 uppercase tracking-wider">
              <span>RESULTADO FINAL</span>
              <span>CRAQUE DA PARTIDA</span>
            </div>
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareMvpModal
          match={lastFinalizedMatch}
          players={players}
          mvpResult={mvpResult}
          session={session}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
};
