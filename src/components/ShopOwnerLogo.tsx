import React from 'react';
import shopLogoAsset from '../assets/shop_owner_logo.jpg';
import shopLogoTransparentAsset from '../assets/shop_owner_logo_transparent.png';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';

interface ShopOwnerLogoProps {
  variant?: 'default' | 'header' | 'card' | 'report' | 'statement' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showTitle?: boolean;
  theme?: 'dark' | 'light';
  transparent?: boolean;
}

const logoSrc = shopLogoAsset || '/shop_owner_logo.jpg';
const fullLogoSrc = shopLogoTransparentAsset || '/shop_owner_logo_transparent.png';
const emblemLogoSrc = shopLogoEmblemAsset || '/shop_owner_logo_emblem.png';

export const ShopOwnerLogo: React.FC<ShopOwnerLogoProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  showTitle = false,
  theme,
  transparent = false,
}) => {
  // ================= 1. HEADER VARIANT (Emblem on Right without text inside, Name on Left) =================
  if (variant === 'header') {
    return (
      <div
        dir="rtl"
        className={`inline-flex items-center gap-2 sm:gap-2.5 select-none ${className}`}
        title="متجر OM BASMA للستائر والمفروشات"
      >
        {/* [اللوجو على اليمين - أرضية بيضاء ناصعة مع إطار ذهبي أنيق] */}
        <div className="logo-light-frame h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-white border-2 border-[#c59a3f] shadow-md p-1 flex items-center justify-center shrink-0">
          <img
            src={emblemLogoSrc}
            alt="شعار OM BASMA"
            className="w-full h-full object-contain drop-shadow-xs"
            loading="eager"
          />
        </div>

        {/* [اسم المحل بجوار اللوجو من جهة اليسار] */}
        <div className="flex flex-col text-right justify-center">
          <span className="font-black text-sm sm:text-base text-amber-400 font-sans tracking-wide leading-none drop-shadow-sm whitespace-nowrap">
            OM BASMA
          </span>
          <span className="font-bold text-[10.5px] sm:text-xs text-amber-200/90 font-sans leading-tight mt-1 whitespace-nowrap">
            للستائر والمفروشات
          </span>
        </div>
      </div>
    );
  }

  // ================= 2. REPORT & STATEMENT VARIANTS (Emblem on Right without text inside, Name on Left) =================
  if (variant === 'report' || variant === 'statement') {
    const isStatement = variant === 'statement';
    const frameSize = isStatement ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-16 h-16 sm:w-20 sm:h-20';
    const titleSize = isStatement ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg';
    const subSize = isStatement ? 'text-xs sm:text-sm' : 'text-xs';

    return (
      <div
        dir="rtl"
        className={`inline-flex items-center gap-3 sm:gap-4 select-none ${className}`}
        title="متجر OM BASMA للستائر والمفروشات"
      >
        {/* [اللوجو على اليمين - الأيقونة الذهبية بدون النص بداخلها] */}
        <div
          className={`logo-light-frame ${frameSize} rounded-2xl bg-white border-2 border-amber-400/80 p-1.5 flex items-center justify-center shrink-0 shadow-sm`}
        >
          <img
            src={emblemLogoSrc}
            alt="شعار OM BASMA"
            className="w-full h-full object-contain drop-shadow-sm"
            loading="eager"
          />
        </div>

        {/* [اسم المحل بجوار اللوجو من جهة اليسار] */}
        <div className="flex flex-col text-right justify-center">
          <span className={`font-black ${titleSize} text-[#0f233c] font-sans tracking-wide leading-none whitespace-nowrap`}>
            OM BASMA
          </span>
          <span className={`font-bold ${subSize} text-amber-700 font-sans leading-tight mt-1 whitespace-nowrap`}>
            للستائر والمفروشات
          </span>
          {variant === 'report' && (
            <span className="text-[10px] font-semibold text-slate-500 mt-0.5 whitespace-nowrap">
              هوية المتجر المعتمدة
            </span>
          )}
        </div>
      </div>
    );
  }

  // ================= 3. DEFAULT VARIANT WITH showTitle (Horizontal Brand Unit) =================
  const sizeClasses = {
    xs: 'w-10 h-10',
    sm: 'w-16 h-16',
    md: 'w-28 h-28',
    lg: 'w-32 h-32',
    xl: 'w-36 h-36',
    '2xl': 'w-40 h-40',
  }[size];

  if (showTitle) {
    const isDark = theme === 'dark';
    return (
      <div
        dir="rtl"
        className={`inline-flex items-center gap-3 select-none ${className}`}
      >
        {/* [اللوجو على اليمين - الأيقونة الذهبية النقية] */}
        <div
          className={`logo-light-frame ${sizeClasses} rounded-2xl overflow-hidden border-2 border-amber-400/90 bg-white shadow-md p-1.5 flex items-center justify-center shrink-0`}
        >
          <img
            src={emblemLogoSrc}
            alt="شعار OM BASMA"
            className="w-full h-full object-contain drop-shadow-sm"
            loading="eager"
          />
        </div>

        {/* [اسم المحل بجوار اللوجو من جهة اليسار] */}
        <div className="flex flex-col text-right justify-center">
          <span
            className={`font-black text-base sm:text-lg ${
              isDark ? 'text-amber-400' : 'text-[#0f233c]'
            } font-sans tracking-wide leading-none whitespace-nowrap`}
          >
            OM BASMA
          </span>
          <span
            className={`font-bold text-xs sm:text-sm ${
              isDark ? 'text-amber-300' : 'text-amber-700'
            } font-sans leading-tight mt-1 whitespace-nowrap`}
          >
            للستائر والمفروشات
          </span>
        </div>
      </div>
    );
  }

  // ================= 4. DEFAULT VARIANT WITHOUT showTitle =================
  // Preserves full logo with text for Splash (Screen 1), Login (Screen 4), and App Logo (Screen 9)
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`logo-light-frame ${sizeClasses} rounded-2xl overflow-hidden border-2 border-amber-400/90 bg-white shadow-md p-1 flex items-center justify-center`}
      >
        <img
          src={transparent ? fullLogoSrc : logoSrc}
          alt="لوجو صاحب المحل - OM BASMA للستائر والمفروشات"
          className="w-full h-full object-contain"
          loading="eager"
        />
      </div>
    </div>
  );
};

