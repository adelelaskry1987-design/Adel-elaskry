import React from 'react';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';

interface InvoiceFooterProps {
  className?: string;
  showSystemText?: boolean;
}

/**
 * Shared Customer Invoice & Statement Footer
 * 
 * Complies with strict project requirements:
 * 1. Placed at the very bottom of the customer invoice/statement after transactions & financial summary.
 * 2. Shop logo positioned on the right (in RTL).
 * 3. 'OM BASMA' on the first line adjacent to the logo on the left.
 * 4. 'للستائر والمفروشات' directly beneath 'OM BASMA' on the second line with close vertical proximity.
 * 5. Uses original authentic logo with object-contain to fill its frame without distortion or clipping.
 * 6. Preserves official brand color palette (#0f233c navy, amber-400 gold border, amber-700 subtitle).
 * 7. Clean integration for PDF generation and visual rendering.
 */
export const InvoiceFooter: React.FC<InvoiceFooterProps> = ({
  className = '',
  showSystemText = true,
}) => {
  const logoUrl = shopLogoEmblemAsset || '/shop_owner_logo_emblem.png';

  return (
    <div
      dir="rtl"
      className={`pt-4 border-t-2 border-[#c59a3f]/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-700 select-none ${className}`}
    >
      {/* Shop Commercial Identity: [Logo on Right] [OM BASMA & للستائر والمفروشات on Left] */}
      <div className="flex items-center gap-3">
        {/* Logo Container on the Right */}
        <div className="logo-light-frame w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-white border-2 border-amber-400 shadow-sm p-1.5 flex items-center justify-center shrink-0">
          <img
            src={logoUrl}
            alt="لوجو متجر OM BASMA"
            className="max-w-full max-h-full w-auto h-auto object-contain"
            loading="eager"
          />
        </div>

        {/* Brand Names to the Left of the Logo */}
        <div className="flex flex-col text-right justify-center">
          <span className="font-black text-base sm:text-lg text-[#0f233c] font-sans tracking-wide leading-none whitespace-nowrap">
            OM BASMA
          </span>
          <span className="font-bold text-xs sm:text-sm text-amber-700 font-sans leading-tight mt-1 whitespace-nowrap">
            للستائر والمفروشات
          </span>
        </div>
      </div>

      {/* System & Verification Note */}
      {showSystemText && (
        <div className="text-center sm:text-left text-xs space-y-0.5">
          <div className="font-bold text-slate-700 font-sans">
            كشف حساب رسمي معتمد
          </div>
          <div className="text-[11px] font-semibold text-slate-500 font-sans">
            نظام AH2 لإدارة الحسابات والعمليات
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceFooter;
