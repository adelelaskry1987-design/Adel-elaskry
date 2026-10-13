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
} from 'lucide-react';
import { ShopOwnerLogo } from './ShopOwnerLogo';
import { Ah2Logo } from './Ah2Logo';
import { Customer, Transaction } from '../types';
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
      const txLines = data.transactions
        .map((t, idx) => {
          const isCancelled = t.status === 'cancelled';
          const typeLabel = t.type === 'payment' ? 'دفع (+)' : 'سحب (-)';
          const statusText = isCancelled
            ? `[⚠️ ملغاة - غير محتسبة${t.cancellation_reason ? `: ${t.cancellation_reason}` : ''}]`
            : '[نشطة]';
          return `${idx + 1}) ${typeLabel} ${t.amount.toLocaleString()} ج.م
   • التاريخ: ${t.date} ${t.time}
   • التفاصيل: ${t.description || 'بدون بيان'}
   • الحالة: ${statusText}`;
        })
        .join('\n\n');

      return `📄 كشف حساب عميل
🏢 المشروع: ${data.projectName}
👤 العميل: ${data.customer.name}
📞 الهاتف: ${data.customer.phone}
📅 تاريخ الإصدار: ${data.reportDate}
⏱ الفترة المحددة: ${data.periodText}
${divider}
💰 الموقف المالي للعميل:
💎 الرصيد الحالي الكلي: ${data.currentBalance.toLocaleString()} ج.م
🔹 إجمالي الدفع خلال الفترة: ${data.periodPayments.toLocaleString()} ج.م
🔻 إجمالي السحب خلال الفترة: ${data.periodWithdrawals.toLocaleString()} ج.م
⚖️ صافي الحركة خلال الفترة: ${data.periodNetMovement.toLocaleString()} ج.م
📌 تنبيه: الرصيد الحالي الكلي يعكس حساب العميل التراكمي، بينما صافي الحركة يمثل حركة الفترة المحددة فقط.
⚠️ تنبيه: العمليات الملغاة موضحة ولا تُحتسب في الرصيد.
${divider}
📝 سجل عمليات العميل:
${txLines || 'لا توجد عمليات لهذا العميل خلال الفترة المحددة.'}
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

  // 1. WhatsApp share
  const handleWhatsAppShare = () => {
    const text = generateFormattedText();
    const encoded = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setStatusMessage('تم فتح واتساب لمشاركة التقرير');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // 2. Generate and download/share actual PDF file
  const handlePdfShare = async () => {
    if (!printableRef.current) return;
    setIsGeneratingPdf(true);
    setStatusMessage('جاري إعداد وتوليد ملف PDF...');

    try {
      // Temporarily ensure element is visible for capture
      const element = printableRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
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
          ? `كشف_حساب_${data.customer.name.replace(/\s+/g, '_')}`
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
            text: `تقرير معتمد من نظام AH2 • ${data.projectName}`,
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
          // Fallback to downloading
        }
      }

      // Download file directly
      pdf.save(fileName);
      setStatusMessage('تم تنزيل ملف PDF بنجاح على جهازك');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('PDF error:', err);
      // Fallback: window print
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

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setStatusMessage('تم نسخ التقرير كاملاً للحافظة لمشاركته في أي تطبيق');
      setTimeout(() => {
        setCopied(false);
        setStatusMessage(null);
      }, 3500);
    } catch {
      setStatusMessage('يرجى نسخ التقرير يدوياً');
    }
  };

  const handleCopyText = async () => {
    const text = generateFormattedText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setStatusMessage('تم نسخ التقرير بنجاح');
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

  const reportTitle =
    data.type === 'customer_statement'
      ? `كشف حساب: ${data.customer.name}`
      : data.type === 'all_transactions'
      ? 'تقرير كل العمليات المالية'
      : 'تقرير التقارير والإحصائيات';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="bg-[#0f233c] text-white p-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center border border-amber-400/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-amber-400">خيارات المشاركة</h2>
              <p className="text-[11px] text-slate-300">{reportTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="bg-amber-500 text-slate-950 text-xs font-bold px-4 py-2 flex items-center justify-between shadow-sm animate-in slide-in-from-top-1">
            <span>{statusMessage}</span>
            <Sparkles className="w-4 h-4 shrink-0" />
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Main 3 Sharing Options Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. WhatsApp */}
            <button
              onClick={handleWhatsAppShare}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md flex flex-col items-center justify-center text-center gap-2 group transition-all active:scale-97 border border-emerald-400/30"
            >
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-black">مشاركة على واتساب</span>
              <span className="text-[10px] text-emerald-100 opacity-90">
                تقرير نصي منسق ومفصل
              </span>
            </button>

            {/* 2. PDF */}
            <button
              onClick={handlePdfShare}
              disabled={isGeneratingPdf}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md flex flex-col items-center justify-center text-center gap-2 group transition-all active:scale-97 border border-red-500/30 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-black">
                {isGeneratingPdf ? 'جاري التحميل...' : 'مشاركة PDF'}
              </span>
              <span className="text-[10px] text-red-100 opacity-90">
                ملف PDF رسمي بهوية المحل
              </span>
            </button>

            {/* 3. Other Apps */}
            <button
              onClick={handleOtherAppsShare}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md flex flex-col items-center justify-center text-center gap-2 group transition-all active:scale-97 border border-blue-500/30"
            >
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-black">عبر التطبيقات الأخرى</span>
              <span className="text-[10px] text-blue-100 opacity-90">
                مشاركة النظام أو النسخ
              </span>
            </button>
          </div>

          {/* Quick Action Buttons: Copy Text & Print */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleCopyText}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 border border-slate-200"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-black">تم النسخ</span>
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
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 border border-slate-200"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>طباعة المستند</span>
            </button>
          </div>

          {/* Collapsible Preview Toggle */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowPreviewSheet(!showPreviewSheet)}
              className="w-full p-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                <span>معاينة مستند التقرير و PDF المعتمد</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  showPreviewSheet ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Document Sheet for Capture and Preview */}
            <div
              className={`p-3 bg-slate-100 transition-all ${
                showPreviewSheet ? 'block' : 'hidden sm:block'
              }`}
            >
              <div
                ref={printableRef}
                className="bg-white p-5 rounded-2xl border-2 border-amber-400/80 shadow-md space-y-4 text-slate-800 font-sans"
                style={{ direction: 'rtl' }}
              >
                {/* Official Header with Shop Owner Logo and AH2 emblem */}
                <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-3">
                  <ShopOwnerLogo variant="report" />
                  <div className="text-left font-mono text-[11px] text-slate-600">
                    <div className="font-bold text-slate-900 font-sans">
                      {data.type === 'customer_statement'
                        ? 'كشف حساب عميل معتمد'
                        : data.type === 'all_transactions'
                        ? 'سجل العمليات المالية'
                        : 'تقرير الأداء والإحصائيات'}
                    </div>
                    <div>التاريخ: {data.reportDate}</div>
                    <div className="text-[10px] text-amber-700 font-sans font-bold">
                      {data.periodText}
                    </div>
                  </div>
                </div>

                {/* Specific Details based on report type */}
                {data.type === 'customer_statement' && (
                  <>
                    {/* Customer Info Card */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-black text-slate-900 text-sm">
                          {data.customer.name}
                        </div>
                        <div className="text-slate-500 font-mono mt-0.5">
                          رقم الهاتف: {data.customer.phone}
                        </div>
                      </div>
                      <div className="text-left">
                        <span className="text-[10px] text-slate-500 block">
                          الرصيد الكلي الحالي
                        </span>
                        <span
                          className={`font-black font-mono text-base ${
                            data.currentBalance >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }`}
                        >
                          {data.currentBalance.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    {/* Period Movement Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                        <div className="text-[10px] text-emerald-700 font-bold">
                          إجمالي الدفع
                        </div>
                        <div className="font-black font-mono text-emerald-800 text-xs mt-0.5">
                          {data.periodPayments.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 p-2 rounded-xl">
                        <div className="text-[10px] text-red-700 font-bold">
                          إجمالي السحب
                        </div>
                        <div className="font-black font-mono text-red-800 text-xs mt-0.5">
                          {data.periodWithdrawals.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div className="bg-amber-50 border border-amber-300 p-2 rounded-xl">
                        <div className="text-[10px] text-amber-800 font-bold">
                          صافي حركة الفترة
                        </div>
                        <div className="font-black font-mono text-amber-900 text-xs mt-0.5">
                          {data.periodNetMovement.toLocaleString()} ج.م
                        </div>
                      </div>
                    </div>

                    {/* Clarification banner */}
                    <div className="text-[10px] text-slate-500 bg-blue-50/70 p-2 rounded-lg border border-blue-200">
                      ℹ️ صافي حركة الفترة ({data.periodNetMovement.toLocaleString()} ج.م) يمثل الحركة خلال الفترة المحددة، بينما الرصيد الكلي ({data.currentBalance.toLocaleString()} ج.م) يمثل إجمالي الحساب التراكمي.
                    </div>

                    {/* Table of transactions */}
                    <div>
                      <div className="text-[11px] font-black text-slate-700 mb-1.5">
                        العمليات المسجلة ({data.transactions.length})
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px]">
                        <table className="w-full text-right border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold text-[10px]">
                            <tr>
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
                                  <td className="p-2 font-bold whitespace-nowrap">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] ${
                                        isPayment
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {isPayment ? 'دفع (+)' : 'سحب (-)'}
                                    </span>
                                  </td>
                                  <td className="p-2 font-mono font-bold whitespace-nowrap">
                                    {t.amount.toLocaleString()} ج.م
                                  </td>
                                  <td className="p-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                                    {t.date} {t.time}
                                  </td>
                                  <td className="p-2 text-slate-600 max-w-[120px] truncate">
                                    {t.description || '-'}
                                  </td>
                                  <td className="p-2 text-[10px] whitespace-nowrap font-sans">
                                    {isCancelled ? (
                                      <span className="text-red-600 font-bold no-underline">
                                        ملغاة (غير محتسبة)
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
                        {data.transactions.length === 0 && (
                          <div className="p-4 text-center text-xs text-slate-400">
                            لا توجد أي عمليات في هذه الفترة
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {data.type === 'all_transactions' && (
                  <>
                    {/* Period Movement Grid */}
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

                    {/* Table of all transactions */}
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
                  </>
                )}

                {data.type === 'reports_summary' && (
                  <div className="space-y-3">
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
                  </div>
                )}

                {/* Footer with Shop Owner and AH2 certification */}
                <div className="pt-3 border-t border-amber-300 flex items-center justify-between text-[10px] text-slate-500">
                  <span>متجر OM BASMA للستائر والمفروشات</span>
                  <div className="flex items-center gap-1.5">
                    <span>نظام AH2 المعتمد</span>
                    <Ah2Logo variant="emblem" size="sm" showSubtitle={false} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {data.projectName} • {data.reportDate}
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
