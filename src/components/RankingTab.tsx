import React, { useState, useEffect } from 'react';
import { apiRequest } from '../utils/storage';
import { compareRanking } from '../utils/seasons';
import { SeasonMedals } from './SeasonMedals';
import type { SeasonSummary } from '../types';
import { Trophy, Filter, Medal, Crown } from 'lucide-react';
import { Player } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

interface RankingTabProps {
  players: Player[];
  seasonId: string;
}

export const RankingTab: React.FC<RankingTabProps> = ({ players: currentPlayers, seasonId }) => {
  const [selected, setSelected] = useState(seasonId);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [archive, setArchive] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { setSelected(seasonId); apiRequest<SeasonSummary[]>('/seasons').then(setSeasons).catch(e => setError(e.message)); }, [seasonId]);
  useEffect(() => {
    let active = true;
    if (selected === seasonId) { setLoading(false); return; }
    setLoading(true); setError(''); setArchive([]);
    apiRequest<Player[]>(`/seasons/${selected}/ranking`).then(p => { if (active) setArchive(p); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, seasonId]);
  const players = (selected === seasonId ? currentPlayers : archive).filter(p => !p.isGuest);
  const [sortBy, setSortBy] = useState<'points' | 'wins' | 'performance' | 'mvp'>('points');

  const getPoints = (p: Player) => p.wins * 3 + (p.draws || 0);
  const getWinRate = (p: Player) => p.matchesPlayed > 0 ? p.wins / p.matchesPlayed : 0;

  // Sort
  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === 'mvp') {
      const diffMvp = (b.mvpCount || 0) - (a.mvpCount || 0);
      if (diffMvp !== 0) return diffMvp;
      return getPoints(b) - getPoints(a);
    }
    if (sortBy === 'points') {
      return (a.rank ?? Infinity) - (b.rank ?? Infinity) || compareRanking(a, b);
    }
    if (sortBy === 'wins') {
      const diffWins = b.wins - a.wins;
      if (diffWins !== 0) return diffWins;
      return getPoints(b) - getPoints(a);
    }
    const diffRate = getWinRate(b) - getWinRate(a);
    if (diffRate !== 0) return diffRate;
    return getPoints(b) - getPoints(a) || b.matchesPlayed - a.matchesPlayed;
  });

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <label className="block text-sm font-bold">Temporada
        <select className="ml-2 rounded-xl p-2 border bg-white" value={selected} onChange={e => setSelected(e.target.value)}>
          {(seasons.length ? seasons : [{id:seasonId,closed:false}]).map(s => <option key={s.id} value={s.id}>{s.id.replace('-Q',' • T')}{s.closed ? ' • Encerrada' : ' • Atual'}</option>)}
        </select>
      </label>
      {loading && <p>Carregando temporada…</p>}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden border border-indigo-800">
        <div className="flex items-center justify-between">
          <div>
            <span className="px-2.5 py-0.5 bg-indigo-500/30 text-indigo-200 text-[10px] font-bold uppercase tracking-wider rounded-full inline-block mb-1 border border-indigo-400/20">
              Desempenho da Galera
            </span>
            <h2 className="text-xl font-extrabold tracking-tight">Ranking Dinâmico</h2>
            <p className="text-xs text-indigo-200 mt-1">
              Pontuação: 3 pts por Vitória, 1 pt por Empate, 0 pt por Derrota
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center font-bold text-amber-400 shadow-inner">
            <Trophy className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Controls: Sort */}
      <div className="bg-white rounded-3xl p-3 shadow-sm border border-slate-200/80">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setSortBy('points')}
            className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
              sortBy === 'points'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
            }`}
          >
            <span>⭐</span>
            <span>Pontos</span>
          </button>
          <button
            type="button"
            onClick={() => setSortBy('mvp')}
            className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
              sortBy === 'mvp'
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-500/30'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
            }`}
          >
            <span>👑</span>
            <span>Craques</span>
          </button>
          <button
            type="button"
            onClick={() => setSortBy('wins')}
            className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
              sortBy === 'wins'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
            }`}
          >
            <span>🏆</span>
            <span>Vitórias</span>
          </button>
          <button
            type="button"
            onClick={() => setSortBy('performance')}
            className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
              sortBy === 'performance'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
            }`}
          >
            <span>🏐</span>
            <span>Aproveitamento</span>
          </button>
        </div>
      </div>

      {/* Players Ranking List */}
      <div className="space-y-2.5">
        {sortedPlayers.map((player, idx) => {
          const winRate = Math.round(getWinRate(player) * 100);

          const points = getPoints(player);
          const mvpCount = player.mvpCount || 0;

          // Podium badges
          const rank = sortBy === 'points' ? player.rank : idx + 1;
          const isGold = rank === 1;
          const isSilver = rank === 2;
          const isBronze = rank === 3;

          return (
            <div
              key={player.id}
              className={`bg-white rounded-3xl p-4 shadow-sm border transition-all flex items-center justify-between gap-3 ${
                isGold
                  ? 'border-amber-300 ring-2 ring-amber-400/30 bg-gradient-to-r from-amber-50/50 via-white to-white'
                  : isSilver
                  ? 'border-slate-300 ring-2 ring-slate-300/30'
                  : isBronze
                  ? 'border-amber-700/20 ring-2 ring-amber-700/10'
                  : 'border-slate-200/80'
              }`}
            >
              {/* Left: Position Rank + Avatar + Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 ${
                    isGold
                      ? 'bg-amber-400 text-amber-950 shadow-md'
                      : isSilver
                      ? 'bg-slate-300 text-slate-800'
                      : isBronze
                      ? 'bg-amber-700 text-amber-100'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {rank ? `${rank}º` : '—'}
                </div>

                <PlayerAvatar player={player} size="md" />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-black text-slate-900 text-sm sm:text-base truncate">{player.name}</h4>
                    {isGold && <Medal className="w-4.5 h-4.5 text-amber-500 shrink-0" />}
                  </div>

                  <SeasonMedals medals={currentPlayers.find(p => p.id === player.id)?.medals || player.medals} />

                  {/* MVP Count Badge */}
                  {mvpCount > 0 && (
                    <div className="mt-0.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-black shadow-2xs">
                        <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {mvpCount}x Craque
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Stats */}
              <div className="text-right shrink-0">
                <div className="text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg inline-block mb-0.5 border border-indigo-100">
                  {points} pts
                </div>
                <div className="text-xs font-bold text-slate-600">
                  <span className="text-emerald-600 font-extrabold">{player.wins}V</span> -{' '}
                  <span className="text-amber-600 font-extrabold">{player.draws || 0}E</span> -{' '}
                  <span className="text-rose-500 font-extrabold">{player.losses}D</span> ({winRate}%)
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
