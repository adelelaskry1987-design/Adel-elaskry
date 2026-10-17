import React from 'react';
import { Home, ArrowLeftRight, Users, BarChart3, Settings } from 'lucide-react';
import { ScreenId } from '../types';

interface BottomNavProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentScreen, onNavigate }) => {
  // Hide on splash, login, or full modal screens if needed
  const hideOnScreens: ScreenId[] = ['screen-1-splash', 'screen-4-login', 'screen-9-app-logo'];
  if (hideOnScreens.includes(currentScreen)) {
    return null;
  }

  const navItems = [
    {
      id: 'screen-5-home' as ScreenId,
      label: 'الرئيسية',
      icon: Home,
      isActive: currentScreen === 'screen-5-home',
    },
    {
      id: 'screen-18-all-transactions' as ScreenId,
      label: 'العمليات',
      icon: ArrowLeftRight,
      isActive:
        currentScreen === 'screen-18-all-transactions' ||
        currentScreen === 'screen-14-new-transaction' ||
        currentScreen === 'screen-19-customer-transactions',
    },
    {
      id: 'screen-15-customers' as ScreenId,
      label: 'العملاء',
      icon: Users,
      isActive:
        currentScreen === 'screen-15-customers' ||
        currentScreen === 'screen-7-customer-add' ||
        currentScreen === 'screen-11-customer-details' ||
        currentScreen === 'screen-31-customer-edit' ||
        currentScreen === 'screen-6-customer-delete',
    },
    {
      id: 'screen-33-reports' as ScreenId,
      label: 'التقارير',
      icon: BarChart3,
      isActive: currentScreen === 'screen-33-reports',
    },
    {
      id: 'screen-32-settings' as ScreenId,
      label: 'الإعدادات',
      icon: Settings,
      isActive:
        currentScreen === 'screen-32-settings' ||
        currentScreen === 'screen-3-profile' ||
        currentScreen === 'screen-20-backup' ||
        currentScreen === 'screen-34-data-management' ||
        currentScreen === 'screen-35-support' ||
        currentScreen === 'screen-30-about',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-nav)] border-t border-[var(--border-color)] shadow-lg select-none transition-colors duration-200">
      <div className="max-w-md mx-auto grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center transition-all ${
                item.isActive
                  ? 'text-[var(--color-primary-text)] font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              } active:scale-95`}
            >
              <div
                className={`p-1 rounded-xl transition-colors ${
                  item.isActive ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-text)]' : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${item.isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
              </div>
              <span className={`text-[11px] mt-0.5 leading-none ${item.isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
