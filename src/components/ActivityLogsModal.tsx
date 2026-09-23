import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  X,
  Search,
  RefreshCw,
  Clock,
  User,
  Volleyball,
  Star,
  LogIn,
  Sliders,
  Filter,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { ActivityLog, LogCategory } from '../types';
import { fetchLogsFromServer, getStoredActivityLogs } from '../utils/storage';

interface ActivityLogsModalProps {
  onClose: () => void;
}

export const ActivityLogsModal: React.FC<ActivityLogsModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<ActivityLog[]>(() => getStoredActivityLogs());
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<LogCategory | 'todos'>('todos');

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const serverLogs = await fetchLogsFromServer();
      setLogs(serverLogs);
    } catch (e) {
      console.warn('Erro ao carregar logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesCategory =
        selectedCategory === 'todos' || log.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchName = log.userName.toLowerCase().includes(term);
      const matchDesc = log.description.toLowerCase().includes(term);
      const matchAction = log.action.toLowerCase().includes(term);
      const matchPhone = log.userPhone?.toLowerCase().includes(term);

      return matchName || matchDesc || matchAction || matchPhone;
    });
  }, [logs, selectedCategory, searchTerm]);

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getCategoryBadge = (category: LogCategory) => {
    switch (category) {
      case 'voto':
        return {
          label: 'Votação / Feedback',
          bg: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
          icon: <Star className="w-3.5 h-3.5" />,
        };
      case 'partida':
        return {
          label: 'Partida',
          bg: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
          icon: <Volleyball className="w-3.5 h-3.5" />,
        };
      case 'atleta':
        return {
          label: 'Atleta',
          bg: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
          icon: <User className="w-3.5 h-3.5" />,
        };
      case 'auth':
        return {
          label: 'Acesso / Login',
          bg: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
          icon: <LogIn className="w-3.5 h-3.5" />,
        };
      case 'admin':
        return {
          label: 'Administração',
          bg: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
          icon: <ShieldAlert className="w-3.5 h-3.5" />,
        };
      default:
        return {
          label: 'Geral',
          bg: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
          icon: <Sliders className="w-3.5 h-3.5" />,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-700/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  Logs de Atividades do App
                </h3>
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase rounded-full tracking-wider">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Auditoria em tempo real salva no banco relacional
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              disabled={isLoading}
              className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 rounded-xl transition-all cursor-pointer border border-white/10"
              title="Atualizar Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-rose-500/30 hover:text-rose-300 text-slate-300 rounded-xl transition-all cursor-pointer border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuário, ação ou detalhe..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'partida', label: 'Partidas' },
                { id: 'voto', label: 'Votações' },
                { id: 'atleta', label: 'Atletas' },
                { id: 'auth', label: 'Acessos' },
                { id: 'admin', label: 'Admin' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Logs List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-600">Nenhum log encontrado</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                {searchTerm || selectedCategory !== 'todos'
                  ? 'Nenhum registro corresponde aos filtros selecionados.'
                  : 'As ações realizadas no aplicativo aparecerão aqui automaticamente.'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const badge = getCategoryBadge(log.category);
              return (
                <div
                  key={log.id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs hover:border-indigo-200 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-lg border ${badge.bg}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {log.userName}
                      </span>
                      {log.userPhone && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({log.userPhone})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium whitespace-nowrap">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatDate(log.createdAt)}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                    {log.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 px-5">
          <span>
            Exibindo <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> eventos registrados
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
