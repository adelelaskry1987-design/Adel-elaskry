import React from 'react';
import shopLogoAsset from '../assets/shop_owner_logo.jpg';

interface ShopOwnerLogoProps {
  variant?: 'default' | 'header' | 'card' | 'report' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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
    xs: 'w-7 h-7',
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-36 h-36',
  }[size];

  if (variant === 'header') {
    return (
      <div className={`flex items-center gap-1.5 shrink-0 ${className}`} title="لوجو صاحب المحل - OM BASMA">
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-amber-400/90 bg-white shadow-sm shrink-0 flex items-center justify-center p-0.5">
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
        <div className="w-16 h-16 rounded-xl overflow-hidden border border-amber-400 bg-white shadow-sm shrink-0 flex items-center justify-center p-0.5">
          <img
            src={logoSrc}
            alt="لوجو المحل - OM BASMA للستائر والمفروشات"
            className="w-full h-full object-contain"
            loading="eager"
          />
        </div>
        <div>
          <div className="font-black text-sm text-slate-900 tracking-wide font-sans">
            OM BASMA
          </div>
          <div className="text-[11px] font-bold text-amber-700 font-sans mt-0.5">
            للستائر والمفروشات
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
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
