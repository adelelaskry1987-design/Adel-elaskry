import React from 'react';
import { Ah2Logo } from './Ah2Logo';
import { ShopOwnerLogo } from './ShopOwnerLogo';
import { ChevronRight, Menu, Bell, Wifi, BatteryMedium, Signal } from 'lucide-react';
import { ScreenId } from '../types';

interface HeaderProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onBack?: () => void;
  unreadNotificationsCount?: number;
  onOpenScreenSwitcher?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onNavigate,
  onBack,
  unreadNotificationsCount = 0,
  onOpenScreenSwitcher,
}) => {
  const isHome = currentScreen === 'screen-5-home';
  const isSplash = currentScreen === 'screen-1-splash' || currentScreen === 'screen-9-app-logo';
  const isLogin = currentScreen === 'screen-4-login';

  if (isSplash || isLogin) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 bg-[#0c1e34] text-white border-b border-[#1b3453] shadow-md select-none">
      {/* Top Mobile Status Bar (Matches 10:30 reference screens) */}
      <div className="flex items-center justify-between px-4 py-1 text-[11px] text-slate-300 border-b border-white/5 bg-[#081525]/80">
        <span className="font-semibold tracking-wider font-mono">10:30</span>
        <div className="flex items-center gap-1.5 opacity-90">
          <Signal className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          <BatteryMedium className="w-4 h-4" />
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="relative flex items-center justify-between px-3 py-1.5 min-h-[58px]">
        {/* Right slot (in RTL = Start): Menu/Back button + AH2 Project Logo */}
        <div className="flex items-center gap-2 min-w-[70px] z-10">
          {isHome ? (
            <button
              onClick={onOpenScreenSwitcher}
              title="خريطة الشاشات الـ35 والقائمة"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onBack || (() => onNavigate('screen-5-home'))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#185ba5] hover:bg-[#154e8d] text-white text-xs font-semibold active:scale-95 transition-all shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
              <span>رجوع</span>
            </button>
          )}

          {/* Project Logo (AH2) - Swapped with Shop Logo */}
          <div
            className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
            onClick={() => onNavigate('screen-5-home')}
            title="نظام AH2"
          >
            <Ah2Logo variant="header" className="scale-90 origin-right" />
          </div>
        </div>

        {/* Center slot: Official Shop Owner Logo (OM BASMA) - Swapped to Center & Scaled by 100% */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 z-10"
          onClick={() => onNavigate('screen-5-home')}
          title="متجر OM BASMA للستائر والمفروشات - الرئيسية"
        >
          <ShopOwnerLogo variant="header" size="md" />
        </div>

        {/* Left slot (in RTL = End) */}
        <div className="flex items-center justify-end gap-1.5 min-w-[70px]">
          <button
            onClick={() => onNavigate('screen-29-notifications')}
            className="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-colors"
            title="الإشعارات"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
