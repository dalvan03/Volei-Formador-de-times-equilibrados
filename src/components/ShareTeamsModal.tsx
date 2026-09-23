import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  X,
  Share2,
  Download,
  Check,
  Volleyball,
  Copy,
  MessageCircle,
} from 'lucide-react';
import { Match, Player } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import logoImg from '../assets/logo.png';

interface ShareTeamsModalProps {
  match: Match;
  players: Player[];
  onClose: () => void;
}

export const ShareTeamsModal: React.FC<ShareTeamsModalProps> = ({
  match,
  players,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const getPlayer = (id: string): Player | undefined => {
    return players.find((p) => p.id === id);
  };

  const teamAPlayers = (match.teamA?.playerIds || []).map(getPlayer).filter(Boolean) as Player[];
  const teamBPlayers = (match.teamB?.playerIds || []).map(getPlayer).filter(Boolean) as Player[];

  // Calculate averages without odd weakest player if odd
  const allPlayers = [...teamAPlayers, ...teamBPlayers];
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
    ? teamAPlayers.filter((p) => p.id !== weakestPlayerId)
    : teamAPlayers;
  const teamASum = teamAPlayersFiltered.reduce((acc, p) => acc + (p.rating ?? 3.0), 0);
  const teamAAvg = teamAPlayersFiltered.length ? teamASum / teamAPlayersFiltered.length : 0;

  const teamBPlayersFiltered = weakestPlayerId
    ? teamBPlayers.filter((p) => p.id !== weakestPlayerId)
    : teamBPlayers;
  const teamBSum = teamBPlayersFiltered.reduce((acc, p) => acc + (p.rating ?? 3.0), 0);
  const teamBAvg = teamBPlayersFiltered.length ? teamBSum / teamBPlayersFiltered.length : 0;

  const formattedDate = match.date
    ? new Date(match.date + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  // Formatted WhatsApp Text message
  const whatsappText = `🏐 *TIMES ESCALADOS - VÔLEI* 🏐
📅 *Data:* ${formattedDate}

🔵 *${match.teamA?.name || 'TIME A'}* (${teamAPlayers.length} jogadores)
${teamAPlayers.map((p) => `  • ${p.name}`).join('\n')}

🟠 *${match.teamB?.name || 'TIME B'}* (${teamBPlayers.length} jogadores)
${teamBPlayers.map((p) => `  • ${p.name}`).join('\n')}

Bora pro jogo! 🔥`;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const generateImageFile = async (): Promise<File | null> => {
    if (!cardRef.current) return null;

    try {
      setIsGenerating(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        quality: 0.95,
        pixelRatio: 2,
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `times-volei-${match.date || 'hoje'}.png`, {
        type: 'image/png',
      });
      return file;
    } catch (err) {
      console.error('Erro ao gerar imagem dos times:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareWhatsAppImage = async () => {
    const file = await generateImageFile();

    if (!file) {
      showToast('Erro ao processar imagem para compartilhamento.');
      return;
    }

    // Try Web Share API with image file (works on Mobile devices / Safari / Android Chrome)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Times Escalados - ${formattedDate}`,
          text: whatsappText,
        });
        showToast('Compartilhado com sucesso!');
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.warn('Share API threw error, falling back:', err);
      }
    }

    // Fallback: Download image, copy text and open WhatsApp link
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `times-volei-${match.date || 'hoje'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard.writeText(whatsappText);
    } catch {
      // ignore
    }

    showToast('Imagem salva e texto copiado! Anexe a imagem no WhatsApp 🟢');
    setTimeout(() => {
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`,
        '_blank'
      );
    }, 1200);
  };

  const handleCopyTextOnly = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopiedText(true);
      showToast('Texto dos times copiado para a área de transferência! 📋');
      setTimeout(() => setCopiedText(false), 2500);

      setTimeout(() => {
        window.open(
          `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`,
          '_blank'
        );
      }, 800);
    } catch (err) {
      console.error('Erro ao copiar texto:', err);
    }
  };

  const handleDownloadImage = async () => {
    const file = await generateImageFile();
    if (!file) return;

    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `times-volei-${match.date || 'hoje'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Imagem dos times baixada com sucesso! 🖼️');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full my-auto shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md font-bold">
              <MessageCircle className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white leading-tight">
                Compartilhar Times no WhatsApp
              </h3>
              <p className="text-[10px] text-emerald-400 font-medium">
                Gere a imagem oficial para enviar no grupo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* CARD PREVIEW TO BE CAPTURED AS PNG */}
          <div className="flex justify-center my-1">
            <div
              ref={cardRef}
              className="w-[320px] bg-slate-950 text-white rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xl border border-slate-800 select-none shrink-0"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.28), transparent 70%), radial-gradient(circle at 50% 100%, rgba(59, 130, 246, 0.2), transparent 70%)',
              }}
            >
              {/* Background court pattern */}
              <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
                <div className="w-[88%] h-[88%] border-2 border-emerald-400 rounded-2xl flex items-center justify-center">
                  <div className="w-full h-0.5 bg-emerald-400" />
                </div>
              </div>

              {/* Card Header */}
              <div className="relative z-10 flex items-center justify-between border-b border-slate-800/90 pb-3">
                <div className="flex items-center gap-2">
                  <img
                    src={logoImg}
                    alt="Logo"
                    className="w-8 h-8 rounded-xl object-cover shadow-md"
                  />
                  <div>
                    <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase block">
                      CULTO DE SEGUNDA
                    </span>
                    <span className="text-xs font-bold text-slate-200">
                      Times da Rodada
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-bold text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-full border border-slate-800">
                  {formattedDate}
                </span>
              </div>

              {/* Card Teams Grid */}
              <div className="relative z-10 my-4 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Team A */}
                  <div className="bg-slate-900/90 border border-blue-500/40 rounded-2xl p-3 space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-blue-500/20 pb-1.5">
                      <div>
                        <h4 className="text-xs font-black text-blue-400 truncate">
                          {match.teamA?.name || 'Time A'}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-medium block">
                          {teamAPlayers.length} jogadores
                        </span>
                      </div>

                    </div>

                    <div className="space-y-1.5">
                      {teamAPlayers.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <PlayerAvatar player={p} size="xs" />
                          <span className="text-[11px] font-bold text-slate-200 truncate">
                            {p.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Team B */}
                  <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-3 space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-1.5">
                      <div>
                        <h4 className="text-xs font-black text-amber-400 truncate">
                          {match.teamB?.name || 'Time B'}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-medium block">
                          {teamBPlayers.length} jogadores
                        </span>
                      </div>

                    </div>

                    <div className="space-y-1.5">
                      {teamBPlayers.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <PlayerAvatar player={p} size="xs" />
                          <span className="text-[11px] font-bold text-slate-200 truncate">
                            {p.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="relative z-10 border-t border-slate-800/90 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-semibold text-emerald-400">
                  🔥 Confronto Equilibrado
                </span>
                <span className="text-slate-500 font-medium">
                  Culto de Segunda
                </span>
              </div>
            </div>
          </div>

          {/* Toast Notice */}
          {toastMessage && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-bold text-center animate-fade-in">
              {toastMessage}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleShareWhatsAppImage}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <MessageCircle className="w-5 h-5 fill-slate-950" />
              <span>{isGenerating ? 'Gerando Imagem...' : 'Compartilhar Imagem no WhatsApp'}</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleCopyTextOnly}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedText ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-emerald-400" />
                )}
                <span>Copiar Texto</span>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleDownloadImage}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Baixar Imagem</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
