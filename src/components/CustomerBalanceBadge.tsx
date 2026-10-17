import React from 'react';
import { getCustomerBalanceInfo } from '../utils/balanceUtils';

export interface CustomerBalanceBadgeProps {
  balance: number | undefined | null;
  variant?: 'badge' | 'card' | 'inline' | 'hero';
  showDescription?: boolean;
  className?: string;
}

export const CustomerBalanceBadge: React.FC<CustomerBalanceBadgeProps> = ({
  balance,
  variant = 'badge',
  showDescription = true,
  className = '',
}) => {
  const info = getCustomerBalanceInfo(balance);

  if (variant === 'hero') {
    return (
      <div
        className={`rounded-2xl p-4 border shadow-sm flex items-center justify-between transition-all ${
          info.state === 'positive'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : info.state === 'negative'
            ? 'bg-red-50 border-red-300 text-red-950'
            : 'bg-slate-50 border-slate-300 text-slate-800'
        } ${className}`}
      >
        <div>
          <span className="text-xs font-bold text-slate-600 block">الرصيد الحالي للعميل</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-black font-mono tabular-nums ${info.textClass}`}>
              {info.formattedAmount}
            </span>
          </div>
          {showDescription && (
            <div className={`text-xs font-bold mt-1 inline-flex items-center gap-1 ${info.textClass}`}>
              <span className="w-2 h-2 rounded-full bg-current inline-block" />
              <span>{info.statusText}</span>
              {info.state === 'positive' && (
                <span className="text-[10px] text-slate-500 font-normal">(المحل مدين للعميل)</span>
              )}
              {info.state === 'negative' && (
                <span className="text-[10px] text-slate-500 font-normal">(على العميل)</span>
              )}
            </div>
          )}
        </div>

        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm ${
            info.state === 'positive'
              ? 'bg-emerald-600 text-white'
              : info.state === 'negative'
              ? 'bg-red-600 text-white'
              : 'bg-[var(--color-primary)] text-white'
          }`}
        >
          {info.state === 'positive' ? '+' : info.state === 'negative' ? '-' : '='}
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`p-3 rounded-xl border flex items-center justify-between ${info.bgClass} ${info.borderClass} ${className}`}
      >
        <div>
          <div className="text-[10px] text-slate-500 font-bold">الرصيد الحالي</div>
          <div className={`text-base font-black font-mono tabular-nums ${info.textClass}`}>
            {info.formattedAmount}
          </div>
        </div>
        <div className="text-left">
          <span
            className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${info.badgeClass}`}
          >
            {info.statusText}
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-bold ${info.textClass} ${className}`}>
        <span>{info.formattedAmount}</span>
        {showDescription && (
          <span className="text-[10px] font-sans font-normal opacity-90">({info.statusText})</span>
        )}
      </span>
    );
  }

  // Default: badge
  return (
    <div className={`inline-flex flex-col items-end ${className}`}>
      <span
        className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono tabular-nums border ${info.badgeClass}`}
      >
        {info.formattedAmount}
      </span>
      {showDescription && (
        <span
          className={`text-[9px] font-bold mt-0.5 ${info.textClass}`}
          title={info.fullDescription}
        >
          {info.statusText}
        </span>
      )}
    </div>
  );
};

export default CustomerBalanceBadge;
