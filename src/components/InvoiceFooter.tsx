import React from 'react';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';
import { Ah2Logo } from './Ah2Logo';

interface InvoiceFooterProps {
  className?: string;
  showSystemText?: boolean;
}

/**
 * Shared Customer Invoice & Statement Footer
 *
 * Complies with strict project requirements:
 * 1. Placed at the very bottom of the customer invoice/statement.
 * 2. Far Right (أقصى اليمين): Shop logo (OM BASMA) with two-line shop name ('OM BASMA' / 'للستائر والمفروشات') adjacent to its left.
 * 3. Far Left (أقصى اليسار): Project logo (AH2) with existing system/project info adjacent to its right.
 * 4. Both logos in a single horizontal row with harmonious vertical alignment and preserved aspect ratios.
 */
export const InvoiceFooter: React.FC<InvoiceFooterProps> = ({
  className = '',
  showSystemText = true,
}) => {
  const logoUrl = shopLogoEmblemAsset || '/shop_owner_logo_emblem.png';

  return (
    <div
      dir="rtl"
      className={`pt-2.5 border-t-[1.5px] border-[#c59a3f]/70 flex flex-row items-center justify-between gap-2 text-slate-700 select-none ${className}`}
    >
      {/* Far Right (أقصى اليمين): Shop Logo + Shop Name in 2 lines */}
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

        {/* Shop Name to the Left of the Shop Logo */}
        <div className="flex flex-col text-right justify-center">
          <span className="font-black text-xs sm:text-[13px] text-[#0f233c] font-sans tracking-wide leading-none whitespace-nowrap">
            OM BASMA
          </span>
          <span className="font-bold text-[9.5px] sm:text-[10.5px] text-amber-700 font-sans leading-tight mt-0.5 whitespace-nowrap">
            للستائر والمفروشات
          </span>
        </div>
      </div>

      {/* Far Left (أقصى اليسار): Existing System Text + Project Logo (AH2) at the Far Left Edge */}
      <div className="flex items-center gap-2 shrink-0">
        {showSystemText && (
          <div className="text-left space-y-0.5">
            <div className="font-bold text-[9.5px] sm:text-[10.5px] text-slate-700 font-sans leading-tight whitespace-nowrap">
              كشف حساب رسمي معتمد
            </div>
            <div className="text-[8.5px] sm:text-[9.5px] font-semibold text-slate-500 font-sans leading-tight whitespace-nowrap">
              نظام AH2 لإدارة الحسابات والعمليات
            </div>
          </div>
        )}

        {/* Project Logo (AH2) at Far Left */}
        <Ah2Logo variant="footer" showSubtitle={false} />
      </div>
    </div>
  );
};

export default InvoiceFooter;
