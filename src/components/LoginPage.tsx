import React, { useState } from 'react';
import { Volleyball, LockKeyhole } from 'lucide-react';
import { apiRequest, clearClientState } from '../utils/storage';
import type { UserSession } from '../types';
import { formatPhone } from '../utils/phone';

export function LoginPage({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [phone, setPhone] = useState(''), [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState(''), [name, setName] = useState('');
  const [step, setStep] = useState<{ needsPin: boolean; needsName: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!step) setStep(await apiRequest('/auth/check', 'POST', { phone }));
      else { const session = await apiRequest<UserSession>('/auth/login', 'POST', { phone, pin, confirmPin, name }); clearClientState(); onLogin(session); }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const field = 'w-full rounded-2xl border border-slate-600 bg-slate-800 p-3 text-white';
  return <div className="flex-1 bg-slate-900 text-white px-6 py-12">
    <Volleyball className="w-14 h-14 text-emerald-400 mx-auto mb-5" />
    <h1 className="text-2xl font-black text-center">Culto de Segunda</h1>
    <p className="text-slate-300 text-center mt-2 mb-8">Seu vôlei, suas conquistas.</p>
    <form onSubmit={submit} className="space-y-5">
      <label className="block">Telefone com DDD<input className={field} type="tel" autoComplete="tel" inputMode="tel" placeholder="(51) 99988-7766" value={formatPhone(phone)} disabled={!!step} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} required /></label>
      {step && <>
        <p className="text-sm text-emerald-300">{step.needsPin ? 'Informe seu PIN para entrar neste dispositivo.' : 'Primeiro acesso: crie seu PIN de quatro números.'}</p>
        {step.needsName && <label className="block">Nome<input className={field} value={name} onChange={e => setName(e.target.value)} required maxLength={120} /></label>}
        <label className="block">PIN de 4 dígitos<input className={field} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete={step.needsPin ? 'current-password' : 'new-password'} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} required /></label>
        {!step.needsPin && <label className="block">Confirme o PIN<input className={field} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} required /></label>}
      </>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <button disabled={busy} className="w-full bg-emerald-500 text-slate-950 rounded-2xl p-3 font-bold disabled:opacity-50">{busy ? 'Aguarde…' : step ? 'Entrar' : 'Continuar'}</button>
      {step && <button type="button" onClick={() => { setStep(null); setPin(''); setConfirmPin(''); }} className="text-sm underline">Usar outro telefone</button>}
    </form>
    <p className="text-xs text-slate-400 mt-6 flex gap-2"><LockKeyhole className="w-4 h-4 shrink-0" />Este dispositivo ficará conectado por 90 dias. Se esquecer seu PIN, peça ao administrador para redefinir seu acesso.</p>
  </div>;
}
