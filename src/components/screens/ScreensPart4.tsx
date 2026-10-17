import React, { useState, useEffect } from 'react';
import { BackupItem, ScreenId } from '../../types';
import { api } from '../../services/api';
import { PageTitle } from '../PageTitle';
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Database,
  Lock,
  FileText,
  Trash2,
  RefreshCw,
  FolderDown,
  CheckSquare,
  Square,
  HardDrive,
} from 'lucide-react';

// ================= SCREEN 22: BACKUP RESTORE =================
export const Screen22BackupRestore: React.FC<{
  onNavigate: (s: ScreenId) => void;
  onRestored: () => void;
}> = ({ onNavigate, onRestored }) => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupItem | null>(null);
  const [projectPassword, setProjectPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = async () => {
    try {
      const res = await api.getBackups();
      setBackups(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleRestore = async () => {
    if (!selectedBackup) return;
    if (!projectPassword) {
      setError('يرجى إدخال كلمة مرور المشروع لتأكيد الاستعادة');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.restoreBackup(selectedBackup.id, projectPassword);
      setSelectedBackup(null);
      setProjectPassword('');
      onRestored();
      onNavigate('screen-5-home');
    } catch (err: any) {
      setError(err.message || 'فشلت الاستعادة، تحقق من كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="استعادة النسخة الاحتياطية" />

      <div className="space-y-2">
        {backups.map((b) => (
          <div
            key={b.id}
            className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-800">{b.filename}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {b.created_at.split('T')[0]} • {(b.file_size / 1024).toFixed(1)} ك.ب
              </div>
            </div>

            <button
              onClick={() => setSelectedBackup(b)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              استعادة
            </button>
          </div>
        ))}

        {backups.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2">
            <HardDrive className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs">لا توجد نسخ احتياطية مسجلة بعد</p>
            <button
              onClick={() => onNavigate('screen-21-backup-create')}
              className="mt-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl"
            >
              إنشاء نسخة احتياطية الآن
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2 text-red-600 font-black text-sm mb-2">
              <AlertTriangle className="w-5 h-5" />
              تأكيد استعادة النسخة الاحتياطية
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              تحذير: سيتم استبدال البيانات الحالية بالبيانات الموجودة في ملف النسخة{' '}
              <span className="font-bold font-mono">{selectedBackup.filename}</span>.
            </p>

            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                أدخل كلمة مرور المشروع للتأكيد *
              </label>
              <input
                type="password"
                value={projectPassword}
                onChange={(e) => setProjectPassword(e.target.value)}
                placeholder="كلمة مرور المشروع"
                className="w-full p-2 border rounded-xl text-xs"
              />
            </div>

            {error && <p className="text-xs text-red-600 font-bold mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleRestore}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
              >
                {loading ? 'جاري الاستعادة...' : 'تأكيد الاستعادة'}
              </button>
              <button
                onClick={() => {
                  setSelectedBackup(null);
                  setError(null);
                }}
                className="py-2 px-4 rounded-xl theme-btn-secondary font-bold text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= SCREEN 23: RESET DATA SUCCESS =================
export const Screen23ResetDataSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم إعادة تعيين البيانات بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <button
        onClick={() => onNavigate('screen-5-home')}
        className="w-full max-w-xs py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
      >
        العودة إلى الرئيسية
      </button>
    </div>
  );
};

// ================= SCREEN 24: RESET DATA =================
export const Screen24ResetData: React.FC<{
  onNavigate: (s: ScreenId) => void;
  onDataReset: () => void;
}> = ({ onNavigate, onDataReset }) => {
  const [projectPassword, setProjectPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!projectPassword) {
      setError('أدخل كلمة مرور المشروع للتأكيد');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.resetData(projectPassword);
      onDataReset();
      onNavigate('screen-23-reset-data-success');
    } catch (err: any) {
      setError(err.message || 'كلمة مرور المشروع غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="إعادة تعيين البيانات" />

      <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-500 text-red-600 mx-auto flex items-center justify-center">
          <Trash2 className="w-8 h-8" />
        </div>

        <h3 className="font-black text-sm text-red-800">تنبيه خطر ومهم للغاية</h3>
        <p className="text-xs text-red-700 leading-relaxed">
          سيتم حذف جميع بيانات العملاء، العمليات، الحسابات، والإشعارات نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذه الخطوة أبداً.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          أدخل كلمة مرور المشروع للتأكيد *
        </label>
        <div className="relative">
          <input
            type="password"
            value={projectPassword}
            onChange={(e) => setProjectPassword(e.target.value)}
            placeholder="كلمة مرور المشروع"
            className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
          <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
      </div>

      <div className="space-y-2 pt-2">
        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
        >
          {loading ? 'جاري إعادة التعيين...' : 'تأكيد إعادة التعيين الآن'}
        </button>
        <button
          onClick={() => onNavigate('screen-34-data-management')}
          className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};

// ================= SCREEN 25: DATA IMPORT =================
export const Screen25DataImport: React.FC<{
  onNavigate: (s: ScreenId) => void;
  onImportComplete: (counts: { customers: number; transactions: number }) => void;
}> = ({ onNavigate, onImportComplete }) => {
  const [fileContent, setFileContent] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setFileContent(parsed);
      } catch {
        setError('الملف المختار ليس ملف JSON صالح');
        setFileContent(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileContent) {
      setError('يرجى اختيار ملف صالح أولاً');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.importData(fileContent);
      onImportComplete({
        customers: res.customersCount || 0,
        transactions: res.transactionsCount || 0,
      });
      onNavigate('screen-26-data-import-success');
    } catch (err: any) {
      setError(err.message || 'فشل استيراد البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="استيراد البيانات" />

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-center space-y-4">
        {/* Upload Box */}
        <label className="border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-blue-50/50 transition-colors">
          <Upload className="w-10 h-10 text-blue-600 mb-2" />
          <span className="text-xs font-bold text-slate-800">
            اضغط لاختيار ملف النسخة الاحتياطية
          </span>
          <span className="text-[10px] text-slate-500 mt-1">
            صيغة مدعومة: .json
          </span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {fileName && (
          <div className="bg-slate-50 p-3 rounded-xl border text-xs text-slate-700 flex justify-between items-center">
            <span className="font-mono truncate max-w-[200px]">{fileName}</span>
            <span className="font-mono text-slate-500">{(fileSize / 1024).toFixed(1)} ك.ب</span>
          </div>
        )}

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        <div className="space-y-2 pt-2">
          <button
            onClick={handleImport}
            disabled={!fileContent || loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري الاستيراد...' : 'متابعة واستيراد البيانات'}
          </button>
          <button
            onClick={() => onNavigate('screen-34-data-management')}
            className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

// ================= SCREEN 26: DATA IMPORT SUCCESS =================
export const Screen26DataImportSuccess: React.FC<{
  onNavigate: (s: ScreenId) => void;
  importCounts?: { customers: number; transactions: number };
}> = ({ onNavigate, importCounts }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم استيراد البيانات بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      {importCounts && (
        <div className="bg-slate-50 p-3 rounded-xl border mb-6 text-xs text-slate-700 w-full max-w-xs space-y-1">
          <div className="flex justify-between">
            <span>العملاء المستوردون:</span>
            <span className="font-bold font-mono text-emerald-700">{importCounts.customers}</span>
          </div>
          <div className="flex justify-between">
            <span>العمليات المستوردة:</span>
            <span className="font-bold font-mono text-emerald-700">{importCounts.transactions}</span>
          </div>
        </div>
      )}

      <button
        onClick={() => onNavigate('screen-5-home')}
        className="w-full max-w-xs py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
      >
        العودة إلى الرئيسية
      </button>
    </div>
  );
};

// ================= SCREEN 27: DATA EXPORT =================
export const Screen27DataExport: React.FC<{
  onNavigate: (s: ScreenId) => void;
  onExportDone: (data: any) => void;
}> = ({ onNavigate, onExportDone }) => {
  const [includeCustomers, setIncludeCustomers] = useState(true);
  const [includeTransactions, setIncludeTransactions] = useState(true);
  const [includeReports, setIncludeReports] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setExportError(null);
    try {
      const data = await api.exportData({
        includeCustomers,
        includeTransactions,
        includeReports,
      });
      onExportDone(data);
      onNavigate('screen-28-data-export-success');
    } catch (err: any) {
      setExportError(err.message || 'حدث خطأ أثناء تصدير البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="تصدير البيانات" />

      {exportError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
          {exportError}
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Checkboxes */}
        <div
          onClick={() => setIncludeCustomers(!includeCustomers)}
          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer"
        >
          <span className="text-xs font-bold text-slate-800">بيانات العملاء والأرصدة</span>
          {includeCustomers ? (
            <CheckSquare className="w-5 h-5 text-blue-600" />
          ) : (
            <Square className="w-5 h-5 text-slate-400" />
          )}
        </div>

        <div
          onClick={() => setIncludeTransactions(!includeTransactions)}
          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer"
        >
          <span className="text-xs font-bold text-slate-800">بيانات العمليات المالية</span>
          {includeTransactions ? (
            <CheckSquare className="w-5 h-5 text-blue-600" />
          ) : (
            <Square className="w-5 h-5 text-slate-400" />
          )}
        </div>

        <div
          onClick={() => setIncludeReports(!includeReports)}
          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer"
        >
          <span className="text-xs font-bold text-slate-800">بيانات التقارير والإحصائيات</span>
          {includeReports ? (
            <CheckSquare className="w-5 h-5 text-blue-600" />
          ) : (
            <Square className="w-5 h-5 text-slate-400" />
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري التصدير...' : 'تصدير البيانات'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ================= SCREEN 28: DATA EXPORT SUCCESS =================
export const Screen28DataExportSuccess: React.FC<{
  onNavigate: (s: ScreenId) => void;
  exportedData?: any;
}> = ({ onNavigate, exportedData }) => {
  const handleDownload = () => {
    if (!exportedData) return;
    const jsonStr = JSON.stringify(exportedData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ah2_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم تصدير البيانات بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={handleDownload}
          className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          <FolderDown className="w-4 h-4" />
          تنزيل ملف البيانات (JSON)
        </button>

        <button
          onClick={() => onNavigate('screen-5-home')}
          className="w-full py-2.5 px-6 rounded-xl theme-btn-secondary font-bold text-xs transition-all"
        >
          العودة إلى الرئيسية
        </button>
      </div>
    </div>
  );
};
