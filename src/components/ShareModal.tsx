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
import shopLogoTransparentAsset from '../assets/shop_owner_logo_transparent.png';
import { ShopOwnerLogo } from './ShopOwnerLogo';
import { PageTitle } from './PageTitle';
import { Customer, Transaction } from '../types';
import { getCustomerBalanceInfo, getPeriodMovementInfo } from '../utils/balanceUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
${txLines || 'لا توجد عمليات مسجلة خلال هذه الفترة.'}`;
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

  // 1. WhatsApp share
  const handleWhatsAppShare = () => {
    const text = generateFormattedText();
    const encoded = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusMessage('تم فتح واتساب لمشاركة التقرير');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // 2. Generate and download/share actual PDF file
  const handlePdfShare = async () => {
    if (!printableRef.current) return;
    setIsGeneratingPdf(true);
    setStatusMessage('جاري إعداد وتوليد ملف PDF...');

    try {
      const element = printableRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileTitle =
        data.type === 'customer_statement'
          ? `كشف_حساب_${data.customer.name.trim().replace(/\s+/g, '_')}`
          : data.type === 'all_transactions'
          ? 'تقرير_كل_العمليات_المالية'
          : 'تقرير_الاحصائيات_المالية';

      const fileName = `${fileTitle}_${data.reportDate}.pdf`;
      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

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
          setIsGeneratingPdf(false);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setIsGeneratingPdf(false);
            return;
          }
        }
      }

      // Download file directly
      pdf.save(fileName);
      setStatusMessage('تم تنزيل ملف PDF بنجاح على جهازك');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('PDF error:', err);
      window.print();
      setStatusMessage('تم تجهيز المستند للطباعة والحفظ كـ PDF');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. Share via other apps (Web Share API with fallback to copy text)
  const handleOtherAppsShare = async () => {
    const text = generateFormattedText();
    const title =
      data.type === 'customer_statement'
        ? `كشف حساب العميل ${data.customer.name}`
        : data.type === 'all_transactions'
        ? 'تقرير كل العمليات المالية'
        : 'تقرير الموقف المالي والإحصائيات';

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
        if (err.name === 'AbortError') return;
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
    { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500', action: handleWhatsAppShare },
    { name: 'Telegram', icon: Send, color: 'bg-sky-500', action: handleTelegramShare },
    { name: 'Messenger', icon: MessageCircle, color: 'bg-blue-600', action: handleOtherAppsShare },
    { name: 'IMO', icon: MessageCircle, color: 'bg-cyan-500', action: handleOtherAppsShare },
    { name: 'Gmail', icon: Mail, color: 'bg-red-500', action: handleGmailShare },
    { name: 'الرسائل', icon: MessageCircle, color: 'bg-emerald-600', action: handleSmsShare },
    { name: 'المزيد', icon: MoreHorizontal, color: 'bg-slate-600', action: handleOtherAppsShare },
    { name: 'بلوتوث', icon: Bluetooth, color: 'bg-indigo-600', action: handleOtherAppsShare },
  ];

  const reportTitle =
    data.type === 'customer_statement'
      ? `كشف حساب: ${data.customer.name}`
      : data.type === 'all_transactions'
      ? 'تقرير كل العمليات المالية'
      : 'تقرير التقارير والإحصائيات';

  const logoUrl = shopLogoTransparentAsset || '/shop_owner_logo_transparent.png';

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
              className="w-full py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                onClick={handleCopyText}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 cursor-pointer"
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
                className={`bg-white p-5 sm:p-7 rounded-2xl shadow-lg text-slate-800 font-sans relative overflow-hidden mx-auto ${
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

                      <svg
                        className="absolute -top-5 -left-5 sm:-top-7 sm:-left-7 w-28 sm:w-36 h-28 sm:h-36 pointer-events-none"
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

                      {/* 1. Integrated OM BASMA Logo at the top */}
                      <div className="pt-2 pb-1 text-center flex flex-col items-center justify-center">
                        <img
                          src={logoUrl}
                          alt="OM BASMA للستائر والمفروشات"
                          className="h-28 sm:h-32 w-auto object-contain mx-auto drop-shadow-sm"
                          loading="eager"
                        />
                      </div>

                      {/* 2. Statement Title flanked by thin golden lines */}
                      <div className="flex items-center justify-center gap-3 sm:gap-4 my-3 sm:my-4">
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
                                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[180px] sm:max-w-[260px]">
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
                        <div className="w-6 h-6 rounded-full bg-[#1e40af] text-white flex items-center justify-center shrink-0 font-bold text-xs">
                          i
                        </div>
                        <div className="text-[11px] sm:text-xs leading-relaxed text-slate-600">
                          الرصيد الموجب يعني أن المبلغ لصالح العميل، والرصيد السالب يعني أن المبلغ مستحق للمحل.
                        </div>
                      </div>

                      {/* 7. Footer matching reference image */}
                      <div className="pt-4 border-t border-[#c59a3f]/70 text-center space-y-1.5">
                        <div className="flex items-center justify-center">
                          <img
                            src={logoUrl}
                            alt="OM BASMA للستائر والمفروشات"
                            className="h-10 sm:h-12 w-auto object-contain mx-auto"
                          />
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          نظام AH2 المعتمد
                        </div>
                      </div>
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

                    <div className="pt-3 border-t border-amber-300 flex items-center justify-between text-[10px] text-slate-500">
                      <span>متجر OM BASMA للستائر والمفروشات</span>
                      <div className="flex items-center gap-1.5">
                        <span>نظام AH2 المعتمد</span>
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

                    <div className="pt-3 border-t border-amber-300 flex items-center justify-between text-[10px] text-slate-500">
                      <span>متجر OM BASMA للستائر والمفروشات</span>
                      <div className="flex items-center gap-1.5">
                        <span>نظام AH2 المعتمد</span>
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
