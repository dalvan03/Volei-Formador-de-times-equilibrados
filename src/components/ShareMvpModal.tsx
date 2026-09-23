import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  X,
  Share2,
  Download,
  Check,
  Instagram,
  MessageCircle,
  Trophy,
  Crown,
  Sparkles,
} from 'lucide-react';
import { Match, Player, UserSession } from '../types';
import { MatchMvpResult } from '../utils/storage';
import { MvpWinners } from './MvpWinners';
import logoImg from '../assets/logo.png';
import mockImg from '../assets/mock.webp';


interface ShareMvpModalProps {
  match: Match;
  players: Player[];
  mvpResult: MatchMvpResult;
  session: UserSession | null;
  onClose: () => void;
}

export const ShareMvpModal: React.FC<ShareMvpModalProps> = ({
  match,
  players,
  mvpResult,
  session,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const top3 = mvpResult.top3;
  const winner = top3[0];
  const winners = mvpResult.winners;
  const hasTie = winners.length > 1;

  const winnerName = winner?.player.name || 'Atleta';
  const winnerFirstName = winner?.player.name ? winner.player.name.trim().split(/\s+/)[0] : 'Atleta';
  const percentage = (winner?.percentage || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = new Date(match.date + 'T00:00:00').toLocaleDateString('pt-BR');
  const captionText = hasTie
    ? `🔥 CRAQUES DA PARTIDA! 🏐\n👑 ${winners.map(player => player.name).join(' e ')} empataram em 1º lugar, com ${percentage}% dos votos cada, na rodada de ${date}! Parabéns aos craques! 🌟`
    : `🔥 CRAQUE DA PARTIDA! 🏐\n👑 ${winnerName} foi eleito(a) o Craque do Jogo com ${percentage}% dos votos na rodada de ${date}! Parabéns! 🌟`;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(captionText);
    setCopiedCaption(true);
    showToast('Legenda copiada para a área de transferência!');
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const generateImageFile = async (): Promise<File | null> => {
    if (!cardRef.current) return null;

    try {
      setIsGenerating(true);
      if (document.fonts) {
        await document.fonts.ready;
      }
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        quality: 0.95,
        pixelRatio: 2,
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `craque-do-jogo-${match.date}.png`, {
        type: 'image/png',
      });
      return file;
    } catch (err) {
      console.error('Erro ao gerar imagem do Craque:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    const file = await generateImageFile();
    if (!file) return;

    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `craque-do-jogo-${match.date}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Imagem do Craque baixada com sucesso! 📸');
  };

  const handleShareWhatsApp = async () => {
    const file = await generateImageFile();

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Craque do Jogo - ${match.date}`,
          text: captionText,
        });
        showToast('Compartilhado com sucesso!');
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        } else {
          return;
        }
      }
    }

    // Direct WhatsApp Web / App share fallback
    if (file) {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `craque-do-jogo-${match.date}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    navigator.clipboard.writeText(captionText);
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(captionText)}`;
    window.open(waUrl, '_blank');
    showToast('Imagem salva e WhatsApp aberto! Cole a legenda no grupo! 🏐');
  };

  const handleNativeShare = async (platformName?: string) => {
    const file = await generateImageFile();

    if (!file) {
      showToast('Erro ao processar imagem para compartilhamento.');
      return;
    }

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Craque do Jogo - ${match.date}`,
          text: captionText,
        });
        showToast('Compartilhado com sucesso!');
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        } else {
          return;
        }
      }
    }

    // Fallback: download image
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `craque-do-jogo-${match.date}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    navigator.clipboard.writeText(captionText);

    if (platformName === 'Instagram') {
      showToast('Imagem salva! Abra o Instagram e selecione-a no Story 📸');
      setTimeout(() => {
        window.open('instagram://story-camera', '_blank');
      }, 800);
    } else {
      showToast('Imagem salva! Compartilhe com a galera!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full my-auto shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 via-yellow-500 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white leading-tight">
                {hasTie ? 'Compartilhar Craques da Partida' : 'Compartilhar Craque da Partida'}
              </h3>
              <p className="text-[10px] text-slate-400">
                Gere a arte oficial e compartilhe com a galera
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

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* PREVIEW CANVAS — MOCK OFICIAL + DADOS DINÂMICOS */}
          <div className="flex justify-center my-1">
            <div
              ref={cardRef}
              className={`w-[320px] relative overflow-hidden shadow-2xl select-none shrink-0 bg-black ${hasTie ? 'min-h-[569px]' : 'h-[569px]'}`}
            >
              {hasTie ? (
                <div className="flex min-h-[569px] flex-col justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-emerald-950 px-4 py-8 text-center">
                  <img src={logoImg} alt="Vôlei" className="mx-auto mb-5 h-16 w-16 object-contain" />
                  <Crown className="mx-auto mb-2 h-9 w-9 text-amber-400" />
                  <h2 className="text-3xl font-black uppercase leading-tight text-amber-300">Craques<br />da partida</h2>
                  <p className="mt-3 break-words text-sm font-bold text-white">{match.title || `Rodada de ${date}`}</p>
                  <p className="mb-5 mt-1 text-xs text-slate-300">Empate em 1º lugar • Eleitos pela galera</p>
                  <MvpWinners winners={winners} percentage={winner?.percentage || 0} />
                  <p className="mt-6 text-xs font-bold uppercase tracking-wider text-emerald-300">{mvpResult.totalVotes} votos • {date}</p>
                </div>
              ) : (
                <>
                  {/* FOTO DINÂMICA */}
                  <div
                    className="absolute z-0 rounded-full overflow-hidden bg-black"
                    style={{
                      left: '22.1%',
                      top: '45.8%',
                      width: '55.8%',
                      aspectRatio: '1 / 1',
                    }}
                  >
                    {winner?.player.photoUrl ? (
                      <img
                        src={winner.player.photoUrl}
                        alt={winner.player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className={`w-full h-full ${winner?.player.avatarBg || 'bg-amber-600'
                          } text-white flex items-center justify-center font-black text-6xl`}
                      >
                        {winner?.player.name?.charAt(0).toUpperCase() || 'A'}
                      </div>
                    )}
                  </div>

                  {/* ARTE FIXA */}
                  <img
                    src={mockImg}
                    alt="Mock Craque da Partida"
                    className="absolute inset-0 z-10 w-full h-full object-fill pointer-events-none"
                    draggable={false}
                  />

                  {/* NOME NA TARJA */}
                  <div
                    className="absolute z-20 left-1/2 w-[74%] text-center uppercase text-black leading-none whitespace-nowrap"
                    style={{
                      top: '75.2%',
                      fontSize: '32px',
                      fontFamily: '"Permanent Marker", cursive',

                      // Centraliza e inclina levemente o nome
                      transform: 'translateX(-50%) rotate(-3deg)',
                    }}
                  >
                    {winnerFirstName}
                  </div>

                  {/* PORCENTAGEM ABAIXO DE VOTOS DA GALERA */}
                  <div
                    className="absolute z-20 left-1/2 -translate-x-1/2 w-full text-center font-black text-white leading-none tracking-tight"
                    style={{
                      top: '86.5%',
                      fontSize: '38px',
                      textShadow: '0 4px 14px rgba(0,0,0,0.8)',
                    }}
                  >
                    {percentage}%
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Toast Notice */}
          {toastMessage && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-bold text-center animate-fade-in">
              {toastMessage}
            </div>
          )}

          {/* Share Actions Grid (Instagram Story & WhatsApp) */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => handleNativeShare('Instagram')}
                className="py-3.5 px-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-pink-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Instagram className="w-4 h-4 shrink-0" />
                <span>Instagram Story</span>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleShareWhatsApp}
                className="py-3.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4 shrink-0 fill-white" />
                <span>WhatsApp</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleDownload}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Baixar Imagem</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCaption}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedCaption ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Share2 className="w-4 h-4 text-amber-400" />
                )}
                <span>Copiar Legenda</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

