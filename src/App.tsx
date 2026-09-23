import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, clearClientState, fetchDbFromServer, getStoredBalanceFeedbacks } from './utils/storage';
import { localDate, seasonForDate, votingOpen } from './utils/seasons';
import type { Player, Match, UserSession } from './types';
import { Header } from './components/Header';
import { BottomNav, type TabType } from './components/BottomNav';
import { GameDayTab } from './components/GameDayTab';
import { FeedbackTab } from './components/FeedbackTab';
import { RankingTab } from './components/RankingTab';
import { AdminTab } from './components/AdminTab';
import { LoginPage } from './components/LoginPage';
import { EditProfileModal } from './components/EditProfileModal';

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]), [matches, setMatches] = useState<Match[]>([]);
  const [session, setSession] = useState<UserSession | null>(null), [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(() => new URLSearchParams(window.location.search).get('tab') === 'feedback' ? 'feedback' : 'game'), [profile, setProfile] = useState(false);
  const [error, setError] = useState(''), [seasonId, setSeasonId] = useState(seasonForDate(localDate()));
  const refresh = useCallback(async () => {
    const data = await fetchDbFromServer();
    if (data) { setPlayers(data.players); setMatches(data.matches); setSession(data.session); setSeasonId(data.seasonId!); }
  }, []);
  useEffect(() => {
    const expired = () => { setSession(null); setPlayers([]); setMatches([]); setProfile(false); };
    window.addEventListener('session-expired', expired);
    apiRequest<UserSession | null>('/auth/session').then(async s => { if (s) await refresh(); }).catch(e => setError(e.message)).finally(() => setLoading(false));
    return () => window.removeEventListener('session-expired', expired);
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const reload = () => { if (document.visibilityState === 'visible') void refresh().catch(e => setError(e.message)); };
    const timer = setInterval(reload, 15000);
    window.addEventListener('focus', reload); document.addEventListener('visibilitychange', reload);
    return () => { clearInterval(timer); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [session?.player?.id, refresh]);
  async function mutate(url: string, method: string, body?: unknown) {
    try { await apiRequest(url, method, body); setError(''); await refresh(); return true; }
    catch (e) { setError((e as Error).message); return false; }
  }
  async function logout() {
    try { await apiRequest('/auth/logout', 'POST'); clearClientState(); setSession(null); setPlayers([]); setMatches([]); setProfile(false); setActiveTab('game'); }
    catch (e) { setError((e as Error).message); }
  }
  const currentMatch = matches.find(m => m.status === 'agendada' || m.status === 'em_andamento') || null;
  const pastMatches = matches.filter(m => m.status === 'finalizada' || m.status === 'encerrada').sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const rated = getStoredBalanceFeedbacks();
  const unratedMatch = pastMatches.find(m => votingOpen(m) && [...m.teamA.playerIds,...m.teamB.playerIds].includes(session?.player?.id || '') && !rated.some(b => b.matchId === m.id)) || null;
  const updatePlayer = async (p: Player) => mutate(`/players/${encodeURIComponent(p.id)}`, 'PATCH', p);
  async function addPlayer(name: string, phone: string, photoUrl?: string, guest = false): Promise<Player | null> {
    const p: Player = { id: crypto.randomUUID(), name, phone, photoUrl, isGuest: guest, active: true, wins:0, losses:0, matchesPlayed:0, avatarBg:'bg-emerald-600' };
    return await mutate('/players', 'POST', p) ? p : null;
  }
  async function startMatch() {
    const date = localDate();
    await mutate('/matches', 'POST', { id: crypto.randomUUID(), date, title: `Rodada de Vôlei (${date})`, status:'agendada', presentPlayerIds:[], teamA:{id:'teamA',name:'Time A',color:'bg-blue-600',playerIds:[]},teamB:{id:'teamB',name:'Time B',color:'bg-amber-600',playerIds:[]} });
  }
  return <div className="min-h-[100dvh] w-full bg-slate-100 text-slate-900 font-sans flex justify-center">
    <div className="w-full max-w-lg min-h-[100dvh] flex flex-col bg-slate-50 shadow-2xl relative">
      {error && <div role="alert" className="bg-rose-100 text-rose-800 p-3 text-sm">{error}<button className="float-right font-bold" aria-label="Fechar aviso" onClick={() => setError('')}>×</button></div>}
      {loading ? <p className="p-8">Carregando…</p> : !session ? <LoginPage onLogin={s => { setSession(s); void refresh().catch(e => setError(e.message)); }} /> : <>
        <Header session={session} onOpenAuth={() => setProfile(true)} onLogout={logout} matchStatus={currentMatch?.status} />
        <main className="flex-1 px-3.5 pt-3.5 pb-32">
          {activeTab === 'game' && <GameDayTab key={seasonId} players={players} currentMatch={currentMatch} pastMatches={pastMatches} session={session} unratedMatch={unratedMatch}
            onUpdateMatch={m => mutate('/matches','POST',m)} onDeleteMatch={id => mutate(`/matches/${encodeURIComponent(id)}`,'DELETE')}
            onNavigateToFeedback={() => setActiveTab('feedback')} onStartManualMatch={startMatch}
            onAddGuest={name => addPlayer(name?.trim() ? `${name.trim()} (Convidado)` : 'Convidado', '', undefined, true)}
            onDeleteGuest={id => { void mutate(`/players/${encodeURIComponent(id)}`,'DELETE'); }} />}
          {activeTab === 'feedback' && <FeedbackTab currentMatch={currentMatch} pastMatches={pastMatches} players={players} session={session} onOpenAuth={() => setProfile(true)} onFeedbackSubmitted={() => { void refresh().catch(e => setError(e.message)); }} />}
          {activeTab === 'ranking' && <RankingTab players={players} seasonId={seasonId} />}
          {activeTab === 'admin' && <AdminTab players={players} pastMatches={pastMatches} session={session}
            onAddPlayer={(n,p,photo) => { void addPlayer(n,p,photo); }} onUpdatePlayer={p => { void updatePlayer(p); }}
            onDeletePlayer={id => { void mutate(`/players/${encodeURIComponent(id)}`,'DELETE'); }}
            onToggleAdmin={id => { const p = players.find(p => p.id === id); if (p) void updatePlayer({...p,isAdmin:!p.isAdmin}); }}
            onOpenAuth={() => setProfile(true)} onDeleteMatch={id => { void mutate(`/matches/${encodeURIComponent(id)}`,'DELETE'); }} />}
        </main>
        <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} hasPendingFeedback={!!unratedMatch} />
        {profile && session.player && <EditProfileModal player={session.player} onSave={updatePlayer} onLogout={logout} onClose={() => setProfile(false)} />}
      </>}
    </div>
  </div>;
}
