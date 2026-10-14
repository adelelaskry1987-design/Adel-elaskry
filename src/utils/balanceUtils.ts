/**
 * Unified Balance Logic for AH2 Project
 * 
 * Rules:
 * 1. Positive balance (> 0): Amount in favor of customer (المحل مدين للعميل بهذا المبلغ).
 *    Display: Absolute amount with "رصيد لصالح العميل", Green color.
 * 2. Negative balance (< 0): Amount due to the shop from the customer (المبلغ مستحق للمحل على العميل).
 *    Display: Absolute amount with "مبلغ مستحق للمحل", Red color.
 * 3. Zero balance (=== 0): Balanced account (الحساب متعادل).
 *    Display: "الحساب متعادل" (0 ج.م), Neutral color.
 * 
 * Formula:
 * Balance = Total Active Payments - Total Active Withdrawals
 */

export interface CustomerBalanceInfo {
  balance: number;
  absAmount: number;
  statusText: 'رصيد لصالح العميل' | 'مبلغ مستحق للمحل' | 'الحساب متعادل';
  formattedAmount: string;
  badgeClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  fullDescription: string;
  shortDescription: string;
  state: 'positive' | 'negative' | 'zero';
}

export function getCustomerBalanceInfo(rawBalance: number | undefined | null): CustomerBalanceInfo {
  const balance = typeof rawBalance === 'number' && !isNaN(rawBalance) ? rawBalance : 0;
  // Clean rounding
  const rounded = Math.round(balance * 100) / 100;

  if (rounded > 0) {
    const formatted = `${rounded.toLocaleString()} ج.م`;
    return {
      balance: rounded,
      absAmount: rounded,
      statusText: 'رصيد لصالح العميل',
      formattedAmount: formatted,
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-300',
      badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
      fullDescription: `رصيد لصالح العميل: ${formatted} (المحل مدين للعميل)`,
      shortDescription: `رصيد لصالح العميل (${formatted})`,
      state: 'positive',
    };
  }

  if (rounded < 0) {
    const abs = Math.abs(rounded);
    const formatted = `${abs.toLocaleString()} ج.م`;
    return {
      balance: rounded,
      absAmount: abs,
      statusText: 'مبلغ مستحق للمحل',
      formattedAmount: formatted,
      textClass: 'text-red-700',
      bgClass: 'bg-red-50',
      borderClass: 'border-red-300',
      badgeClass: 'bg-red-50 text-red-800 border border-red-300',
      fullDescription: `مبلغ مستحق للمحل: ${formatted} (على العميل)`,
      shortDescription: `مبلغ مستحق للمحل (${formatted})`,
      state: 'negative',
    };
  }

  return {
    balance: 0,
    absAmount: 0,
    statusText: 'الحساب متعادل',
    formattedAmount: '0 ج.م',
    textClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    fullDescription: 'الحساب متعادل (0 ج.م)',
    shortDescription: 'الحساب متعادل',
    state: 'zero',
  };
}

/**
 * Format Period Net Movement specifically
 * (Period Payments - Period Withdrawals)
 */
export function getPeriodMovementInfo(netMovement: number) {
  const rounded = Math.round(netMovement * 100) / 100;
  if (rounded > 0) {
    return {
      amount: rounded,
      text: `+${rounded.toLocaleString()} ج.م (صافي حركة لصالح العميل)`,
      colorClass: 'text-emerald-700',
    };
  } else if (rounded < 0) {
    return {
      amount: Math.abs(rounded),
      text: `${Math.abs(rounded).toLocaleString()} ج.م (صافي حركة مستحقة للمحل)`,
      colorClass: 'text-red-700',
    };
  }
  return {
    amount: 0,
    text: '0 ج.م (تعادل في حركة الفترة)',
    colorClass: 'text-slate-600',
  };
}
