import React from 'react';
import shopLogoAsset from '../assets/shop_owner_logo.jpg';

interface ShopOwnerLogoProps {
  variant?: 'default' | 'header' | 'card' | 'report' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showTitle?: boolean;
}

const logoSrc = shopLogoAsset || '/shop_owner_logo.jpg';

export const ShopOwnerLogo: React.FC<ShopOwnerLogoProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  showTitle = false,
}) => {
  const sizeClasses = {
    xs: 'w-10 h-10',
    sm: 'w-16 h-16',
    md: 'w-28 h-28',
    lg: 'w-32 h-32',
    xl: 'w-36 h-36',
    '2xl': 'w-40 h-40',
  }[size];

  if (variant === 'header') {
    const headerSizes = {
      xs: 'w-10 h-10',
      sm: 'w-12 h-12',
      md: 'w-16 h-16',
      lg: 'w-18 h-18',
      xl: 'w-20 h-20',
      '2xl': 'w-24 h-24',
    };
    const headerSize = (size && headerSizes[size as keyof typeof headerSizes]) || 'w-16 h-16';

    return (
      <div className={`flex items-center gap-1.5 shrink-0 ${className}`} title="لوجو صاحب المحل - OM BASMA">
        <div className={`${headerSize} rounded-full overflow-hidden border-2 border-amber-400/90 bg-white shadow-md shadow-black/40 shrink-0 flex items-center justify-center p-0.5 ring-2 ring-amber-400/40`}>
          <img
            src={logoSrc}
            alt="لوجو صاحب المحل - OM BASMA"
            className="w-full h-full object-contain"
            loading="eager"
          />
        </div>
      </div>
    );
  }

  if (variant === 'report') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-400 bg-white shadow-md shrink-0 flex items-center justify-center p-1">
          <img
            src={logoSrc}
            alt="لوجو المحل - OM BASMA للستائر والمفروشات"
            className="w-full h-full object-contain"
            loading="eager"
          />
        </div>
        <div>
          <div className="font-black text-base text-slate-900 tracking-wide font-sans">
            OM BASMA
          </div>
          <div className="text-xs font-bold text-amber-700 font-sans mt-0.5">
            للستائر والمفروشات
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            هوية المتجر المعتمدة
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses} rounded-2xl overflow-hidden border-2 border-amber-400/90 bg-white shadow-md p-0.5 flex items-center justify-center`}
      >
        <img
          src={logoSrc}
          alt="لوجو صاحب المحل - OM BASMA للستائر والمفروشات"
          className="w-full h-full object-contain"
          loading="eager"
        />
      </div>
      {showTitle && (
        <div className="text-center mt-2">
          <span className="text-xs font-black text-amber-400 tracking-wide block">
            OM BASMA
          </span>
          <span className="text-[10px] font-bold text-amber-300/90 block">
            للستائر والمفروشات
          </span>
        </div>
      )}
    </div>
  );
};
