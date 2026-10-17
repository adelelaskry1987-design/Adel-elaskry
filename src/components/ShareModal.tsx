import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import shopLogoEmblemAsset from '../assets/shop_owner_logo_emblem.png';
import { ShopOwnerLogo } from './ShopOwnerLogo';
import { InvoiceFooter } from './InvoiceFooter';
import { PageTitle } from './PageTitle';
import { Customer, Transaction } from '../types';
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
      const isCornerWave = node.getAttribute('viewBox') === '0 0 160 160';
      const isRightWave =
        isCornerWave &&
        (node.classList.contains('-right-5') || node.classList.contains('sm:-right-7'));
      const isLeftWave =
        isCornerWave &&
        (node.classList.contains('-left-5') || node.classList.contains('sm:-left-7'));

      node.querySelectorAll('*').forEach((child) => {
        child.removeAttribute('style');
      });

      if (isCornerWave) {
        node.style.cssText = `position:absolute !important;top:-28px !important;${
          isRightWave ? 'right:-28px !important;left:auto !important;' : ''
        }${
          isLeftWave ? 'left:-28px !important;right:auto !important;' : ''
        }width:96px !important;height:96px !important;display:block !important;pointer-events:none !important;overflow:visible !important;`;
      } else {
        const iconSize =
          node.classList.contains('w-5') || node.classList.contains('sm:w-5')
            ? '18px'
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

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, data }) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Generate plain Arabic text suitable for WhatsApp / text sharing
  const generateFormattedText = (): string => {
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
      // Clean, concise WhatsApp statement per requirement 6
      const txLines = data.transactions
        .map((t, idx) => {
          const isCancelled = t.status === 'cancelled';
          const typeLabel = t.type === 'payment' ? 'دفع (+)' : 'سحب (-)';
          const statusSuffix = isCancelled ? ' [ملغاة]' : '';
          const desc = t.description ? ` - ${t.description}` : '';
          return `${idx + 1}. ${typeLabel} ${t.amount.toLocaleString()} ج.م (${t.date} ${t.time})${desc}${statusSuffix}`;
        })
        .join('\n');

      const balInfo = getCustomerBalanceInfo(data.currentBalance);
      let balanceDisplayLine = '';
      if (balInfo.state === 'positive') {
        balanceDisplayLine = `🟢 الرصيد الحالي: ${balInfo.formattedAmount} (رصيد لصالح العميل)`;
      } else if (balInfo.state === 'negative') {
        balanceDisplayLine = `🔴 الرصيد الحالي: ${balInfo.formattedAmount} (مبلغ مستحق للمحل)`;
      } else {
        balanceDisplayLine = `⚪ الرصيد الحالي: 0 ج.م (الحساب متعادل)`;
      }
      const periodMovementInfo = getPeriodMovementInfo(data.periodNetMovement);

      return `📄 كشف حساب عميل
🏢 المشروع: ${data.projectName}
👤 العميل: ${data.customer.name}
📞 الهاتف: ${data.customer.phone}
📅 تاريخ الإصدار: ${formatArabicDate(data.reportDate)}
${data.periodText && data.periodText !== 'كافة العمليات المسجلة للعميل' ? `⏱ الفترة: ${data.periodText}\n` : ''}${divider}
💼 الموقف المالي للعميل:
${balanceDisplayLine}
⬆️ إجمالي الدفع: ${data.periodPayments.toLocaleString()} ج.م
⬇️ إجمالي السحب: ${data.periodWithdrawals.toLocaleString()} ج.م
⚖️ صافي حركة الفترة: ${periodMovementInfo.text}
${divider}
📑 العمليات:
${txLines || 'لا توجد عمليات مسجلة خلال هذه الفترة.'}
${divider}
متجر OM BASMA للستائر والمفروشات • نظام AH2 المعتمد`;
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

  // Core helper: generate the actual PDF document, Blob, and File from printableRef
  const generatePdfFile = async () => {
    if (!printableRef.current) {
      throw new Error('لم يتم العثور على قالب الفاتورة');
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

    const targetWidth = data.type === 'customer_statement' ? 680 : 720;
    const renderScale = 2;
    const blockBoundsPx: Array<{ top: number; bottom: number }> = [];

    const canvas = await html2canvas(element, {
      scale: renderScale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: targetWidth,
      windowWidth: targetWidth + 48,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: (clonedDoc, clonedEl) => {
        // Force light theme on the cloned document so exported PDFs are never affected by Dark Mode
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
        clonedEl.style.maxHeight = 'none';
        clonedEl.style.opacity = '1';
        clonedEl.style.visibility = 'visible';
        clonedEl.style.transform = 'none';
        clonedEl.style.overflow = 'hidden';
        clonedEl.style.boxShadow = 'none';
        clonedEl.style.borderRadius = '16px';
        clonedEl.style.backgroundColor = '#ffffff';
        clonedEl.style.direction = 'rtl';

        sanitizeClonedDocumentColors(clonedDoc, clonedEl);

        // Record atomic block boundaries (cards, transaction items, footer) in canvas pixels for clean multi-page breaks
        const rootRect = clonedEl.getBoundingClientRect();
        const atomicBlocks = clonedEl.querySelectorAll<HTMLElement>(
          '.rounded-2xl, [dir="rtl"]'
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

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginMm = 8;
    const printableWidthMm = pageWidthMm - marginMm * 2;
    const printableHeightMm = pageHeightMm - marginMm * 2;

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
            marginMm,
            marginMm,
            printableWidthMm,
            sliceHeightMm
          );
        }

        currentY = nextBreakY;
        pageIndex++;
      }
    }

    const fileTitle =
      data.type === 'customer_statement'
        ? `كشف_حساب_${data.customer.name.trim().replace(/\s+/g, '_')}`
        : data.type === 'all_transactions'
        ? 'تقرير_كل_العمليات_المالية'
        : 'تقرير_الاحصائيات_المالية';

    const fileName = `${fileTitle}_${data.reportDate}.pdf`;
    const pdfBlob = pdf.output('blob');
    if (!pdfBlob || pdfBlob.size === 0) {
      throw new Error('تعذر إنشاء ملف PDF صالح');
    }
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    return { pdf, pdfBlob, pdfFile, fileName, fileTitle };
  };

  // 1. WhatsApp share (attaches actual PDF file when Web Share API file sharing is available)
  const handleWhatsAppShare = async () => {
    setIsGeneratingPdf(true);
    setStatusMessage('جاري تجهيز ملف الـ PDF للمشاركة عبر واتساب...');

    try {
      const { pdf, pdfFile, fileTitle, fileName } = await generatePdfFile();
      const text = generateFormattedText();

      if (
        navigator.canShare &&
        navigator.canShare({ files: [pdfFile] }) &&
        navigator.share
      ) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: fileTitle,
            text,
          });
          setStatusMessage('تمت مشاركة ملف PDF عبر واتساب بنجاح');
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setStatusMessage(null);
            return;
          }
        }
      }

      // Desktop / fallback: save the actual PDF file and open WhatsApp chat
      pdf.save(fileName);
      const encoded = encodeURIComponent(text);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage('تم تنزيل ملف PDF الفعلي وفتح واتساب لإرفاقه');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('WhatsApp PDF error:', err);
      const text = generateFormattedText();
      const encoded = encodeURIComponent(text);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      setStatusMessage('تم فتح واتساب لمشاركة التقرير');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2. Generate and share/download actual PDF file
  const handlePdfShare = async () => {
    if (!printableRef.current) return;
    setIsGeneratingPdf(true);
    setStatusMessage('جاري إعداد وتوليد ملف PDF...');

    try {
      const { pdf, pdfFile, fileName, fileTitle } = await generatePdfFile();

      // Check if Web Share API supports file sharing
      if (
        navigator.canShare &&
        navigator.canShare({ files: [pdfFile] }) &&
        navigator.share
      ) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: fileTitle,
            text: `كشف حساب معتمد • ${data.projectName}`,
          });
          setStatusMessage('تمت مشاركة ملف PDF بنجاح');
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setStatusMessage(null);
            return;
          }
        }
      }

      // Download file directly
      pdf.save(fileName);
      setStatusMessage('تم حفظ وتنزيل ملف PDF بنجاح على جهازك');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('PDF error:', err);
      setStatusMessage('تعذر إنشاء ملف PDF، جاري فتح نافذة الطباعة...');
      setTimeout(() => setStatusMessage(null), 3000);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2b. Save/Download PDF directly to device
  const handleDownloadPdf = async () => {
    if (!printableRef.current) return;
    setIsGeneratingPdf(true);
    setStatusMessage('جاري إنشاء وحفظ ملف PDF...');

    try {
      const { pdf, fileName } = await generatePdfFile();
      pdf.save(fileName);
      setStatusMessage('تم حفظ ملف PDF بنجاح على جهازك');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('PDF save error:', err);
      setStatusMessage('تعذر حفظ ملف PDF');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2c. Open generated PDF file in viewer/new tab
  const handleOpenPdf = async () => {
    if (!printableRef.current) return;
    setIsGeneratingPdf(true);
    setStatusMessage('جاري تجهيز وفتح ملف PDF...');

    try {
      const { pdfBlob, fileName } = await generatePdfFile();
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
      setStatusMessage('تم فتح ملف PDF بنجاح');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('PDF open error:', err);
      setStatusMessage('تعذر فتح ملف PDF');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. Share via other apps (Web Share API with actual PDF file or fallback to text)
  const handleOtherAppsShare = async () => {
    const text = generateFormattedText();
    const title =
      data.type === 'customer_statement'
        ? `كشف حساب العميل ${data.customer.name}`
        : data.type === 'all_transactions'
        ? 'تقرير كل العمليات المالية'
        : 'تقرير الموقف المالي والإحصائيات';

    if (printableRef.current && navigator.share) {
      setIsGeneratingPdf(true);
      setStatusMessage('جاري تجهيز ملف PDF للمشاركة...');
      try {
        const { pdfFile } = await generatePdfFile();
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title,
            text,
          });
          setStatusMessage('تمت مشاركة ملف PDF بنجاح');
          setTimeout(() => setStatusMessage(null), 3000);
          setIsGeneratingPdf(false);
          return;
        }
      } catch (err: any) {
        setIsGeneratingPdf(false);
        if (err.name === 'AbortError') {
          setStatusMessage(null);
          return;
        }
      }
      setIsGeneratingPdf(false);
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
        });
        setStatusMessage('تمت المشاركة بنجاح');
        setTimeout(() => setStatusMessage(null), 3000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setStatusMessage(null);
          return;
        }
      }
    }

    handleCopyText();
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateFormattedText());
      setCopied(true);
      setStatusMessage('تم نسخ نص التقرير إلى الحافظة');
      setTimeout(() => {
        setCopied(false);
        setStatusMessage(null);
      }, 2500);
    } catch {
      setStatusMessage('تعذر النسخ التلقائي');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Telegram share
  const handleTelegramShare = () => {
    const text = generateFormattedText();
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setStatusMessage('تم فتح تيليجرام للمشاركة');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Gmail share
  const handleGmailShare = () => {
    const text = generateFormattedText();
    const subject =
      data.type === 'customer_statement'
        ? `كشف حساب العميل: ${data.customer.name}`
        : data.type === 'all_transactions'
        ? 'تقرير كل العمليات المالية'
        : 'تقرير التقارير والإحصائيات';
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  // SMS share
  const handleSmsShare = () => {
    const text = generateFormattedText();
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
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
    <div className="fixed inset-0 z-50 bg-slate-100 overflow-y-auto p-4 select-none animate-in fade-in duration-150">
      <div className="max-w-md mx-auto space-y-4 pb-24">
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
              onClick={handlePdfShare}
              disabled={isGeneratingPdf}
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
                disabled={isGeneratingPdf}
                className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-amber-300 cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-700" />
                <span>حفظ ملف PDF</span>
              </button>

              <button
                onClick={handleOpenPdf}
                disabled={isGeneratingPdf}
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
              ? 'p-2 sm:p-4 bg-slate-200/90 rounded-2xl overflow-x-auto shadow-inner block'
              : 'fixed -left-[99999px] top-0 opacity-0 pointer-events-none'
          }`}
        >
              <div
                ref={printableRef}
                className={`printable-invoice-sheet bg-white p-5 sm:p-7 rounded-2xl shadow-lg text-slate-800 font-sans relative overflow-hidden mx-auto ${
                  data.type === 'customer_statement'
                    ? 'max-w-[680px] min-w-[540px] sm:min-w-[620px] border border-slate-200/80 space-y-4'
                    : 'max-w-2xl border-2 border-amber-400/80 space-y-4'
                }`}
                style={{ direction: 'rtl' }}
              >
                {/* ---------------- CUSTOMER STATEMENT MATCHING REFERENCE DESIGN ---------------- */}
                {data.type === 'customer_statement' && (() => {
                  const bal = getCustomerBalanceInfo(data.currentBalance);

                  return (
                    <div className="space-y-4 relative">
                      {/* Decorative Top Corner Waves matching reference image */}
                      <svg
                        className="absolute -top-5 -right-5 sm:-top-7 sm:-right-7 w-28 sm:w-36 h-28 sm:h-36 pointer-events-none"
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
                        className="absolute -top-5 -left-5 sm:-top-7 sm:-left-7 w-28 sm:w-36 h-28 sm:h-36 pointer-events-none"
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
                      <div className="flex items-center justify-center gap-3 sm:gap-4 pt-3 sm:pt-4 my-2 sm:my-3">
                        <div className="flex-1 h-[2px] bg-[#c59a3f]"></div>
                        <h1 className="text-2xl sm:text-3xl font-black text-[#0f233c] tracking-tight whitespace-nowrap font-sans">
                          كشف حساب
                        </h1>
                        <div className="flex-1 h-[2px] bg-[#c59a3f]"></div>
                      </div>

                      {/* 3. Project and Customer Information Card */}
                      <div className="bg-[#f8fafd] border border-[#e2e8f0] rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 sm:space-y-2.5">
                        {/* Project Name */}
                        <div className="flex items-center justify-between py-1 border-b border-slate-100">
                          <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm font-medium">
                            <Building2 className="w-4 h-4 text-[#1e3a5f]" />
                            <span>اسم المشروع</span>
                          </div>
                          <div className="font-black text-sm sm:text-base text-[#0f233c]">
                            {data.projectName}
                          </div>
                        </div>

                        {/* Customer Name */}
                        <div className="flex items-center justify-between py-1 border-b border-slate-100">
                          <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm font-medium">
                            <User className="w-4 h-4 text-[#1e3a5f]" />
                            <span>العميل</span>
                          </div>
                          <div className="font-black text-sm sm:text-base text-[#0f233c]">
                            {data.customer.name}
                          </div>
                        </div>

                        {/* Customer Phone */}
                        <div className="flex items-center justify-between py-1 border-b border-slate-100">
                          <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm font-medium">
                            <Phone className="w-4 h-4 text-[#1e3a5f]" />
                            <span>رقم الهاتف</span>
                          </div>
                          <div className="font-bold text-sm sm:text-base font-mono text-[#0f233c] dir-ltr">
                            {data.customer.phone}
                          </div>
                        </div>

                        {/* Report Date */}
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm font-medium">
                            <Calendar className="w-4 h-4 text-[#1e3a5f]" />
                            <span>تاريخ الإصدار</span>
                          </div>
                          <div className="font-bold text-sm sm:text-base text-[#0f233c]">
                            {formatArabicDate(data.reportDate)}
                          </div>
                        </div>

                        {/* Covered Period (if non-default) */}
                        {data.periodText && data.periodText !== 'كافة العمليات المسجلة للعميل' && (
                          <div className="flex items-center justify-between py-1 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-slate-500 text-xs sm:text-sm font-medium">
                              <Clock className="w-4 h-4 text-[#1e3a5f]" />
                              <span>الفترة المغطاة</span>
                            </div>
                            <div className="font-bold text-xs sm:text-sm text-[#0f233c]">
                              {data.periodText}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4. Financial Status Card */}
                      <div className="bg-[#f8fafd] border border-[#e2e8f0] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 text-sm sm:text-base font-black text-[#0f233c]">
                          <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-[#1e3a5f]" />
                          <span>الموقف المالي للعميل</span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-1">
                          {/* Right Box (Current Balance Display) */}
                          <div className="flex flex-col items-center justify-center shrink-0 min-w-[140px] sm:min-w-[170px]">
                            <div
                              className={`w-full p-4 rounded-2xl shadow-sm text-center text-white ${
                                bal.state === 'positive'
                                  ? 'bg-[#00875a]'
                                  : bal.state === 'negative'
                                  ? 'bg-[#dc2626]'
                                  : 'bg-slate-600'
                              }`}
                            >
                              <span className="text-xs font-bold opacity-90 block mb-1">
                                الرصيد الحالي
                              </span>
                              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums">
                                {bal.formattedAmount}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-center gap-1.5 font-bold text-xs">
                              {bal.state === 'positive' ? (
                                <span className="text-[#00875a] flex items-center gap-1">
                                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                                  <span>رصيد لصالح العميل</span>
                                </span>
                              ) : bal.state === 'negative' ? (
                                <span className="text-red-600 flex items-center gap-1">
                                  <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                                  <span>مبلغ مستحق للمحل</span>
                                </span>
                              ) : (
                                <span className="text-slate-600 flex items-center gap-1">
                                  <Scale className="w-4 h-4" />
                                  <span>الحساب متعادل</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Vertical Divider */}
                          <div className="hidden sm:block w-[1px] bg-slate-200 self-stretch my-1"></div>

                          {/* Breakdown list */}
                          <div className="flex-1 space-y-2.5 text-xs sm:text-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <ArrowUpRight className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                                <span>إجمالي الدفع خلال الفترة</span>
                              </div>
                              <div className="font-black font-mono text-slate-800">
                                {data.periodPayments.toLocaleString()} ج.م
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <ArrowDownRight className="w-4 h-4 text-red-600 stroke-[2.5]" />
                                <span>إجمالي السحب خلال الفترة</span>
                              </div>
                              <div className="font-black font-mono text-slate-800">
                                {data.periodWithdrawals.toLocaleString()} ج.م
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                              <div className="flex items-center gap-2 text-slate-700 font-bold">
                                <Scale className="w-4 h-4 text-[#00875a]" />
                                <span>صافي حركة الفترة</span>
                              </div>
                              <div
                                className={`font-black font-mono ${
                                  data.periodNetMovement > 0
                                    ? 'text-[#00875a]'
                                    : data.periodNetMovement < 0
                                    ? 'text-red-600'
                                    : 'text-slate-600'
                                }`}
                              >
                                {data.periodNetMovement > 0
                                  ? `+${data.periodNetMovement.toLocaleString()} ج.م`
                                  : data.periodNetMovement < 0
                                  ? `-${Math.abs(data.periodNetMovement).toLocaleString()} ج.م`
                                  : '0 ج.م'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 5. Customer Transactions List */}
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-sm sm:text-base font-black text-[#0f233c]">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[#1e3a5f]" />
                          <span>عمليات العميل</span>
                        </div>

                        {data.transactions.length === 0 ? (
                          <div className="bg-[#f8fafd] border border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs">
                            لا توجد عمليات مسجلة لهذا العميل خلال الفترة المحددة.
                          </div>
                        ) : (
                          data.transactions.map((t) => {
                            const isCancelled = t.status === 'cancelled';
                            const isPayment = t.type === 'payment';
                            return (
                              <div
                                key={t.id}
                                className={`bg-white border rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-2.5 sm:gap-3 shadow-sm transition-all ${
                                  isCancelled
                                    ? 'border-red-200 bg-red-50/20 opacity-75'
                                    : 'border-slate-200'
                                }`}
                              >
                                {/* Left: Amount Pill */}
                                <div
                                  className={`font-black font-mono text-xs sm:text-sm px-3 py-1.5 rounded-xl shrink-0 ${
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

                                {/* Center: Type with arrow and description */}
                                <div className="flex-1 text-center sm:text-right">
                                  <div className="flex items-center justify-center sm:justify-start gap-1 font-black text-xs sm:text-sm text-slate-800">
                                    <span>{isPayment ? 'دفع' : 'سحب'}</span>
                                    {isPayment ? (
                                      <ArrowUpRight className="w-4 h-4 text-emerald-600 stroke-[3]" />
                                    ) : (
                                      <ArrowDownRight className="w-4 h-4 text-red-600 stroke-[3]" />
                                    )}
                                  </div>
                                  {t.description && (
                                    <div className="text-[11px] text-slate-500 mt-0.5 break-words leading-relaxed max-w-[180px] sm:max-w-[260px]">
                                      {t.description}
                                    </div>
                                  )}
                                </div>

                                {/* Right: Date, Time & Status badge */}
                                <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-left sm:text-right">
                                  <div className="text-[10px] sm:text-[11px] text-slate-500 font-mono text-left">
                                    <div>{formatArabicDate(t.date)}</div>
                                    <div className="text-slate-400">{t.time}</div>
                                  </div>
                                  <span
                                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                                      isCancelled
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-[#dcfce7] text-[#15803d]'
                                    }`}
                                  >
                                    {isCancelled ? 'ملغاة' : 'نشطة'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 6. Informative note matching reference image */}
                      <div className="bg-[#eff6ff]/80 border border-[#bfdbfe] rounded-2xl p-3 flex items-center gap-3 text-xs text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-[#1e40af] text-white flex items-center justify-center shrink-0 font-bold text-xs leading-none">
                          <span className="leading-none">i</span>
                        </div>
                        <div className="text-[11px] sm:text-xs leading-relaxed text-slate-600">
                          الرصيد الموجب يعني أن المبلغ لصالح العميل، والرصيد السالب يعني أن المبلغ مستحق للمحل.
                        </div>
                      </div>

                      {/* 7. Footer with Shop Owner Identity (InvoiceFooter Component) */}
                      <InvoiceFooter className="mt-4" />
                    </div>
                  );
                })()}

                {/* ---------------- ALL TRANSACTIONS REPORT (PRESERVED) ---------------- */}
                {data.type === 'all_transactions' && (
                  <>
                    <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-3">
                      <ShopOwnerLogo variant="report" />
                      <div className="text-left font-mono text-[11px] text-slate-600">
                        <div className="font-bold text-slate-900 font-sans">
                          سجل العمليات المالية
                        </div>
                        <div>التاريخ: {data.reportDate}</div>
                        <div className="text-[10px] text-amber-700 font-sans font-bold">
                          {data.periodText}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                        <div className="text-[10px] text-emerald-700 font-bold">
                          إجمالي الدفع
                        </div>
                        <div className="font-black font-mono text-emerald-800 text-xs mt-0.5">
                          {data.totalPayments.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 p-2 rounded-xl">
                        <div className="text-[10px] text-red-700 font-bold">
                          إجمالي السحب
                        </div>
                        <div className="font-black font-mono text-red-800 text-xs mt-0.5">
                          {data.totalWithdrawals.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-2 rounded-xl">
                        <div className="text-[10px] text-blue-700 font-bold">
                          صافي الحركة
                        </div>
                        <div className="font-black font-mono text-blue-800 text-xs mt-0.5">
                          {data.netMovement.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl">
                        <div className="text-[10px] text-slate-600 font-bold">
                          العمليات
                        </div>
                        <div className="font-black font-mono text-slate-800 text-xs mt-0.5">
                          {data.totalCount} ({data.activeCount})
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      ⚠️ العمليات الملغاة موضحة بحالتها ومستبعدة تماماً من إجمالي الدفع والسحب وصافي الحركة.
                    </div>

                    <div>
                      <div className="text-[11px] font-black text-slate-700 mb-1.5">
                        سجل العمليات التفصيلي
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-[10px]">
                        <table className="w-full text-right border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold text-[9px]">
                            <tr>
                              <th className="p-2 border-b">العميل</th>
                              <th className="p-2 border-b">النوع</th>
                              <th className="p-2 border-b">المبلغ</th>
                              <th className="p-2 border-b">التاريخ / الوقت</th>
                              <th className="p-2 border-b">البيان</th>
                              <th className="p-2 border-b">الحالة</th>
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
                                  <td className="p-2 font-bold text-slate-900 whitespace-nowrap">
                                    {t.customer_name || 'عميل'}
                                  </td>
                                  <td className="p-2 font-bold whitespace-nowrap">
                                    <span
                                      className={`px-1 py-0.5 rounded text-[8px] ${
                                        isPayment
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {isPayment ? 'دفع' : 'سحب'}
                                    </span>
                                  </td>
                                  <td className="p-2 font-mono font-bold whitespace-nowrap">
                                    {t.amount.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 font-mono text-[9px] text-slate-500 whitespace-nowrap">
                                    {t.date} {t.time}
                                  </td>
                                  <td className="p-2 text-slate-600 max-w-[100px] truncate">
                                    {t.description || '-'}
                                  </td>
                                  <td className="p-2 text-[9px] whitespace-nowrap font-sans">
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

                {/* ---------------- REPORTS SUMMARY (PRESERVED) ---------------- */}
                {data.type === 'reports_summary' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-3">
                      <ShopOwnerLogo variant="report" />
                      <div className="text-left font-mono text-[11px] text-slate-600">
                        <div className="font-bold text-slate-900 font-sans">
                          تقرير الأداء والإحصائيات
                        </div>
                        <div>التاريخ: {data.reportDate}</div>
                        <div className="text-[10px] text-amber-700 font-sans font-bold">
                          {data.periodText}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold block">
                          إجمالي العملاء
                        </span>
                        <span className="text-base font-black font-mono text-slate-800">
                          {data.totalCustomers} عميل
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold block">
                          إجمالي العمليات
                        </span>
                        <span className="text-base font-black font-mono text-blue-600">
                          {data.totalTransactions} عملية
                        </span>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 font-bold block">
                          إجمالي الإيداعات / المدفوعات
                        </span>
                        <span className="text-base font-black font-mono text-emerald-800">
                          {data.totalPayments.toLocaleString()} ج.م
                        </span>
                      </div>
                      <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                        <span className="text-[10px] text-red-700 font-bold block">
                          إجمالي السحوبات
                        </span>
                        <span className="text-base font-black font-mono text-red-800">
                          {data.totalWithdrawals.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#0f233c] text-white p-3.5 rounded-xl border border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-300 font-bold">
                          صافي الموقف المالي المعتمد
                        </span>
                        <div className="text-xl font-black font-mono text-amber-400 mt-0.5">
                          {data.netBalance.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="text-[11px] text-amber-300 font-mono bg-white/10 px-2.5 py-1 rounded-lg">
                        مطابق لقاعدة البيانات
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
                  </div>
                )}
              </div>
            </div>
      </div>
    </div>
  );
};
