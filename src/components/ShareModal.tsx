import React, { useState, useRef, useEffect } from 'react';
import {
  Share2,
  FileText,
  Printer,
  Copy,
  Check,
  X,
  MessageCircle,
  Download,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Building2,
  User,
  Phone,
  Calendar,
  Clock,
  Briefcase,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Send,
  Mail,
  Bluetooth,
  MoreHorizontal,
  ArrowRight,
  Loader2,
  Image as ImageIcon,
  ListOrdered,
  Wallet,
} from 'lucide-react';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';
import { Header } from './Header';
import { ShopOwnerLogo } from './ShopOwnerLogo';
import { InvoiceFooter } from './InvoiceFooter';
import { PageTitle } from './PageTitle';
import { Customer, Transaction } from '../types';
import { api } from '../services/api';
import { getCustomerBalanceInfo, getPeriodMovementInfo } from '../utils/balanceUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Convert modern CSS color functions (Tailwind v4 oklch/oklab/color-mix)
 * into standard rgb()/rgba() strings supported by html2canvas, and clean up
 * inline styles that DocumentCloner copies onto <svg> elements.
 */
function sanitizeClonedDocumentColors(clonedDoc: Document, rootEl: HTMLElement) {
  const colorCanvas = clonedDoc.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const ctx = colorCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const cache = new Map<string, string>();
  const resolveSingleColor = (rawColor: string): string => {
    const trimmed = rawColor.trim();
    if (!trimmed) return trimmed;
    const cached = cache.get(trimmed);
    if (cached) return cached;
    if (trimmed.includes('var(')) {
      return 'rgb(226, 232, 240)';
    }
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = trimmed;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      const result =
        a === 0
          ? 'rgba(0, 0, 0, 0)'
          : a === 255
          ? `rgb(${r}, ${g}, ${b})`
          : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      cache.set(trimmed, result);
      return result;
    } catch {
      return 'rgb(30, 41, 59)';
    }
  };

  const replaceModernColorsInString = (value: string): string => {
    if (
      !value ||
      (!value.includes('oklch') &&
        !value.includes('oklab') &&
        !value.includes('color-mix') &&
        !value.includes('color('))
    ) {
      return value;
    }
    return value.replace(
      /(?:oklch|oklab|color-mix|color)\([^()]*(\([^()]*\)[^()]*)*\)/gi,
      (match) => resolveSingleColor(match)
    );
  };

  // 1. Sanitize computed styles on rootEl and all its descendants FIRST
  // (while <style> rules still have intact CSS variables so getComputedStyle resolves var() accurately)
  const view = clonedDoc.defaultView || window;
  const colorProps = [
    'color',
    'backgroundColor',
    'backgroundImage',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'boxShadow',
    'textDecorationColor',
    'textShadow',
    'outlineColor',
    'webkitTextStrokeColor',
  ] as const;

  const allNodes: HTMLElement[] = [
    rootEl,
    ...Array.from(rootEl.querySelectorAll<HTMLElement>('*')),
  ];

  for (const node of allNodes) {
    const computed = view.getComputedStyle(node);
    if (!computed) continue;

    for (const prop of colorProps) {
      const val = (computed as any)[prop];
      if (
        typeof val === 'string' &&
        (val.includes('oklch') ||
          val.includes('oklab') ||
          val.includes('color-mix') ||
          val.includes('color('))
      ) {
        (node.style as any)[prop] = replaceModernColorsInString(val);
      }
    }

    // Ensure proper connected Arabic glyph shaping in html2canvas (non-zero letter-spacing or monospace font splits Arabic letters)
    if (/[\u0600-\u06FF]/.test(node.textContent || '')) {
      node.style.letterSpacing = '0px';
      node.style.fontVariantLigatures = 'normal';
      node.style.fontFeatureSettings = '"liga" 1, "calt" 1, "kern" 1';
      node.style.fontFamily = "'Cairo', 'IBM Plex Sans Arabic', sans-serif";
    }

    // Preserve aspect ratio on <img> elements since html2canvas does not support object-fit: contain
    if (node.tagName.toLowerCase() === 'img') {
      const imgEl = node as HTMLImageElement;
      const nw = imgEl.naturalWidth;
      const nh = imgEl.naturalHeight;
      const parent = imgEl.parentElement;
      if (nw > 0 && nh > 0 && parent) {
        const parentRect = parent.getBoundingClientRect();
        const pStyle = view.getComputedStyle(parent);
        const padX =
          (parseFloat(pStyle.paddingLeft) || 0) +
          (parseFloat(pStyle.paddingRight) || 0) +
          (parseFloat(pStyle.borderLeftWidth) || 0) +
          (parseFloat(pStyle.borderRightWidth) || 0);
        const padY =
          (parseFloat(pStyle.paddingTop) || 0) +
          (parseFloat(pStyle.paddingBottom) || 0) +
          (parseFloat(pStyle.borderTopWidth) || 0) +
          (parseFloat(pStyle.borderBottomWidth) || 0);
        const availW = Math.max(16, parentRect.width - padX);
        const availH = Math.max(16, parentRect.height - padY);
        const scale = Math.min(availW / nw, availH / nh);
        imgEl.style.width = `${Math.round(nw * scale)}px`;
        imgEl.style.height = `${Math.round(nh * scale)}px`;
      }
    }

    // Clean up inline styles that html2canvas's DocumentCloner copies onto <svg> and its child nodes
    if (node.tagName.toLowerCase() === 'svg') {
      const resolvedColor = replaceModernColorsInString(computed.color || '#1e3a5f');
      const isAh2Logo = node.getAttribute('aria-label') === 'AH2';
      const isCornerWave = node.getAttribute('viewBox') === '0 0 160 160';
      const isRightWave =
        isCornerWave &&
        (node.classList.contains('-right-3.5') ||
          node.classList.contains('-right-5') ||
          node.classList.contains('sm:-right-5') ||
          node.classList.contains('sm:-right-7'));
      const isLeftWave =
        isCornerWave &&
        (node.classList.contains('-left-3.5') ||
          node.classList.contains('-left-5') ||
          node.classList.contains('sm:-left-5') ||
          node.classList.contains('sm:-left-7'));

      node.querySelectorAll('*').forEach((child) => {
        child.removeAttribute('style');
      });

      if (isAh2Logo) {
        node.style.cssText =
          'display:block !important;width:52px !important;height:32px !important;min-width:52px !important;min-height:32px !important;overflow:visible !important;flex-shrink:0 !important;';
        node.setAttribute('width', '52');
        node.setAttribute('height', '32');
      } else if (isCornerWave) {
        node.style.cssText = `position:absolute !important;top:-22px !important;${
          isRightWave ? 'right:-18px !important;left:auto !important;' : ''
        }${
          isLeftWave ? 'left:-18px !important;right:auto !important;' : ''
        }width:60px !important;height:60px !important;display:block !important;pointer-events:none !important;overflow:visible !important;`;
      } else {
        const iconSize =
          node.classList.contains('w-3')
            ? '12px'
            : node.classList.contains('w-3.5')
            ? '14px'
            : '16px';
        node.style.cssText = `display:inline-block !important;vertical-align:middle !important;width:${iconSize} !important;height:${iconSize} !important;min-width:${iconSize} !important;min-height:${iconSize} !important;color:${resolvedColor} !important;stroke:${resolvedColor} !important;fill:none !important;overflow:visible !important;flex-shrink:0 !important;`;
        node.setAttribute('width', iconSize);
        node.setAttribute('height', iconSize);
        if (node.getAttribute('stroke') === 'currentColor') {
          node.setAttribute('stroke', resolvedColor);
        }
      }
    }
  }

  // 2. Sanitize all <style> tags in the cloned document after computed styles are captured
  const styleNodes = clonedDoc.querySelectorAll('style');
  styleNodes.forEach((styleEl) => {
    if (styleEl.textContent) {
      styleEl.textContent = replaceModernColorsInString(styleEl.textContent);
    }
  });
}

/**
 * Find a clean horizontal row break near targetY (scanning upwards) using both DOM block boundaries
 * and pixel verification so multi-page PDFs never slice through a transaction card, text line, or footer.
 */
function findSafePageBreakY(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  maxPageHeightPx: number,
  totalHeight: number,
  blockBoundsPx: Array<{ top: number; bottom: number }> = []
): number {
  const idealEnd = startY + maxPageHeightPx;
  if (idealEnd >= totalHeight) return totalHeight;

  // 1. Prefer breaking in the gap between atomic DOM blocks (cards, rows, footer)
  if (blockBoundsPx.length > 0) {
    const blocksInPage = blockBoundsPx.filter(
      (b) => b.bottom > startY + 120 && b.top < idealEnd
    );
    for (let i = blocksInPage.length - 1; i >= 0; i--) {
      const blk = blocksInPage[i];
      if (blk.bottom <= idealEnd - 8) {
        const nextBlk = blockBoundsPx.find((nb) => nb.top >= blk.bottom);
        const breakY = nextBlk
          ? Math.floor((blk.bottom + nextBlk.top) / 2)
          : Math.min(totalHeight, blk.bottom + 10);
        if (breakY > startY + 120) {
          return breakY;
        }
      }
    }
  }

  // 2. Fallback: scan upwards for a contiguous band of pure white rows across the full sheet width (including card borders)
  const searchRange = Math.min(260, Math.floor(maxPageHeightPx * 0.3));
  const minCandidateY = Math.max(startY + 200, idealEnd - searchRange);
  const stripHeight = idealEnd - minCandidateY + 1;

  try {
    const imgData = ctx.getImageData(0, minCandidateY, width, stripHeight).data;
    const marginX = Math.floor(width * 0.03);
    let consecutiveWhiteRows = 0;

    for (let offset = stripHeight - 1; offset >= 0; offset--) {
      const rowStart = offset * width * 4;
      let isCleanRow = true;
      for (let x = marginX; x < width - marginX; x += 2) {
        const idx = rowStart + x * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        if (r < 252 || g < 252 || b < 252) {
          isCleanRow = false;
          break;
        }
      }
      if (isCleanRow) {
        consecutiveWhiteRows++;
        if (consecutiveWhiteRows >= 8) {
          return minCandidateY + offset + 4;
        }
      } else {
        consecutiveWhiteRows = 0;
      }
    }
  } catch {
    // Fallback to idealEnd if getImageData fails
  }

  return idealEnd;
}

export type ShareData =
  | {
      type: 'all_transactions';
      projectName: string;
      reportDate: string;
      periodText: string;
      totalPayments: number;
      totalWithdrawals: number;
      netMovement: number;
      totalCount: number;
      activeCount: number;
      cancelledCount: number;
      transactions: Transaction[];
    }
  | {
      type: 'customer_statement';
      projectName: string;
      reportDate: string;
      periodText: string;
      customer: Customer;
      currentBalance: number;
      periodPayments: number;
      periodWithdrawals: number;
      periodNetMovement: number;
      transactions: Transaction[];
    }
  | {
      type: 'reports_summary';
      projectName: string;
      reportDate: string;
      periodText: string;
      totalCustomers: number;
      totalTransactions: number;
      totalPayments: number;
      totalWithdrawals: number;
      netBalance: number;
    };

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ShareData;
}

/**
 * Format date string (e.g. 2026-10-14) to formal Arabic text (e.g. 14 أكتوبر 2026)
 */
function formatArabicDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const arabicMonths = [
        'يناير',
        'فبراير',
        'مارس',
        'أبريل',
        'مايو',
        'يونيو',
        'يوليو',
        'أغسطس',
        'سبتمبر',
        'أكتوبر',
        'نوفمبر',
        'ديسمبر',
      ];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${arabicMonths[monthIdx]} ${year}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export type CustomerShareContentScope = 'balance_only' | 'full_statement';
export type CustomerShareSendFormat = 'text' | 'image' | 'pdf';

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, data }) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [contentScope, setContentScope] = useState<CustomerShareContentScope>('full_statement');
  const [sendFormat, setSendFormat] = useState<CustomerShareSendFormat>('pdf');
  const printableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    api
      .getNotifications()
      .then((list) => {
        setUnreadCount(list.filter((n) => !n.is_read).length);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const isBusy = isGeneratingPdf || isGeneratingImage;

  const showSuccessStatus = (msg: string, duration = 3500) => {
    setErrorMessage(null);
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), duration);
  };

  const showErrorStatus = (msg: string, duration = 4500) => {
    setStatusMessage(null);
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), duration);
  };

  // Compute accurate active transaction totals for customer_statement (excluding cancelled transactions)
  const activeCustomerTxs =
    data.type === 'customer_statement'
      ? data.transactions.filter((t) => t.status !== 'cancelled')
      : [];
  const effectivePeriodPayments =
    data.type === 'customer_statement'
      ? data.transactions.length > 0
        ? activeCustomerTxs
            .filter((t) => t.type === 'payment')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0)
        : data.periodPayments
      : 0;
  const effectivePeriodWithdrawals =
    data.type === 'customer_statement'
      ? data.transactions.length > 0
        ? activeCustomerTxs
            .filter((t) => t.type === 'withdrawal')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0)
        : data.periodWithdrawals
      : 0;
  const effectivePeriodNetMovement =
    effectivePeriodPayments - effectivePeriodWithdrawals;

  // Generate plain Arabic text suitable for WhatsApp / text sharing
  const generateFormattedText = (
    overrideScope?: CustomerShareContentScope
  ): string => {
    const scope = overrideScope || contentScope;
    const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';

    if (data.type === 'all_transactions') {
      const txLines = data.transactions
        .map((t, idx) => {
          const isCancelled = t.status === 'cancelled';
          const typeLabel = t.type === 'payment' ? 'دفع (+)' : 'سحب (-)';
          const statusText = isCancelled
            ? `[⚠️ ملغاة - غير محتسبة${t.cancellation_reason ? `: ${t.cancellation_reason}` : ''}]`
            : '[نشطة]';
          return `${idx + 1}) ${typeLabel} ${t.amount.toLocaleString()} ج.م
   • العميل: ${t.customer_name || 'غير محدد'}
   • التاريخ: ${t.date} ${t.time}
   • البيان: ${t.description || 'بدون بيان'}
   • الحالة: ${statusText}`;
        })
        .join('\n\n');

      return `📋 تقرير كل العمليات المالية
🏢 المشروع: ${data.projectName}
📅 تاريخ التقرير: ${data.reportDate}
⏱ الفترة: ${data.periodText}
${divider}
📊 الملخص المالي للحركات الظاهرة:
🔹 إجمالي الدفع: ${data.totalPayments.toLocaleString()} ج.م
🔻 إجمالي السحب: ${data.totalWithdrawals.toLocaleString()} ج.م
⚖️ صافي الحركة: ${data.netMovement.toLocaleString()} ج.م
🔢 عدد العمليات: ${data.totalCount} عملية (${data.activeCount} نشطة ، ${data.cancelledCount} ملغاة)
⚠️ تنبيه: العمليات الملغاة موضحة بحالتها ولا تُحتسب في المجاميع الفعلية.
${divider}
📝 بيان تفاصيل العمليات:
${txLines || 'لا توجد عمليات مسجلة خلال هذه الفترة.'}
${divider}
متجر OM BASMA للستائر والمفروشات • نظام AH2 المعتمد`;
    }

    if (data.type === 'customer_statement') {
      const balInfo = getCustomerBalanceInfo(data.currentBalance);
      const balanceMeaning =
        balInfo.state === 'positive'
          ? 'رصيد لصالح العميل'
          : balInfo.state === 'negative'
          ? 'رصيد مستحق للمحل'
          : 'الحساب متوازن';

      // الخيار الأول: إجمالي الحساب فقط (ملخص مختصر بدون تفاصيل العمليات أو قائمة الدفع والسحب)
      if (scope === 'balance_only') {
        return `ملخص حساب عميل
${divider}
اسم المشروع: ${data.projectName}
اسم العميل: ${data.customer.name}${
          data.customer.phone ? `\nرقم الهاتف: ${data.customer.phone}` : ''
        }
تاريخ إعداد الحساب: ${formatArabicDate(data.reportDate)}
${divider}
إجمالي الحساب الحالي: ${balInfo.formattedAmount}
توضيح الرصيد: ${balanceMeaning}
${divider}
OM BASMA للستائر والمفروشات - نظام AH2 المعتمد`;
      }

      // الخيار الثاني: إجمالي الحساب والعمليات (كشف حساب تفصيلي)
      const txLines = data.transactions
        .map((t, idx) => {
          const isCancelled = t.status === 'cancelled';
          const typeLabel = t.type === 'payment' ? 'دفع (+)' : 'سحب (-)';
          const statusSuffix = isCancelled
            ? ' [ملغاة - لا تدخل في الحسابات]'
            : '';
          const desc = t.description ? ` - ${t.description}` : '';
          return `${idx + 1}. ${typeLabel} ${t.amount.toLocaleString()} ج.م (${t.date}${
            t.time ? ` ${t.time}` : ''
          })${desc}${statusSuffix}`;
        })
        .join('\n');

      const periodMovementInfo = getPeriodMovementInfo(effectivePeriodNetMovement);
      const hasCustomPeriod =
        Boolean(data.periodText) &&
        data.periodText !== 'كافة العمليات المسجلة للعميل';

      return `كشف حساب عميل تفصيلي
${divider}
اسم المشروع: ${data.projectName}
اسم العميل: ${data.customer.name}${
        data.customer.phone ? `\nرقم الهاتف: ${data.customer.phone}` : ''
      }
تاريخ إعداد الكشف: ${formatArabicDate(data.reportDate)}
${hasCustomPeriod ? `الفترة المحددة: ${data.periodText}\n` : ''}${divider}
الموقف المالي للعميل:
الرصيد الحالي: ${balInfo.formattedAmount} (${balanceMeaning})
إجمالي عمليات الدفع: ${effectivePeriodPayments.toLocaleString()} ج.م
إجمالي عمليات السحب: ${effectivePeriodWithdrawals.toLocaleString()} ج.م
صافي الحركة خلال الفترة: ${periodMovementInfo.text}
${divider}
تفاصيل العمليات:
${txLines || 'لا توجد عمليات مسجلة خلال هذه الفترة.'}
${divider}
OM BASMA للستائر والمفروشات - نظام AH2 المعتمد`;
    }

    // reports_summary
    return `📊 تقرير الأداء المالي والإحصائيات
🏢 المشروع: ${data.projectName}
📅 تاريخ الإصدار: ${data.reportDate}
⏱ الفترة المحددة: ${data.periodText}
${divider}
📈 المؤشرات المالية المعتمدة:
👥 إجمالي العملاء: ${data.totalCustomers.toLocaleString()} عميل
📝 إجمالي العمليات: ${data.totalTransactions.toLocaleString()} عملية
🔹 إجمالي الإيداعات / المدفوعات: ${data.totalPayments.toLocaleString()} ج.م
🔻 إجمالي السحوبات: ${data.totalWithdrawals.toLocaleString()} ج.م
⚖️ صافي الموقف المالي: ${data.netBalance.toLocaleString()} ج.م
${divider}
متجر OM BASMA للستائر والمفروشات • نظام AH2 المعتمد`;
  };

  // Shared helper: render printableRef to a high-resolution Canvas with Light Mode & Arabic RTL fidelity
  const renderSheetToCanvas = async () => {
    // Allow React to flush any pending state update before capturing DOM
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

    if (!printableRef.current) {
      throw new Error('لم يتم العثور على قالب الفاتورة لإنشاء الملف');
    }

    const element = printableRef.current;

    // Ensure all images inside the invoice sheet are loaded before capturing
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalHeight > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 2500);
        });
      })
    );

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Image & PDF capture dimensions:
    // - customer_statement: preserved at 333px width x 528/695px min-height at 2x scale (666px width).
    // - all_transactions & reports_summary: rendered at mobile portrait width (360px CSS width at 3x scale = 1080px Full-HD width)
    //   with natural content-driven height (height: auto, no fixed height) so they match the in-app mobile preview
    //   and fill vertical phone screens in WhatsApp clearly without shrinking to 1/3 height or clipping long reports.
    const isCustomerStatement = data.type === 'customer_statement';
    const targetWidth = isCustomerStatement ? 333 : 360;
    const minTargetHeight = isCustomerStatement
      ? contentScope === 'balance_only'
        ? 528
        : 695
      : 0;
    const renderScale = isCustomerStatement ? 2 : 3;
    const blockBoundsPx: Array<{ top: number; bottom: number }> = [];

    const canvas = await html2canvas(element, {
      scale: renderScale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: targetWidth,
      windowWidth: targetWidth + 32,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: (clonedDoc, clonedEl) => {
        // Force light theme on the cloned document so exported images/PDFs are never affected by Dark Mode
        clonedDoc.documentElement.classList.remove('dark');
        clonedDoc.documentElement.classList.add('light');
        clonedDoc.documentElement.setAttribute('data-theme', 'light');
        clonedDoc.documentElement.style.colorScheme = 'light';

        // Isolate clonedEl at (0, 0) in clonedDoc.body so modal scroll, page scroll, and offscreen wrapper never clip the top header
        clonedDoc.documentElement.style.margin = '0';
        clonedDoc.documentElement.style.padding = '0';
        clonedDoc.documentElement.style.background = '#ffffff';
        clonedDoc.documentElement.style.overflow = 'visible';
        clonedDoc.documentElement.style.height = 'auto';

        clonedDoc.body.style.margin = '0';
        clonedDoc.body.style.padding = '0';
        clonedDoc.body.style.background = '#ffffff';
        clonedDoc.body.style.overflow = 'visible';
        clonedDoc.body.style.height = 'auto';
        clonedDoc.body.style.width = `${targetWidth}px`;
        clonedDoc.body.dir = 'rtl';

        while (clonedDoc.body.firstChild) {
          clonedDoc.body.removeChild(clonedDoc.body.firstChild);
        }
        clonedDoc.body.appendChild(clonedEl);

        clonedEl.style.position = 'relative';
        clonedEl.style.left = '0';
        clonedEl.style.top = '0';
        clonedEl.style.margin = '0';
        clonedEl.style.width = `${targetWidth}px`;
        clonedEl.style.maxWidth = `${targetWidth}px`;
        clonedEl.style.minWidth = `${targetWidth}px`;
        clonedEl.style.height = 'auto';
        if (minTargetHeight > 0) {
          clonedEl.style.minHeight = `${minTargetHeight}px`;
          clonedEl.style.display = 'flex';
          clonedEl.style.flexDirection = 'column';
          clonedEl.style.justifyContent = 'space-between';
        } else {
          clonedEl.style.minHeight = '0';
        }
        clonedEl.style.maxHeight = 'none';
        clonedEl.style.opacity = '1';
        clonedEl.style.visibility = 'visible';
        clonedEl.style.transform = 'none';
        clonedEl.style.overflow = isCustomerStatement ? 'hidden' : 'visible';
        clonedEl.style.boxShadow = 'none';
        clonedEl.style.borderRadius = '12px';
        clonedEl.style.backgroundColor = '#ffffff';
        clonedEl.style.direction = 'rtl';

        sanitizeClonedDocumentColors(clonedDoc, clonedEl);

        // Record atomic block boundaries (cards, transaction items, footer) in canvas pixels for clean multi-page breaks
        const rootRect = clonedEl.getBoundingClientRect();
        const atomicBlocks = clonedEl.querySelectorAll<HTMLElement>(
          '.rounded-xl, .rounded-2xl, [dir="rtl"]'
        );
        atomicBlocks.forEach((blk) => {
          if (blk === clonedEl) return;
          const r = blk.getBoundingClientRect();
          if (r.height > 20 && r.height < 500) {
            blockBoundsPx.push({
              top: Math.max(0, Math.floor((r.top - rootRect.top) * renderScale)),
              bottom: Math.ceil((r.bottom - rootRect.top) * renderScale),
            });
          }
        });
        blockBoundsPx.sort((a, b) => a.top - b.top);
      },
    });

    const baseCustomerSlug =
      data.type === 'customer_statement'
        ? data.customer.name.trim().replace(/\s+/g, '_')
        : '';

    const fileTitle =
      data.type === 'customer_statement'
        ? contentScope === 'balance_only'
          ? `ملخص_حساب_${baseCustomerSlug}`
          : `كشف_حساب_${baseCustomerSlug}`
        : data.type === 'all_transactions'
        ? 'تقرير_كل_العمليات_المالية'
        : 'تقرير_الاحصائيات_المالية';

    return { canvas, blockBoundsPx, fileTitle };
  };

  // Core helper: generate actual PNG Image Blob and File from printableRef
  const generateImageFile = async () => {
    const { canvas, fileTitle } = await renderSheetToCanvas();
    const fileName = `${fileTitle}_${data.reportDate}.png`;

    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            reject(new Error('تعذر تحويل الفاتورة إلى ملف صورة صالح'));
          }
        },
        'image/png',
        1.0
      );
    });

    const imageFile = new File([imageBlob], fileName, { type: 'image/png' });
    return { canvas, imageBlob, imageFile, fileName, fileTitle };
  };

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Core helper: generate the actual PDF document, Blob, and File from printableRef
  const generatePdfFile = async () => {
    const { canvas, blockBoundsPx, fileTitle } = await renderSheetToCanvas();

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginMm = 8;
    const fullPrintableWidthMm = pageWidthMm - marginMm * 2;
    const printableHeightMm = pageHeightMm - marginMm * 2;

    // Scale portrait sheets on the A4 PDF page
    const pdfScaleFactor = data.type === 'customer_statement' ? 0.7 : 0.76;
    const printableWidthMm = fullPrintableWidthMm * pdfScaleFactor;

    const maxPageHeightPx = Math.floor(
      (printableHeightMm * canvas.width) / printableWidthMm
    );
    const sourceCtx = canvas.getContext('2d', { willReadFrequently: true });

    if (canvas.height <= Math.floor(maxPageHeightPx * 1.25)) {
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      let renderWidthMm = printableWidthMm;
      let renderHeightMm = (canvas.height * renderWidthMm) / canvas.width;
      if (renderHeightMm > printableHeightMm) {
        const fitScale = printableHeightMm / renderHeightMm;
        renderHeightMm = printableHeightMm;
        renderWidthMm = renderWidthMm * fitScale;
      }
      const offsetXMm = (pageWidthMm - renderWidthMm) / 2;
      pdf.addImage(
        imgData,
        'JPEG',
        offsetXMm,
        marginMm,
        renderWidthMm,
        renderHeightMm
      );
    } else {
      let currentY = 0;
      let pageIndex = 0;
      const offsetXMm = (pageWidthMm - printableWidthMm) / 2;

      while (currentY < canvas.height) {
        const nextBreakY = sourceCtx
          ? findSafePageBreakY(
              sourceCtx,
              canvas.width,
              currentY,
              maxPageHeightPx,
              canvas.height,
              blockBoundsPx
            )
          : Math.min(currentY + maxPageHeightPx, canvas.height);

        const sliceHeightPx = Math.max(1, nextBreakY - currentY);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const pageCtx = pageCanvas.getContext('2d');

        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            canvas,
            0,
            currentY,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );

          const sliceImgData = pageCanvas.toDataURL('image/jpeg', 0.96);
          const sliceHeightMm =
            (sliceHeightPx * printableWidthMm) / canvas.width;

          if (pageIndex > 0) {
            pdf.addPage();
          }

          pdf.addImage(
            sliceImgData,
            'JPEG',
            offsetXMm,
            marginMm,
            printableWidthMm,
            sliceHeightMm
          );
        }

        currentY = nextBreakY;
        pageIndex++;
      }
    }

    const fileName = `${fileTitle}_${data.reportDate}.pdf`;
    const pdfBlob = pdf.output('blob');
    if (!pdfBlob || pdfBlob.size === 0) {
      throw new Error('تعذر إنشاء ملف PDF صالح');
    }
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    return { pdf, pdfBlob, pdfFile, fileName, fileTitle };
  };

  // 0. Pre-cache generated Image & PDF files per contentScope so Android Web Share API
  //    can be invoked synchronously inside the user tap without losing transient user activation.
  const cachedImageRef = useRef<
    Record<
      string,
      { imageBlob: Blob; imageFile: File; fileName: string; fileTitle: string }
    >
  >({});
  const cachedPdfRef = useRef<
    Record<
      string,
      { pdf: jsPDF; pdfBlob: Blob; pdfFile: File; fileName: string; fileTitle: string }
    >
  >({});
  const [readySharePayload, setReadySharePayload] = useState<{
    file: File;
    kind: 'image' | 'pdf';
  } | null>(null);

  const getCacheKey = () => {
    const filterKey =
      data.type === 'customer_statement'
        ? `${data.customer.id}:${data.transactions.length}:${data.currentBalance}`
        : data.type === 'all_transactions'
        ? `${data.periodText}:${data.totalCount}:${data.netMovement}`
        : `${data.periodText}:${data.totalCustomers}:${data.totalTransactions}:${data.netBalance}`;
    return `${data.type}:${contentScope}:${filterKey}`;
  };

  useEffect(() => {
    if (!isOpen) {
      cachedImageRef.current = {};
      cachedPdfRef.current = {};
      setReadySharePayload(null);
      return;
    }
    setReadySharePayload(null);
    const cacheKey = getCacheKey();
    const timer = setTimeout(async () => {
      if (!printableRef.current) return;
      try {
        if (!cachedImageRef.current[cacheKey]) {
          cachedImageRef.current[cacheKey] = await generateImageFile();
        }
        if (!cachedPdfRef.current[cacheKey]) {
          cachedPdfRef.current[cacheKey] = await generatePdfFile();
        }
      } catch {
        // Silent background warmup; on-demand generation handles errors if needed
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, data, contentScope]);

  const getOrGenerateImageFile = async () => {
    const cacheKey = getCacheKey();
    if (cachedImageRef.current[cacheKey]) {
      return cachedImageRef.current[cacheKey];
    }
    const result = await generateImageFile();
    cachedImageRef.current[cacheKey] = result;
    return result;
  };

  const getOrGeneratePdfFile = async () => {
    const cacheKey = getCacheKey();
    if (cachedPdfRef.current[cacheKey]) {
      return cachedPdfRef.current[cacheKey];
    }
    const result = await generatePdfFile();
    cachedPdfRef.current[cacheKey] = result;
    return result;
  };

  const isMobileEnv = () =>
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  // Helper to share a single File (Image or PDF ONLY — never attaches text or title)
  const shareSingleFileNatively = async (
    file: File,
    kind: 'image' | 'pdf',
    fallbackSave: () => void
  ) => {
    setReadySharePayload(null);
    const canShareFile =
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));

    if (canShareFile) {
      try {
        await navigator.share({
          files: [file],
        });
        showSuccessStatus(
          kind === 'image'
            ? 'تم فتح نافذة المشاركة؛ اختر واتساب لإرسال الصورة فقط'
            : 'تم فتح نافذة المشاركة؛ اختر واتساب لإرسال ملف PDF فقط'
        );
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          setStatusMessage(null);
          return;
        }
        // If transient user activation expired while waiting for file generation on Android,
        // surface a 1-tap button so the next tap shares immediately in 0ms!
        if (shareErr?.name === 'NotAllowedError') {
          setReadySharePayload({ file, kind });
          showSuccessStatus(
            kind === 'image'
              ? 'تم تجهيز صورة الفاتورة — اضغط على الزر الأخضر بالأسفل لاختيار واتساب ومشاركتها فورًا'
              : 'تم تجهيز ملف PDF — اضغط على الزر الأخضر بالأسفل لاختيار واتساب ومشاركته فورًا'
          );
          return;
        }
      }
    }

    // Browser/WebView does not support Web Share Level 2 file sharing:
    // Save the file locally and show an honest explanation WITHOUT opening api.whatsapp.com
    fallbackSave();
    showSuccessStatus(
      kind === 'image'
        ? 'تم حفظ صورة الفاتورة على جهازك. متصفحك الحالي لا يدعم تمرير الملفات مباشرةً؛ يمكنك إرفاق الصورة المحفوظة داخل واتساب.'
        : 'تم حفظ ملف PDF على جهازك. متصفحك الحالي لا يدعم تمرير الملفات مباشرةً؛ يمكنك إرفاق الملف المحفوظ داخل واتساب.'
    );
  };

  // 0a. Send as Text ONLY via WhatsApp (without using api.whatsapp.com/send web download page)
  const handleWhatsAppTextOnly = async () => {
    const text = generateFormattedText();

    // 1. Prefer Web Share API on mobile/modern browsers so Android opens the native Share Sheet
    //    where the installed WhatsApp / WhatsApp Business app can be selected directly
    //    without ever triggering the api.whatsapp.com "Download WhatsApp" web page.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        showSuccessStatus('تم فتح نافذة المشاركة لإرسال النص عبر واتساب');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setStatusMessage(null);
          return;
        }
      }
    }

    // 2. If Web Share API is unavailable on mobile WebView, use the native whatsapp:// URI scheme
    //    (handled directly by Android OS Intent for installed WhatsApp, never opens api.whatsapp.com download page)
    if (isMobileEnv()) {
      try {
        await navigator.clipboard?.writeText(text);
      } catch {
        // ignore clipboard error
      }
      const nativeSchemeUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
      window.location.href = nativeSchemeUrl;
      showSuccessStatus('جاري فتح تطبيق واتساب المثبت على الهاتف مع نص الفاتورة...');
      return;
    }

    // 3. Desktop fallback without falsely claiming WhatsApp isn't installed on a phone
    await handleCopyText();
    showSuccessStatus(
      'تم نسخ نص الفاتورة إلى الحافظة؛ يمكنك لصقه مباشرة داخل محادثة واتساب'
    );
  };

  // 0b. Share as Text ONLY via system share dialog or fallback to clipboard
  const handleShareTextOnly = async () => {
    const text = generateFormattedText();

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        showSuccessStatus('تم فتح نافذة المشاركة لإرسال النص فقط');
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setStatusMessage(null);
          return;
        }
      }
    }

    await handleCopyText();
  };

  // 1a. Generate and share/download actual PNG Image file ONLY (never attaches text)
  const handleImageShare = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء الصورة');
      return;
    }
    setIsGeneratingImage(true);
    setErrorMessage(null);
    setStatusMessage('جاري إعداد وتوليد صورة الفاتورة...');

    try {
      const { imageBlob, imageFile, fileName } = await getOrGenerateImageFile();
      await shareSingleFileNatively(imageFile, 'image', () =>
        triggerBlobDownload(imageBlob, fileName)
      );
    } catch (err: any) {
      console.error('Image generation error:', err);
      showErrorStatus(
        err?.message || 'حدث خطأ أثناء إنشاء صورة الفاتورة، يرجى المحاولة مرة أخرى'
      );
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 1b. Save/Download PNG Image directly to device
  const handleDownloadImage = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء الصورة');
      return;
    }
    setIsGeneratingImage(true);
    setErrorMessage(null);
    setStatusMessage('جاري إنشاء وحفظ صورة الفاتورة...');

    try {
      const { imageBlob, fileName } = await getOrGenerateImageFile();
      triggerBlobDownload(imageBlob, fileName);
      showSuccessStatus('تم حفظ صورة الفاتورة بنجاح على جهازك');
    } catch (err: any) {
      console.error('Image save error:', err);
      showErrorStatus(
        err?.message || 'تعذر إنشاء أو حفظ صورة الفاتورة على الجهاز'
      );
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 1c. Open generated PNG Image in viewer/new tab
  const handleOpenImage = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء الصورة');
      return;
    }
    setIsGeneratingImage(true);
    setErrorMessage(null);
    setStatusMessage('جاري تجهيز وفتح صورة الفاتورة...');

    try {
      const { imageBlob, fileName } = await getOrGenerateImageFile();
      const blobUrl = URL.createObjectURL(imageBlob);
      const opened = window.open(blobUrl, '_blank');
      if (!opened) {
        triggerBlobDownload(imageBlob, fileName);
      }
      showSuccessStatus('تم تجهيز وفتح صورة الفاتورة بنجاح');
    } catch (err: any) {
      console.error('Image open error:', err);
      showErrorStatus(err?.message || 'تعذر فتح صورة الفاتورة');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 1. WhatsApp share (strictly respects selected sendFormat: 'text' | 'image' | 'pdf' across all 3 pages without attaching text to image/pdf and without opening api.whatsapp.com download page)
  const handleWhatsAppShare = async () => {
    if (sendFormat === 'text') {
      await handleWhatsAppTextOnly();
      return;
    }

    if (sendFormat === 'image') {
      await handleImageShare();
      return;
    }

    await handlePdfShare();
  };

  // 2. Generate and share/download actual PDF file ONLY (never attaches text or image)
  const handlePdfShare = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء ملف PDF');
      return;
    }
    setIsGeneratingPdf(true);
    setErrorMessage(null);
    setStatusMessage('جاري إعداد وتوليد ملف PDF...');

    try {
      const { pdf, pdfFile, fileName } = await getOrGeneratePdfFile();
      await shareSingleFileNatively(pdfFile, 'pdf', () => pdf.save(fileName));
    } catch (err: any) {
      console.error('PDF error:', err);
      showErrorStatus(
        err?.message || 'تعذر إنشاء ملف PDF، يرجى المحاولة مرة أخرى'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2b. Save/Download PDF directly to device
  const handleDownloadPdf = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء ملف PDF');
      return;
    }
    setIsGeneratingPdf(true);
    setErrorMessage(null);
    setStatusMessage('جاري إنشاء وحفظ ملف PDF...');

    try {
      const { pdf, fileName } = await getOrGeneratePdfFile();
      pdf.save(fileName);
      showSuccessStatus('تم حفظ ملف PDF بنجاح على جهازك');
    } catch (err: any) {
      console.error('PDF save error:', err);
      showErrorStatus(err?.message || 'تعذر حفظ ملف PDF على الجهاز');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2c. Open generated PDF file in viewer/new tab
  const handleOpenPdf = async () => {
    if (!printableRef.current) {
      showErrorStatus('تعذر العثور على قالب الفاتورة لإنشاء ملف PDF');
      return;
    }
    setIsGeneratingPdf(true);
    setErrorMessage(null);
    setStatusMessage('جاري تجهيز وفتح ملف PDF...');

    try {
      const { pdfBlob, fileName } = await getOrGeneratePdfFile();
      const blobUrl = URL.createObjectURL(pdfBlob);
      const opened = window.open(blobUrl, '_blank');
      if (!opened) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      showSuccessStatus('تم تجهيز وفتح ملف PDF بنجاح');
    } catch (err: any) {
      console.error('PDF open error:', err);
      showErrorStatus(err?.message || 'تعذر فتح ملف PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. Share via other apps (strictly respects selected sendFormat: 'text' | 'image' | 'pdf' across all 3 pages)
  const handleOtherAppsShare = async () => {
    if (sendFormat === 'text') {
      await handleShareTextOnly();
      return;
    }

    if (sendFormat === 'image') {
      await handleImageShare();
      return;
    }

    await handlePdfShare();
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateFormattedText());
      setCopied(true);
      showSuccessStatus('تم نسخ النص إلى الحافظة بنجاح', 2500);
      setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      showErrorStatus('تعذر النسخ التلقائي إلى الحافظة');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Telegram share (strictly respects selected format across all 3 pages)
  const handleTelegramShare = async () => {
    if (sendFormat === 'image') {
      await handleImageShare();
      return;
    }
    if (sendFormat === 'pdf') {
      await handlePdfShare();
      return;
    }
    if (typeof navigator.share === 'function') {
      await handleShareTextOnly();
      return;
    }
    const text = generateFormattedText();
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showSuccessStatus('تم فتح نافذة تيليجرام لإرسال النص');
  };

  // Gmail share
  const handleGmailShare = () => {
    const text = generateFormattedText();
    const subject =
      data.type === 'customer_statement'
        ? contentScope === 'balance_only'
          ? `ملخص حساب العميل: ${data.customer.name}`
          : `كشف حساب العميل: ${data.customer.name}`
        : data.type === 'all_transactions'
        ? 'تقرير كل العمليات المالية'
        : 'تقرير التقارير والإحصائيات';
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    showSuccessStatus('تم فتح تطبيق البريد لإرسال الرسالة');
  };

  // SMS share
  const handleSmsShare = () => {
    const text = generateFormattedText();
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
    showSuccessStatus('تم فتح تطبيق الرسائل لإرسال النص');
  };

  const shareOptions = [
    { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-600', action: handleWhatsAppShare },
    { name: 'Telegram', icon: Send, color: 'theme-btn-primary', action: handleTelegramShare },
    { name: 'Messenger', icon: MessageCircle, color: 'theme-btn-primary', action: handleOtherAppsShare },
    { name: 'IMO', icon: MessageCircle, color: 'theme-btn-primary', action: handleOtherAppsShare },
    { name: 'Gmail', icon: Mail, color: 'theme-btn-primary', action: handleGmailShare },
    { name: 'الرسائل', icon: MessageCircle, color: 'bg-emerald-600', action: handleSmsShare },
    { name: 'المزيد', icon: MoreHorizontal, color: 'theme-btn-gold', action: handleOtherAppsShare },
    { name: 'بلوتوث', icon: Bluetooth, color: 'theme-btn-primary', action: handleOtherAppsShare },
  ];

  const reportTitle =
    data.type === 'customer_statement'
      ? `كشف حساب: ${data.customer.name}`
      : data.type === 'all_transactions'
      ? 'تقرير كل العمليات المالية'
      : 'تقرير التقارير والإحصائيات';

  const logoUrl = shopLogoEmblemAsset || '/shop_owner_logo_emblem.png';

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-page)] text-[var(--text-primary)] overflow-y-auto flex flex-col select-none animate-in fade-in duration-150">
      {/* Shared Top Dark Header identical to all other application pages */}
      <Header
        currentScreen="screen-17-share-menu"
        onNavigate={() => onClose()}
        onBack={onClose}
        unreadNotificationsCount={unreadCount}
      />

      <main className="flex-1 w-full max-w-md mx-auto">
        <div className="p-4 max-w-md mx-auto space-y-4 pb-24">
          {/* Page Title: STRICTLY FIRST element per project guidelines */}
          <PageTitle title="قائمة المشاركة" />

        {/* Back and Subtitle bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors active:scale-98 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <span>رجوع</span>
          </button>
          <span className="text-[11px] font-bold text-slate-500 truncate max-w-[200px]">
            {reportTitle}
          </span>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Instant 1-Tap Native Share Button if transient activation expired during generation */}
        {readySharePayload && (
          <button
            type="button"
            onClick={async () => {
              const payload = readySharePayload;
              setReadySharePayload(null);
              try {
                await navigator.share({ files: [payload.file] });
                showSuccessStatus(
                  payload.kind === 'image'
                    ? 'تم فتح نافذة المشاركة لإرسال الصورة عبر واتساب'
                    : 'تم فتح نافذة المشاركة لإرسال ملف PDF عبر واتساب'
                );
              } catch (err: any) {
                if (err?.name !== 'AbortError') {
                  showErrorStatus('تعذر فتح نافذة المشاركة من المتصفح الحالي');
                }
              }
            }}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer animate-pulse"
          >
            <Share2 className="w-4 h-4" />
            <span>
              {readySharePayload.kind === 'image'
                ? 'اضغط هنا لفتح قائمة المشاركة واختيار واتساب لإرسال الصورة'
                : 'اضغط هنا لفتح قائمة المشاركة واختيار واتساب لإرسال ملف PDF'}
            </span>
          </button>
        )}

        {/* Error Toast */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-bold p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ==================== CUSTOMER INVOICE SHARE OPTIONS (TWO SECTIONS) ==================== */}
        {data.type === 'customer_statement' && (() => {
          const bal = getCustomerBalanceInfo(data.currentBalance);
          const balanceMeaning =
            bal.state === 'positive'
              ? 'رصيد لصالح العميل'
              : bal.state === 'negative'
              ? 'رصيد مستحق للمحل'
              : 'الحساب متوازن';

          return (
            <>
              {/* القسم الأول: ماذا تريد أن ترسل؟ */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-[var(--color-gold)]" />
                    أولًا: ماذا تريد أن ترسل؟
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {data.customer.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* الخيار الأول: إجمالي الحساب فقط */}
                  <button
                    type="button"
                    onClick={() => setContentScope('balance_only')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      contentScope === 'balance_only'
                        ? 'theme-btn-primary text-white border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/40 shadow-sm'
                        : 'theme-btn-secondary hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Wallet
                        className={`w-4 h-4 ${
                          contentScope === 'balance_only'
                            ? 'text-[#f3d27a]'
                            : 'text-[var(--color-gold)]'
                        }`}
                      />
                      {contentScope === 'balance_only' && (
                        <CheckCircle2 className="w-4 h-4 text-[#f3d27a]" />
                      )}
                    </div>
                    <div>
                      <div
                        className={`text-xs font-black ${
                          contentScope === 'balance_only' ? 'text-white' : ''
                        }`}
                      >
                        إجمالي الحساب فقط
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 leading-snug ${
                          contentScope === 'balance_only'
                            ? 'text-slate-200'
                            : 'text-slate-500'
                        }`}
                      >
                        ملخص مختصر للرصيد الحالي فقط بدون العمليات
                      </div>
                    </div>
                  </button>

                  {/* الخيار الثاني: إجمالي الحساب والعمليات */}
                  <button
                    type="button"
                    onClick={() => setContentScope('full_statement')}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      contentScope === 'full_statement'
                        ? 'theme-btn-primary text-white border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/40 shadow-sm'
                        : 'theme-btn-secondary hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <ListOrdered
                        className={`w-4 h-4 ${
                          contentScope === 'full_statement'
                            ? 'text-[#f3d27a]'
                            : 'text-[var(--color-gold)]'
                        }`}
                      />
                      {contentScope === 'full_statement' && (
                        <CheckCircle2 className="w-4 h-4 text-[#f3d27a]" />
                      )}
                    </div>
                    <div>
                      <div
                        className={`text-xs font-black ${
                          contentScope === 'full_statement' ? 'text-white' : ''
                        }`}
                      >
                        إجمالي الحساب والعمليات
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 leading-snug ${
                          contentScope === 'full_statement'
                            ? 'text-slate-200'
                            : 'text-slate-500'
                        }`}
                      >
                        كشف حساب تفصيلي يشمل الملخص وجميع العمليات ({data.transactions.length})
                      </div>
                    </div>
                  </button>
                </div>

                {/* Live Balance Summary Strip */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    bal.state === 'positive'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : bal.state === 'negative'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">
                      إجمالي الحساب الحالي
                    </div>
                    <div className="text-sm font-black font-mono">
                      {bal.formattedAmount}
                    </div>
                  </div>
                  <div className="text-left text-xs font-bold">
                    {balanceMeaning}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ==================== UNIFIED SHARE FORMAT SELECTOR (TEXT / IMAGE / PDF FOR ALL 3 PAGES) ==================== */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-[var(--color-gold)]" />
              {data.type === 'customer_statement'
                ? 'ثانيًا: اختر طريقة المشاركة'
                : 'اختر صيغة المشاركة'}
            </span>
            <span className="text-[10px] font-bold text-slate-500">
              {data.type === 'customer_statement'
                ? contentScope === 'balance_only'
                  ? 'إجمالي الحساب فقط'
                  : 'إجمالي الحساب والعمليات'
                : data.periodText}
            </span>
          </div>

          {/* 3 Send Format Choices */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSendFormat('text')}
              className={`py-2.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                sendFormat === 'text'
                  ? 'theme-btn-primary text-white border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/40 shadow-sm'
                  : 'theme-btn-secondary hover:opacity-90'
              }`}
            >
              <MessageCircle
                className={`w-4 h-4 ${
                  sendFormat === 'text'
                    ? 'text-[#f3d27a]'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
              <span className={sendFormat === 'text' ? 'text-white' : ''}>
                مشاركة كنص
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSendFormat('image')}
              className={`py-2.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                sendFormat === 'image'
                  ? 'theme-btn-primary text-white border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/40 shadow-sm'
                  : 'theme-btn-secondary hover:opacity-90'
              }`}
            >
              <ImageIcon
                className={`w-4 h-4 ${
                  sendFormat === 'image'
                    ? 'text-[#f3d27a]'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
              <span className={sendFormat === 'image' ? 'text-white' : ''}>
                مشاركة كصورة
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSendFormat('pdf')}
              className={`py-2.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                sendFormat === 'pdf'
                  ? 'theme-btn-primary text-white border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/40 shadow-sm'
                  : 'theme-btn-secondary hover:opacity-90'
              }`}
            >
              <FileText
                className={`w-4 h-4 ${
                  sendFormat === 'pdf'
                    ? 'text-[#f3d27a]'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
              <span className={sendFormat === 'pdf' ? 'text-white' : ''}>
                مشاركة كملف PDF
              </span>
            </button>
          </div>

          {/* Actions for the selected Format + Content combination */}
          {sendFormat === 'text' && (
            <div className="space-y-2.5 pt-1">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-sans text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {generateFormattedText()}
              </div>
              <button
                type="button"
                onClick={handleWhatsAppTextOnly}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {data.type === 'customer_statement'
                    ? contentScope === 'balance_only'
                      ? 'مشاركة إجمالي الحساب فقط كنص عبر واتساب'
                      : 'مشاركة إجمالي الحساب والعمليات كنص عبر واتساب'
                    : data.type === 'all_transactions'
                    ? 'مشاركة تقرير العمليات كنص عبر واتساب'
                    : 'مشاركة التقرير والإحصائيات كنص عبر واتساب'}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleShareTextOnly}
                  className="py-2.5 px-3 rounded-xl theme-btn-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>مشاركة كنص</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="py-2.5 px-3 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-black">
                        تم نسخ النص
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>نسخ النص</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {sendFormat === 'image' && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleImageShare}
                disabled={isBusy}
                className="w-full py-2.5 px-3 rounded-xl theme-btn-primary disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {isGeneratingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري إنشاء الصورة...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    <span>
                      {data.type === 'customer_statement'
                        ? contentScope === 'balance_only'
                          ? 'مشاركة إجمالي الحساب فقط كصورة'
                          : 'مشاركة إجمالي الحساب والعمليات كصورة'
                        : data.type === 'all_transactions'
                        ? 'مشاركة تقرير العمليات كصورة'
                        : 'مشاركة التقرير والإحصائيات كصورة'}
                    </span>
                  </>
                )}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={isBusy}
                  className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-amber-300 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-700" />
                  <span>حفظ الصورة</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenImage}
                  disabled={isBusy}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-blue-200 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-blue-700" />
                  <span>فتح الصورة</span>
                </button>
              </div>
            </div>
          )}

          {sendFormat === 'pdf' && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handlePdfShare}
                disabled={isBusy}
                className="w-full py-2.5 px-3 rounded-xl theme-btn-primary disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري إنشاء ملف PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>
                      {data.type === 'customer_statement'
                        ? contentScope === 'balance_only'
                          ? 'مشاركة إجمالي الحساب فقط كملف PDF'
                          : 'مشاركة إجمالي الحساب والعمليات كملف PDF'
                        : data.type === 'all_transactions'
                        ? 'مشاركة تقرير العمليات كملف PDF'
                        : 'مشاركة التقرير والإحصائيات كملف PDF'}
                    </span>
                  </>
                )}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isBusy}
                  className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-amber-300 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-700" />
                  <span>حفظ ملف PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPdf}
                  disabled={isBusy}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-blue-200 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-blue-700" />
                  <span>فتح ملف PDF</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 1. Main 35-Screens Card: مشاركة عبر التطبيقات */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-700 mb-4 text-center">
            مشاركة عبر التطبيقات
          </h3>

          <div className="grid grid-cols-4 gap-4">
            {shareOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.name}
                  onClick={opt.action}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl ${opt.color} text-white flex items-center justify-center shadow-md`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">{opt.name}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100">
            <button
              onClick={handleOtherAppsShare}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer"
            >
              مشاركة من الجهاز
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              سيتم فتح قائمة المشاركة الأصلية الخاصة بنظام جهازك
            </p>
          </div>
        </div>

        {/* 2. Document & PDF Actions Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" />
              خيارات المستند والـ PDF
            </span>
            {data.type === 'customer_statement' && (
              <span className="text-[11px] font-bold text-slate-500">
                {data.customer.name}
              </span>
            )}
          </div>

          {/* Customer Balance Info if customer statement */}
          {data.type === 'customer_statement' && (() => {
            const bal = getCustomerBalanceInfo(data.currentBalance);
            return (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  bal.state === 'positive'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : bal.state === 'negative'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">الرصيد الحالي</div>
                  <div className="text-sm font-black font-mono">{bal.formattedAmount}</div>
                </div>
                <div className="text-left text-xs font-bold">
                  {bal.statusText}
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleImageShare}
              disabled={isBusy}
              className="w-full py-2.5 px-3 rounded-xl theme-btn-gold disabled:opacity-50 font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري إنشاء الصورة...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>مشاركة وتنزيل كصورة (PNG)</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadImage}
                disabled={isBusy}
                className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-amber-300 cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-700" />
                <span>حفظ كصورة</span>
              </button>

              <button
                onClick={handleOpenImage}
                disabled={isBusy}
                className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-blue-200 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-blue-700" />
                <span>فتح الصورة</span>
              </button>
            </div>

            <button
              onClick={handlePdfShare}
              disabled={isBusy}
              className="w-full py-2.5 px-3 rounded-xl theme-btn-primary disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري إنشاء ملف PDF...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>مشاركة وتنزيل PDF</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={isBusy}
                className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-amber-300 cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-700" />
                <span>حفظ ملف PDF</span>
              </button>

              <button
                onClick={handleOpenPdf}
                disabled={isBusy}
                className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-blue-200 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-blue-700" />
                <span>فتح ملف PDF</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCopyText}
                className="py-2.5 px-3 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-black">تم النسخ بنجاح</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>نسخ التقرير كنص</span>
                  </>
                )}
              </button>

              <button
                onClick={handlePrint}
                className="py-2.5 px-3 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span>طباعة المستند</span>
              </button>
            </div>
          </div>

          {/* Preview accordion button */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowPreviewSheet(!showPreviewSheet)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>معاينة المستند المعتمد وتصميم الـ PDF</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  showPreviewSheet ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Document Sheet for Capture and Preview */}
        <div
          className={`transition-all ${
            showPreviewSheet
              ? 'p-2 sm:p-3 bg-slate-200/90 rounded-2xl overflow-x-auto shadow-inner block'
              : 'fixed -left-[99999px] top-0 opacity-0 pointer-events-none'
          }`}
        >
              <div
                ref={printableRef}
                className={`printable-invoice-sheet bg-white shadow-lg text-slate-800 font-sans relative overflow-hidden mx-auto ${
                  data.type === 'customer_statement'
                    ? `w-full max-w-[333px] px-3.5 py-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between ${
                        contentScope === 'balance_only'
                          ? 'min-h-[528px]'
                          : 'min-h-[695px]'
                      }`
                    : 'w-full max-w-[360px] p-4 rounded-2xl border-2 border-amber-400/80 space-y-3.5'
                }`}
                style={{ direction: 'rtl' }}
              >
                {/* ---------------- CUSTOMER STATEMENT (70% WIDTH x 120% HEIGHT MOBILE PORTRAIT LAYOUT) ---------------- */}
                {data.type === 'customer_statement' && (() => {
                  const bal = getCustomerBalanceInfo(data.currentBalance);

                  return (
                    <div className="flex-1 flex flex-col justify-between gap-2 relative">
                      {/* Top & Middle Content Group */}
                      <div className="space-y-2 relative">
                        {/* Decorative Top Corner Waves */}
                        <svg
                          className="absolute -top-4 -right-3.5 w-14 h-14 pointer-events-none"
                          viewBox="0 0 160 160"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M160 0 L0 0 C0 60 40 120 100 150 C130 165 160 140 160 140 Z"
                            fill="#0f233c"
                          />
                          <path
                            d="M0 10 C0 68 38 125 96 153"
                            stroke="#c59a3f"
                            strokeWidth="3.5"
                            fill="none"
                          />
                          <path
                            d="M0 22 C0 74 32 128 88 156"
                            stroke="#c59a3f"
                            strokeWidth="1.5"
                            strokeOpacity="0.6"
                            fill="none"
                          />
                        </svg>

                        <svg
                          className="absolute -top-4 -left-3.5 w-14 h-14 pointer-events-none"
                          viewBox="0 0 160 160"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M0 0 L160 0 C160 60 120 120 60 150 C30 165 0 140 0 140 Z"
                            fill="#0f233c"
                          />
                          <path
                            d="M160 10 C160 68 122 125 64 153"
                            stroke="#c59a3f"
                            strokeWidth="3.5"
                            fill="none"
                          />
                          <path
                            d="M160 22 C160 74 128 128 72 156"
                            stroke="#c59a3f"
                            strokeWidth="1.5"
                            strokeOpacity="0.6"
                            fill="none"
                          />
                        </svg>

                        {/* Statement Title flanked by thin golden lines */}
                        <div className="flex items-center justify-center gap-2.5 pt-1.5 pb-0.5 px-8">
                          <div className="flex-1 h-[1.5px] bg-[#c59a3f]"></div>
                          <h1 className="text-lg font-black text-[#0f233c] tracking-tight whitespace-nowrap font-sans">
                            كشف حساب
                          </h1>
                          <div className="flex-1 h-[1.5px] bg-[#c59a3f]"></div>
                        </div>

                        {/* 3. Project and Customer Information Card */}
                        <div
                          className={`bg-[#f8fafd] border border-[#e2e8f0] rounded-xl shadow-sm ${
                            contentScope === 'balance_only'
                              ? 'p-3.5 space-y-2'
                              : 'p-2.5 space-y-1'
                          }`}
                        >
                          {/* Project Name */}
                          <div
                            className={`flex items-center justify-between gap-2 border-b border-slate-100 ${
                              contentScope === 'balance_only' ? 'py-1' : 'py-0.5'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px] font-semibold shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-[#1e3a5f]" />
                              <span>اسم المشروع</span>
                            </div>
                            <div className="font-black text-[11.5px] text-[#0f233c] text-left leading-tight">
                              {data.projectName}
                            </div>
                          </div>

                          {/* Customer Name */}
                          <div
                            className={`flex items-center justify-between gap-2 border-b border-slate-100 ${
                              contentScope === 'balance_only' ? 'py-1' : 'py-0.5'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px] font-semibold shrink-0">
                              <User className="w-3.5 h-3.5 text-[#1e3a5f]" />
                              <span>العميل</span>
                            </div>
                            <div className="font-black text-[11.5px] text-[#0f233c] text-left leading-tight">
                              {data.customer.name}
                            </div>
                          </div>

                          {/* Customer Phone (if available) */}
                          {data.customer.phone && (
                            <div
                              className={`flex items-center justify-between gap-2 border-b border-slate-100 ${
                                contentScope === 'balance_only' ? 'py-1' : 'py-0.5'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px] font-semibold shrink-0">
                                <Phone className="w-3.5 h-3.5 text-[#1e3a5f]" />
                                <span>رقم الهاتف</span>
                              </div>
                              <div className="font-bold text-[11.5px] font-mono text-[#0f233c] dir-ltr">
                                {data.customer.phone}
                              </div>
                            </div>
                          )}

                          {/* Report Date */}
                          <div
                            className={`flex items-center justify-between gap-2 ${
                              contentScope === 'balance_only' ? 'py-1' : 'py-0.5'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px] font-semibold shrink-0">
                              <Calendar className="w-3.5 h-3.5 text-[#1e3a5f]" />
                              <span>
                                {contentScope === 'balance_only'
                                  ? 'تاريخ إعداد الحساب'
                                  : 'تاريخ الإصدار'}
                              </span>
                            </div>
                            <div className="font-bold text-[11.5px] text-[#0f233c]">
                              {formatArabicDate(data.reportDate)}
                            </div>
                          </div>

                          {/* Covered Period (only in full_statement if non-default) */}
                          {contentScope === 'full_statement' &&
                            data.periodText &&
                            data.periodText !== 'كافة العمليات المسجلة للعميل' && (
                              <div className="flex items-center justify-between gap-2 py-0.5 border-t border-slate-100">
                                <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px] font-semibold shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-[#1e3a5f]" />
                                  <span>الفترة المغطاة</span>
                                </div>
                                <div className="font-bold text-[10.5px] text-[#0f233c] text-left leading-tight">
                                  {data.periodText}
                                </div>
                              </div>
                            )}
                        </div>

                        {/* 4. Financial Status Card (Redistributed vertically for optimal mobile readability) */}
                        <div
                          className={`bg-[#f8fafd] border border-[#e2e8f0] rounded-xl shadow-sm ${
                            contentScope === 'balance_only'
                              ? 'p-3.5 space-y-2.5'
                              : 'p-2.5 space-y-1.5'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 pb-1.5 text-xs font-black text-[#0f233c] leading-normal">
                            <Briefcase className="w-3.5 h-3.5 text-[#1e3a5f]" />
                            <span>
                              {contentScope === 'balance_only'
                                ? 'إجمالي الحساب الحالي'
                                : 'الموقف المالي للعميل'}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {/* Current Balance Banner (Full Width) */}
                            <div className="flex flex-col items-center justify-center w-full">
                              <div
                                className={`w-full rounded-xl shadow-sm text-center text-white ${
                                  contentScope === 'balance_only'
                                    ? 'pt-2.5 pb-4 px-3'
                                    : 'pt-1.5 pb-3 px-3'
                                } ${
                                  bal.state === 'positive'
                                    ? 'bg-[#00875a]'
                                    : bal.state === 'negative'
                                    ? 'bg-[#dc2626]'
                                    : 'bg-slate-600'
                                }`}
                              >
                                <span className="text-[10.5px] font-bold opacity-95 block mb-0.5">
                                  {contentScope === 'balance_only'
                                    ? 'إجمالي الحساب الحالي'
                                    : 'الرصيد الحالي'}
                                </span>
                                <div className="text-lg font-black font-mono tracking-tight tabular-nums whitespace-nowrap leading-normal">
                                  {bal.formattedAmount}
                                </div>
                              </div>
                              <div className="mt-1 pb-0.5 flex items-center justify-center gap-1 font-bold text-[10.5px]">
                                {bal.state === 'positive' ? (
                                  <span className="text-[#00875a] flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                                    <span>رصيد لصالح العميل</span>
                                  </span>
                                ) : bal.state === 'negative' ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                                    <span>رصيد مستحق للمحل</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-600 flex items-center gap-1">
                                    <Scale className="w-3 h-3" />
                                    <span>الحساب متوازن</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Breakdown list (ONLY when contentScope === 'full_statement', Full Width) */}
                            {contentScope === 'full_statement' && (
                              <div className="w-full pt-1.5 border-t border-slate-200/90 space-y-1 text-[10.5px]">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                                    <ArrowUpRight className="w-3 h-3 text-emerald-600 stroke-[2.5] shrink-0" />
                                    <span>إجمالي عمليات الدفع</span>
                                  </div>
                                  <div className="font-black font-mono text-[11.5px] text-slate-800 whitespace-nowrap">
                                    {effectivePeriodPayments.toLocaleString()} ج.م
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                                    <ArrowDownRight className="w-3 h-3 text-red-600 stroke-[2.5] shrink-0" />
                                    <span>إجمالي عمليات السحب</span>
                                  </div>
                                  <div className="font-black font-mono text-[11.5px] text-slate-800 whitespace-nowrap">
                                    {effectivePeriodWithdrawals.toLocaleString()} ج.م
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                                  <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                                    <Scale className="w-3 h-3 text-[#00875a] shrink-0" />
                                    <span>صافي حركة الفترة</span>
                                  </div>
                                  <div
                                    className={`font-black font-mono text-[11.5px] whitespace-nowrap ${
                                      effectivePeriodNetMovement > 0
                                        ? 'text-[#00875a]'
                                        : effectivePeriodNetMovement < 0
                                        ? 'text-red-600'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {effectivePeriodNetMovement > 0
                                      ? `+${effectivePeriodNetMovement.toLocaleString()} ج.م`
                                      : effectivePeriodNetMovement < 0
                                      ? `-${Math.abs(effectivePeriodNetMovement).toLocaleString()} ج.م`
                                      : '0 ج.م'}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 5. Customer Transactions List (ONLY when contentScope === 'full_statement', 2-row card layout for narrow mobile width) */}
                        {contentScope === 'full_statement' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 pb-1 text-xs font-black text-[#0f233c] leading-normal">
                              <FileText className="w-3.5 h-3.5 text-[#1e3a5f]" />
                              <span>عمليات العميل</span>
                            </div>

                            {data.transactions.length === 0 ? (
                              <div className="bg-[#f8fafd] border border-slate-200 rounded-xl p-3 text-center text-slate-400 text-[10.5px]">
                                لا توجد عمليات مسجلة لهذا العميل خلال الفترة المحددة.
                              </div>
                            ) : (
                              data.transactions.map((t) => {
                                const isCancelled = t.status === 'cancelled';
                                const isPayment = t.type === 'payment';
                                return (
                                  <div
                                    key={t.id}
                                    className={`bg-white border rounded-xl p-2 space-y-1 shadow-sm transition-all ${
                                      isCancelled
                                        ? 'border-red-200 bg-red-50/20 opacity-75'
                                        : 'border-slate-200'
                                    }`}
                                  >
                                    {/* Top Row: Type + Status Badge (Right) & Amount Pill (Left) */}
                                    <div className="flex items-center justify-between gap-2 pb-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <div className="flex items-center gap-1 font-black text-[11.5px] text-slate-800">
                                          <span>{isPayment ? 'دفع' : 'سحب'}</span>
                                          {isPayment ? (
                                            <ArrowUpRight className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                          ) : (
                                            <ArrowDownRight className="w-3 h-3 text-red-600 stroke-[3]" />
                                          )}
                                        </div>
                                        <span
                                          className={`text-[8.5px] font-bold px-2 pt-0.5 pb-1 rounded-full whitespace-nowrap leading-none ${
                                            isCancelled
                                              ? 'bg-red-100 text-red-700'
                                              : 'bg-[#dcfce7] text-[#15803d]'
                                          }`}
                                        >
                                          {isCancelled
                                            ? 'ملغاة (لا تدخل في الحسابات)'
                                            : 'نشطة'}
                                        </span>
                                      </div>

                                      <div
                                        className={`font-black font-mono text-[11px] px-2 pt-0.5 pb-1.5 rounded-lg shrink-0 whitespace-nowrap leading-none ${
                                          isCancelled
                                            ? 'bg-slate-100 text-slate-400 line-through'
                                            : isPayment
                                            ? 'bg-[#dcfce7] text-[#16a34a]'
                                            : 'bg-[#fee2e2] text-[#dc2626]'
                                        }`}
                                      >
                                        {isPayment
                                          ? `+${t.amount.toLocaleString()} ج.م`
                                          : `-${t.amount.toLocaleString()} ج.م`}
                                      </div>
                                    </div>

                                    {/* Bottom Row: Description (Right, wraps freely) & Date/Time (Left) */}
                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                      <div className="text-[10px] text-slate-600 font-medium leading-snug break-words flex-1 text-right">
                                        {t.description || (isPayment ? 'عملية دفع مسجلة' : 'عملية سحب مسجلة')}
                                      </div>
                                      <div className="text-[9px] text-slate-500 font-mono text-left shrink-0 whitespace-nowrap">
                                        <span>{formatArabicDate(t.date)}</span>
                                        {t.time && (
                                          <span className="text-slate-400 mr-1">
                                            • {t.time}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Group: Informative Note + Footer */}
                      <div className="space-y-2 pt-1">
                        {/* 6. Informative note matching reference image */}
                        <div className="bg-[#eff6ff]/80 border border-[#bfdbfe] rounded-xl p-2 flex items-center gap-2 text-slate-600">
                          <div className="w-4 h-4 rounded-full bg-[#1e40af] text-white flex items-center justify-center shrink-0 font-bold text-[9px] leading-none">
                            <span className="leading-none">i</span>
                          </div>
                          <div className="text-[9.5px] leading-snug text-slate-600">
                            الرصيد الموجب يعني أن المبلغ لصالح العميل، والرصيد السالب يعني أن المبلغ مستحق للمحل.
                          </div>
                        </div>

                        {/* 7. Footer with Shop Owner Logo (Right) and Project AH2 Logo + 'نظام AH2 المعتمد' (Left) */}
                        <InvoiceFooter />
                      </div>
                    </div>
                  );
                })()}

                {/* ---------------- ALL TRANSACTIONS REPORT (MOBILE PORTRAIT LAYOUT) ---------------- */}
                {data.type === 'all_transactions' && (
                  <>
                    <div className="flex items-center justify-between gap-2 border-b-2 border-amber-400/40 pb-3">
                      <ShopOwnerLogo variant="report" />
                      <div className="text-left font-mono text-[10.5px] text-slate-600 shrink-0">
                        <div className="font-black text-xs text-slate-900 font-sans">
                          سجل العمليات المالية
                        </div>
                        <div className="mt-0.5">التاريخ: {data.reportDate}</div>
                        <div className="text-[10px] text-amber-700 font-sans font-bold mt-0.5">
                          {data.periodText}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-center text-xs">
                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                        <div className="text-[10.5px] text-emerald-700 font-bold">
                          إجمالي الدفع
                        </div>
                        <div className="font-black font-mono text-emerald-800 text-sm mt-1">
                          {data.totalPayments.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl">
                        <div className="text-[10.5px] text-red-700 font-bold">
                          إجمالي السحب
                        </div>
                        <div className="font-black font-mono text-red-800 text-sm mt-1">
                          {data.totalWithdrawals.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                        <div className="text-[10.5px] text-blue-700 font-bold">
                          صافي الحركة
                        </div>
                        <div className="font-black font-mono text-blue-800 text-sm mt-1">
                          {data.netMovement.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                        <div className="text-[10.5px] text-slate-600 font-bold">
                          العمليات
                        </div>
                        <div className="font-black font-mono text-slate-800 text-sm mt-1">
                          {data.totalCount} ({data.activeCount})
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 bg-amber-50 p-2.5 rounded-xl border border-amber-200 leading-relaxed">
                      ⚠️ العمليات الملغاة موضحة بحالتها ومستبعدة تماماً من إجمالي الدفع والسحب وصافي الحركة.
                    </div>

                    <div>
                      <div className="text-xs font-black text-slate-800 mb-2">
                        سجل العمليات التفصيلي
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-[10px]">
                        <table className="w-full text-right border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold text-[9.5px]">
                            <tr>
                              <th className="py-2 px-1.5 border-b">العميل</th>
                              <th className="py-2 px-1 border-b text-center">النوع</th>
                              <th className="py-2 px-1.5 border-b">المبلغ</th>
                              <th className="py-2 px-1 border-b">التاريخ / الوقت</th>
                              <th className="py-2 px-1.5 border-b">البيان</th>
                              <th className="py-2 px-1 border-b text-center">الحالة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.transactions.map((t) => {
                              const isCancelled = t.status === 'cancelled';
                              const isPayment = t.type === 'payment';
                              return (
                                <tr
                                  key={t.id}
                                  className={
                                    isCancelled
                                      ? 'bg-red-50/40 text-slate-400 line-through'
                                      : 'hover:bg-slate-50'
                                  }
                                >
                                  <td className="py-2.5 px-1.5 font-bold text-slate-900 break-words leading-snug">
                                    {t.customer_name || 'عميل'}
                                  </td>
                                  <td className="py-2.5 px-1 font-bold text-center whitespace-nowrap">
                                    <span
                                      className={`inline-block px-2 pt-0.5 pb-1.5 rounded-md text-[8.5px] leading-none ${
                                        isPayment
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {isPayment ? 'دفع' : 'سحب'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-1.5 font-mono font-bold whitespace-nowrap text-[10px]">
                                    {t.amount.toLocaleString()} ج.م
                                  </td>
                                  <td className="py-2.5 px-1 font-mono text-[8.5px] text-slate-500 whitespace-nowrap leading-tight">
                                    <div>{t.date}</div>
                                    {t.time && (
                                      <div className="text-[8px] text-slate-400 mt-0.5">
                                        {t.time}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-1.5 text-slate-600 break-words leading-snug text-[9.5px]">
                                    {t.description || '-'}
                                  </td>
                                  <td className="py-2.5 px-1 text-[9px] text-center whitespace-nowrap font-sans">
                                    {isCancelled ? (
                                      <span className="text-red-600 font-bold no-underline">
                                        ملغاة
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 font-bold">
                                        نشطة
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-amber-300 flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-white border-2 border-amber-400 shadow-sm p-1 flex items-center justify-center shrink-0">
                          <img
                            src={logoUrl}
                            alt="لوجو متجر OM BASMA"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="text-right">
                          <span className="font-black text-xs text-slate-900 block leading-none">
                            OM BASMA
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 block leading-tight mt-0.5">
                            للستائر والمفروشات
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-500">
                        نظام AH2 المعتمد
                      </div>
                    </div>
                  </>
                )}

                {/* ---------------- REPORTS SUMMARY (MOBILE PORTRAIT LAYOUT) ---------------- */}
                {data.type === 'reports_summary' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b-2 border-amber-400/40 pb-3.5">
                      <ShopOwnerLogo variant="report" />
                      <div className="text-left font-mono text-[10.5px] text-slate-600 shrink-0">
                        <div className="font-black text-xs text-slate-900 font-sans">
                          تقرير الأداء والإحصائيات
                        </div>
                        <div className="mt-0.5">التاريخ: {data.reportDate}</div>
                        <div className="text-[10px] text-amber-700 font-sans font-bold mt-0.5">
                          {data.periodText}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-bold block">
                          إجمالي العملاء
                        </span>
                        <span className="text-lg font-black font-mono text-slate-800 mt-1.5 block">
                          {data.totalCustomers} عميل
                        </span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-bold block">
                          إجمالي العمليات
                        </span>
                        <span className="text-lg font-black font-mono text-blue-600 mt-1.5 block">
                          {data.totalTransactions} عملية
                        </span>
                      </div>
                      <div className="col-span-2 bg-emerald-50 p-4 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <span className="text-xs text-emerald-700 font-bold">
                          إجمالي الإيداعات / المدفوعات
                        </span>
                        <span className="text-lg font-black font-mono text-emerald-800">
                          {data.totalPayments.toLocaleString()} ج.م
                        </span>
                      </div>
                      <div className="col-span-2 bg-red-50 p-4 rounded-xl border border-red-200 flex items-center justify-between">
                        <span className="text-xs text-red-700 font-bold">
                          إجمالي السحوبات
                        </span>
                        <span className="text-lg font-black font-mono text-red-800">
                          {data.totalWithdrawals.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#0f233c] text-white p-4 rounded-xl border border-slate-700 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs text-slate-300 font-bold block">
                          صافي الموقف المالي المعتمد
                        </span>
                        <div className="text-xl font-black font-mono text-amber-400 mt-1">
                          {data.netBalance.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="text-[10.5px] text-amber-300 font-mono bg-white/10 px-2.5 pt-1 pb-1.5 rounded-lg shrink-0 leading-none">
                        مطابق لقاعدة البيانات
                      </div>
                    </div>

                    <div className="pt-3.5 border-t border-amber-300 flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-white border-2 border-amber-400 shadow-sm p-1 flex items-center justify-center shrink-0">
                          <img
                            src={logoUrl}
                            alt="لوجو متجر OM BASMA"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="text-right">
                          <span className="font-black text-xs text-slate-900 block leading-none">
                            OM BASMA
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 block leading-tight mt-0.5">
                            للستائر والمفروشات
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-500">
                        نظام AH2 المعتمد
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>
      </main>
    </div>
  );
};
