import React from 'react';
import { Crown } from 'lucide-react';
import type { Player } from '../types';

export const MvpWinners = ({ winners, percentage }: { winners: Player[]; percentage: number }) => (
  <div className={`grid gap-3 pt-4 ${winners.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
    {winners.map(player => (
      <div key={player.id} className="relative min-w-0 flex flex-col items-center rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-amber-500/20 to-slate-950 px-2 pb-3 pt-5 text-center shadow-lg shadow-amber-950/40">
        <div className="absolute -top-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 bg-amber-400 text-amber-950">
          <Crown className="h-4 w-4 fill-amber-950" />
        </div>
        <div className={`mb-2 aspect-square w-full max-w-20 overflow-hidden rounded-full border-2 border-amber-400 ${player.avatarBg || 'bg-amber-600'} flex items-center justify-center text-2xl font-black text-white`}>
          {player.photoUrl ? <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : player.name.charAt(0).toUpperCase()}
        </div>
        <span className="w-full break-words text-xs font-black leading-tight text-amber-300 sm:text-sm">{player.name}</span>
        <span className="mt-auto pt-1 text-lg font-black text-lime-400">{percentage.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
        <span className="mt-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-300">👑 Craque</span>
      </div>
    ))}
  </div>
);
