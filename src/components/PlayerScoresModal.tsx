import React, { useState, useEffect } from 'react';
import { apiRequest } from '../utils/storage';
import type { Player, Match } from '../types';
export function PlayerScoresModal({ onClose }: { isOpen: boolean; onClose: () => void; players: Player[]; pastMatches: Match[] }) {
  const [players, setPlayers] = useState<Player[]>([]), [error, setError] = useState(''), [search, setSearch] = useState('');
  useEffect(() => { let active = true; apiRequest<Player[]>('/admin/ratings').then(p => { if (active) setPlayers(p); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="Notas dos jogadores" className="bg-white rounded-3xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-4">
    <h2 className="font-black text-xl">Notas • Administrador</h2>
    <input aria-label="Buscar jogador" className="border rounded-xl p-2 w-full" placeholder="Buscar jogador" value={search} onChange={e => setSearch(e.target.value)} />
    <p className="text-xs text-slate-500">Média ponderada atual e votos reais recebidos nesta temporada.</p>
    {error && <p role="alert">{error}</p>}
    {players.filter(p => !p.isGuest && p.name.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (b.rating || 0)-(a.rating || 0)).map(p => <div key={p.id} className="border-b py-2 flex justify-between"><span>{p.name}</span><span>★ {p.rating?.toFixed(1)} · {p.ratingCount || 0} votos</span></div>)}
    <button onClick={onClose} className="w-full rounded-xl bg-slate-900 text-white p-3">Fechar</button>
  </section></div>;
}
