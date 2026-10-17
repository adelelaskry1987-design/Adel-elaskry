import React from 'react';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';
import { Ah2Logo } from './Ah2Logo';

interface InvoiceFooterProps {
  className?: string;
}

/**
 * Shared Customer Invoice & Statement Footer
 *
 * Organized into two clear, balanced groups below the golden divider line:
 * 1. Right Side (الجهة اليمنى): Original shop logo (OM BASMA) with two-line shop name ('OM BASMA' / 'للستائر والمفروشات') beside it.
 * 2. Left Side (الجهة اليسرى): Original project logo (AH2) with 'نظام AH2 المعتمد' centered directly underneath it as a single cohesive unit.
 */
export const InvoiceFooter: React.FC<InvoiceFooterProps> = ({
  className = '',
}) => {
  const logoUrl = shopLogoEmblemAsset || '/shop_owner_logo_emblem.png';

  return (
    <div
      dir="rtl"
      className={`pt-2.5 border-t-[1.5px] border-[#c59a3f]/70 flex flex-row items-center justify-between gap-3 text-slate-700 select-none ${className}`}
    >
      {/* الجهة اليمنى: شعار المحل OM BASMA وبجواره اسم المحل في سطرين */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Shop Logo Container at Far Right */}
        <div className="logo-light-frame w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border-[1.5px] border-amber-400 shadow-sm p-1 flex items-center justify-center shrink-0">
          <img
            src={logoUrl}
            alt="لوجو متجر OM BASMA"
            className="max-w-full max-h-full w-auto h-auto object-contain"
            loading="eager"
          />
        </div>

        {/* Shop Name beside the Shop Logo */}
        <div className="flex flex-col text-right justify-center">
          <span className="font-black text-xs sm:text-[13px] text-[#0f233c] font-sans tracking-wide leading-none whitespace-nowrap">
            OM BASMA
          </span>
          <span className="font-bold text-[9.5px] sm:text-[10.5px] text-amber-700 font-sans leading-tight mt-0.5 whitespace-nowrap">
            للستائر والمفروشات
          </span>
        </div>
      </div>

      {/* الجهة اليسرى: شعار المشروع AH2 وتحته مباشرة "نظام AH2 المعتمد" */}
      <div className="flex flex-col items-center justify-center gap-1 shrink-0">
        <Ah2Logo variant="footer" showSubtitle={false} />
        <span className="font-bold text-[8.5px] sm:text-[9.5px] text-slate-600 font-sans leading-none text-center whitespace-nowrap">
          نظام AH2 المعتمد
        </span>
      </div>
    </div>
  );
};

export default InvoiceFooter;
