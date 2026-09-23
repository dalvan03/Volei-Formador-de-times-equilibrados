import { Shield } from 'lucide-react';
import type { Player } from '../types';
export function SeasonMedals({ medals }: { medals?: Player['medals'] }) {
  const options = [{ key:'gold', label:'ouro', color:'text-amber-500 fill-amber-100' },{key:'silver',label:'prata',color:'text-slate-500 fill-slate-200'},{key:'bronze',label:'bronze',color:'text-orange-800 fill-orange-100'}] as const;
  return <div className="flex gap-2 mt-1">{options.map(({key,label,color}) => medals?.[key] ? <span key={key} title={`${medals[key]} títulos de ${label}`} aria-label={`${medals[key]} títulos de ${label}`} className="inline-flex items-center gap-1 text-xs font-bold"><Shield aria-hidden="true" className={`w-5 h-5 ${color}`} /><span aria-hidden="true">{medals[key]}</span></span> : null)}</div>;
}
