import React from 'react';

interface Ah2LogoProps {
  variant?: 'emblem' | 'header' | 'splash' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
}

export const Ah2Logo: React.FC<Ah2LogoProps> = ({
  variant = 'emblem',
  size = 'md',
  className = '',
  showSubtitle = true,
}) => {
  if (variant === 'header') {
    return (
      <div className={`flex flex-col items-center justify-center shrink-0 ${className}`}>
        <div className="relative flex items-center justify-center px-4 py-1.5 rounded-full border-2 border-amber-400 bg-gradient-to-b from-[#0e213b] to-[#071324] shadow-md shadow-black/40">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-black tracking-widest text-base leading-none drop-shadow">
              AH2
            </span>
          </div>
        </div>
        <span className="text-[10px] font-bold text-amber-300 mt-0.5 tracking-tight drop-shadow-sm">
          إيه إتش تو
        </span>
      </div>
    );
  }

  if (variant === 'splash' || size === 'xl') {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        {/* Golden Oval Emblem */}
        <div className="relative w-64 h-36 rounded-[50%] border-4 border-amber-400 bg-gradient-to-b from-[#0f2442] via-[#09172c] to-[#050d1a] shadow-2xl shadow-amber-500/20 flex flex-col items-center justify-center p-4 ring-2 ring-amber-500/30">
          <div className="text-amber-400 font-black text-5xl tracking-widest drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]">
            AH2
          </div>
        </div>
        
        <h1 className="mt-4 text-amber-400 font-extrabold text-3xl tracking-wide drop-shadow-md">
          إيه إتش تو
        </h1>

        {showSubtitle && (
          <p className="mt-3 text-slate-300 font-medium text-sm tracking-wide">
            إدارة عملائك... في يدك
          </p>
        )}
      </div>
    );
  }

  // Default emblem
  const sizeClasses = {
    sm: 'w-24 h-14 text-xl',
    md: 'w-36 h-20 text-2xl',
    lg: 'w-48 h-28 text-3xl',
    xl: 'w-64 h-36 text-5xl',
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`relative ${sizeClasses} rounded-[50%] border-3 border-amber-400 bg-gradient-to-b from-[#0f2442] to-[#061222] shadow-lg shadow-black/40 flex items-center justify-center ring-1 ring-amber-400/40`}
      >
        <span className="text-amber-400 font-black tracking-wider drop-shadow-sm">
          AH2
        </span>
      </div>
      {showSubtitle && (
        <span className="mt-2 text-amber-400 font-bold text-sm drop-shadow-sm">
          إيه إتش تو
        </span>
      )}
    </div>
  );
};
