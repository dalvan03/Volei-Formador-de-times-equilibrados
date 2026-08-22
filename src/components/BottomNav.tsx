import React from 'react';
import { Volleyball, Star, Trophy, Users } from 'lucide-react';

export type TabType = 'game' | 'feedback' | 'ranking' | 'admin';

interface BottomNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  hasPendingFeedback?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  hasPendingFeedback = false,
}) => {
  const tabs = [
    {
      id: 'game' as TabType,
      label: 'Dia de Jogo',
      icon: Volleyball,
    },
    {
      id: 'feedback' as TabType,
      label: 'Avaliar',
      icon: Star,
      badge: hasPendingFeedback,
    },
    {
      id: 'ranking' as TabType,
      label: 'Ranking',
      icon: Trophy,
    },
    {
      id: 'admin' as TabType,
      label: 'Grupo',
      icon: Users,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 px-3 flex justify-center">
      <nav className="w-full max-w-lg pointer-events-auto bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl shadow-2xl shadow-slate-900/15 py-2 px-2 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-2xl transition-all relative cursor-pointer ${
                isActive
                  ? 'text-emerald-600 font-extrabold scale-105'
                  : 'text-slate-500 hover:text-slate-800 font-semibold'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 transition-transform ${
                    isActive ? 'scale-110 text-emerald-600' : 'text-slate-400'
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2 w-3 h-3 bg-rose-500 rounded-full animate-ping" />
                )}
                {tab.badge && (
                  <span className="absolute -top-1 -right-2 w-3 h-3 bg-rose-500 rounded-full border-2 border-white" />
                )}
              </div>
              <span className="text-xs mt-1 font-bold tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="w-5 h-1 bg-emerald-600 rounded-full mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
