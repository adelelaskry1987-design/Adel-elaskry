import React, { useState } from 'react';
import { Ah2Logo } from '../Ah2Logo';
import { ShopOwnerLogo } from '../ShopOwnerLogo';
import { Customer, ScreenId } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  Mail,
  Calendar,
  Lock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  BarChart3,
  ArrowLeftRight,
  Settings,
  Shield,
  Eye,
  EyeOff,
  Building,
  MapPin,
  FileText,
} from 'lucide-react';

// ================= SCREEN 1: SPLASH =================
export const Screen1Splash: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();

  // Automatic transition after 2.5 seconds or tap anywhere
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onNavigate(user ? 'screen-5-home' : 'screen-4-login');
    }, 2500);
    return () => clearTimeout(timer);
  }, [user, onNavigate]);

  const handleProceed = () => {
    onNavigate(user ? 'screen-5-home' : 'screen-4-login');
  };

  return (
    <div
      onClick={handleProceed}
      className="min-h-screen bg-gradient-to-b from-[#091b33] via-[#0b213f] to-[#040e1b] flex flex-col items-center justify-between p-6 text-white text-center select-none cursor-pointer"
    >
      {/* Top Mobile Status Bar (Matches Screen 1 in reference) */}
      <div className="w-full flex justify-between items-center text-xs text-slate-400">
        <span className="font-mono">10:30</span>
        <div className="flex items-center gap-1.5 opacity-80">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </div>
      </div>

      {/* Center Logos: AH2 System Emblem & Shop Owner Brand (OM BASMA) */}
      <div className="my-auto flex flex-col items-center gap-5">
        <Ah2Logo variant="splash" size="xl" showSubtitle={true} />

        {/* Separated Shop Owner Identity */}
        <div className="flex flex-col items-center bg-white/5 border border-amber-400/40 rounded-2xl p-3 backdrop-blur-sm shadow-xl">
          <span className="text-[10px] text-amber-300 font-bold mb-1 opacity-90">
            لوجو صاحب المحل
          </span>
          <ShopOwnerLogo variant="default" size="md" />
        </div>
      </div>

      {/* Bottom Version (Matches Screen 1 in reference) */}
      <div className="text-xs text-slate-400 pb-2 font-mono tracking-wider">
        v1.0.0
      </div>
    </div>
  );
};

// ================= SCREEN 2: CUSTOMER ADDED SUCCESS =================
export const Screen2CustomerAddedSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <h2 className="text-2xl font-black text-slate-800 mb-2">تم إضافة عميل بنجاح</h2>
      <p className="text-slate-500 text-sm max-w-xs mb-8">
        تم إضافة العميل بنجاح إلى قائمة العملاء وقاعدة البيانات.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => onNavigate('screen-15-customers')}
          className="w-full py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
        >
          العودة إلى العملاء
        </button>
        <button
          onClick={() => onNavigate('screen-7-customer-add')}
          className="w-full py-2.5 px-6 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
        >
          + إضافة عميل آخر
        </button>
      </div>
    </div>
  );
};

// ================= SCREEN 3: PROFILE =================
export const Screen3Profile: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const { user, project } = useAuth();

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24">
      {/* User Header Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center text-blue-600 mb-3 shadow-inner">
          <User className="w-10 h-10" />
        </div>
        <h2 className="text-lg font-black text-slate-800">{user?.name || 'صاحب المشروع'}</h2>
        <span className="mt-1 inline-block text-[11px] font-bold px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {user?.role === 'owner' ? 'مدير النظام (صاحب المشروع)' : 'موظف في المشروع'}
        </span>
      </div>

      {/* Info fields card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
          <span className="text-slate-500 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            الاسم بالكامل
          </span>
          <span className="font-bold text-slate-800">{user?.name}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
          <span className="text-slate-500 flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-500" />
            رقم الهاتف
          </span>
          <span className="font-bold text-slate-800 font-mono">{user?.phone}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
          <span className="text-slate-500 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            البريد الإلكتروني
          </span>
          <span className="font-bold text-slate-800">{user?.email || 'غير مسجل'}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
          <span className="text-slate-500 flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-500" />
            اسم المشروع
          </span>
          <span className="font-bold text-slate-800">{project?.name}</span>
        </div>

        <div className="flex items-center justify-between py-2 text-xs">
          <span className="text-slate-500 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            تاريخ التسجيل
          </span>
          <span className="font-bold text-slate-800 font-mono">
            {user?.created_at ? user.created_at.split('T')[0] : '2026-09-01'}
          </span>
        </div>
      </div>

      <button
        onClick={() => onNavigate('screen-12-change-password')}
        className="w-full py-3 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
      >
        <Lock className="w-4 h-4" />
        تغيير كلمة المرور
      </button>

      {/* App Info Card */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Shield className="w-4 h-4 text-amber-500" />
          بيانات التطبيق والأمان
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          نظام AH2 يعمل بقواعد بيانات دائمة ومشفرة مع عزل تام لكل مشروع وصلاحيات محكمة.
        </p>
      </div>
    </div>
  );
};

// ================= SCREEN 4: LOGIN & REGISTER =================
export const Screen4Login: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [name, setName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [projectPassword, setProjectPassword] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier || !password) {
      setError('يرجى إدخال اسم المستخدم / الهاتف وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      await login(identifier, password);
      onNavigate('screen-5-home');
    } catch (err: any) {
      setError(err.message || 'بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !projectName || !phone || !password) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      await register({
        name,
        projectName,
        phone,
        email,
        password,
        confirmPassword,
        projectPassword: projectPassword || password,
      });
      onNavigate('screen-5-home');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08172b] flex flex-col items-center justify-center p-4 text-white select-none">
      <div className="w-full max-w-sm bg-[#0d223c] rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Ah2Logo variant="emblem" size="sm" showSubtitle={false} />
            <div className="h-10 w-px bg-slate-600/60" />
            <div className="flex flex-col items-center">
              <ShopOwnerLogo variant="default" size="sm" />
            </div>
          </div>
          <div className="text-[11px] font-bold text-amber-300 tracking-wide mt-1">
            OM BASMA للستائر والمفروشات
          </div>
          <h2 className="text-xl font-black mt-2 text-amber-400">
            {isRegisterMode ? 'إنشاء حساب ومشروع جديد' : 'مرحبًا بك'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {isRegisterMode
              ? 'أدخل بياناتك لإنشاء مشروعك وحسابك المستقل'
              : 'سجل دخولك للمتابعة وإدارة حساباتك'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {!isRegisterMode ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                اسم المستخدم / رقم الهاتف
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="أدخل رقم هاتفك أو بريدك"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#09182c] border border-slate-600 focus:border-amber-400 focus:outline-none text-white text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full pr-3 pl-9 py-2.5 rounded-xl bg-[#09182c] border border-slate-600 focus:border-amber-400 focus:outline-none text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
            >
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setError(null);
                }}
                className="text-xs text-amber-300 hover:underline font-semibold"
              >
                ليس لديك حساب؟ أنشئ حسابك ومشروعك الآن
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto px-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                اسم صاحب المشروع *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أحمد محمد علي"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                اسم المشروع / النشاط التجاري *
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="شركة الأمل للتجارة"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                رقم الهاتف (فريد لتسجيل الدخول) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs font-mono focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                البريد الإلكتروني (اختياري)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmed@example.com"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                كلمة مرور الحساب *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="لا تقل عن 6 رموز"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                تأكيد كلمة المرور *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-slate-600 text-white text-xs focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                كلمة مرور المشروع (للعمليات الحساسة)
              </label>
              <input
                type="password"
                value={projectPassword}
                onChange={(e) => setProjectPassword(e.target.value)}
                placeholder="اختياري (الافتراضي نفس كلمة المرور)"
                className="w-full px-3 py-2 rounded-xl bg-[#09182c] border border-amber-500/50 text-white text-xs focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
            >
              {loading ? 'جاري الإنشاء...' : 'تأكيد وإنشاء المشروع'}
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setError(null);
                }}
                className="text-xs text-slate-300 hover:underline font-semibold"
              >
                لديك حساب بالفعل؟ سجل دخولك
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ================= SCREEN 5: HOME DASHBOARD =================
// CRITICAL USER REQUIREMENT #2: In the home screen ONLY, delete the "إجمالي العملاء" button!
// Keep all other cards (positive balance, negative balance), buttons (+ إضافة عميل, العملاء, التقارير, العمليات, الإعدادات), footer, navigation intact!
export const Screen5Home: React.FC<{
  onNavigate: (s: ScreenId) => void;
  summary: any;
}> = ({ onNavigate, summary }) => {
  const { project, user } = useAuth();

  const positive = summary?.positiveBalanceSum ?? 0;
  const negative = summary?.negativeBalanceSum ?? 0;

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      {/* Title banner */}
      <div className="bg-[#0f233c] text-white p-3.5 rounded-2xl border border-slate-700 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-black text-amber-400 leading-tight">إدارة العملاء والحسابات</h1>
          <p className="text-[11px] text-slate-300">
            {project?.name || 'مشروع AH2'} — مرحباً {user?.name || ''}
          </p>
        </div>
        <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2.5 py-1 rounded-full border border-amber-400/30 font-mono">
          2026
        </span>
      </div>

      {/* Two Balance Cards (Negative & Positive) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Negative Balance Card (Red) */}
        <div className="bg-gradient-to-br from-[#fee2e2] to-[#fecaca] border border-red-300 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-700">
            <span className="text-xs font-black">الرصيد السالب</span>
            <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs">
              -
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-red-700 font-mono tabular-nums">
              {negative.toLocaleString()} <span className="text-xs font-bold font-sans">ج.م</span>
            </div>
            <div className="text-[10px] text-red-600 mt-0.5">مستحقات للعملاء / سحوبات</div>
          </div>
        </div>

        {/* Positive Balance Card (Green) */}
        <div className="bg-gradient-to-br from-[#dcfce7] to-[#bbf7d0] border border-emerald-300 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-black">الرصيد الموجب</span>
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              +
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-emerald-800 font-mono tabular-nums">
              {positive.toLocaleString()} <span className="text-xs font-bold font-sans">ج.م</span>
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">مطلوب من العملاء / مدفوعات</div>
          </div>
        </div>
      </div>

      {/* Action Buttons Grid (Notice: "إجمالي العملاء" button is removed per explicit requirement #2!) */}
      <div className="space-y-2.5 pt-1">
        {/* + إضافة عميل Button */}
        <button
          onClick={() => onNavigate('screen-7-customer-add')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-sm shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            <span>إضافة عميل +</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* العملاء Button */}
        <button
          onClick={() => onNavigate('screen-15-customers')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>العملاء</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* التقارير Button */}
        <button
          onClick={() => onNavigate('screen-33-reports')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-sm shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <span>التقارير</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* العمليات Button */}
        <button
          onClick={() => onNavigate('screen-18-all-transactions')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#4f46e5] hover:bg-[#4338ca] text-white font-bold text-sm shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            <span>العمليات</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* الإعدادات Button */}
        <button
          onClick={() => onNavigate('screen-32-settings')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-sm shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <span>الإعدادات</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Footer Notice text as in reference screen 5 */}
      <div className="text-center pt-2 text-[11px] text-slate-500">
        تاريخ ووقت التسجيل يُستخدم لمستقبلك الخاص فقط
      </div>
    </div>
  );
};

// ================= SCREEN 6: CUSTOMER DELETE CONFIRMATION =================
export const Screen6CustomerDelete: React.FC<{
  customer: Customer | null;
  onNavigate: (s: ScreenId) => void;
  onDeleted: () => void;
}> = ({ customer, onNavigate, onDeleted }) => {
  const [projectPassword, setProjectPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!customer) return;
    if (!projectPassword) {
      setError('أدخل كلمة المرور للتأكيد');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.deleteCustomer(customer.id, projectPassword);
      onDeleted();
      onNavigate('screen-10-customer-deleted-success');
    } catch (err: any) {
      setError(err.message || 'كلمة مرور المشروع غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-500 text-red-600 mx-auto flex items-center justify-center mb-2">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-red-700">حذف العميل</h2>
        <p className="text-xs text-red-600 mt-1">
          سيتم حذف بيانات العميل نهائياً من قاعدة البيانات
        </p>
      </div>

      {/* Customer details card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
        <div className="font-bold text-slate-700 border-b pb-1">بيانات العميل</div>
        <div className="flex justify-between">
          <span className="text-slate-500">الاسم:</span>
          <span className="font-bold text-slate-800">{customer?.name || '---'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">رقم الهاتف:</span>
          <span className="font-bold text-slate-800 font-mono">{customer?.phone || '---'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">العنوان:</span>
          <span className="font-bold text-slate-800">{customer?.address || 'غير محدد'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">الرصيد الحالي:</span>
          <span
            className={`font-black font-mono ${
              (customer?.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {customer?.balance?.toLocaleString()} ج.م
          </span>
        </div>
      </div>

      {/* Warning Box */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
        <div className="font-black text-amber-900 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          تنبيه هام
        </div>
        <p className="text-[11px] leading-relaxed">
          سيتم حذف هذا العميل نهائياً من قاعدة البيانات وجميع العمليات المالية المرتبطة به، ولا يمكن استرجاعه مرة أخرى.
        </p>
      </div>

      {/* Password verification input */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
        <label className="block text-xs font-bold text-slate-700">
          أدخل كلمة المرور للتأكيد *
        </label>
        <div className="relative">
          <input
            type="password"
            value={projectPassword}
            onChange={(e) => setProjectPassword(e.target.value)}
            placeholder="كلمة المرور"
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
          <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>
        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      </div>

      <div className="space-y-2 pt-2">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
        >
          {loading ? 'جاري الحذف...' : 'حذف العميل'}
        </button>
        <button
          onClick={() => onNavigate('screen-15-customers')}
          className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};

// ================= SCREEN 7: CUSTOMER ADD =================
export const Screen7CustomerAdd: React.FC<{
  onNavigate: (s: ScreenId) => void;
  onCustomerAdded: () => void;
}> = ({ onNavigate, onCustomerAdded }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<'individual' | 'company'>('individual');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('يرجى إدخال اسم العميل');
      return;
    }
    if (!phone.trim()) {
      setError('يرجى إدخال رقم الهاتف');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        type,
        notes: notes.trim(),
      });
      onCustomerAdded();
      onNavigate('screen-2-customer-added-success');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ العميل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <div className="bg-[#0f233c] text-white p-3.5 rounded-2xl border border-slate-700 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-amber-400">إضافة عميل +</h2>
          <p className="text-[11px] text-slate-300">أدخل بيانات العميل الجديد لحفظه بقاعدة البيانات</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            اسم العميل *
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم العميل بالكامل"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <User className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            رقم الهاتف *
          </label>
          <div className="relative">
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
            <Phone className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            العنوان
          </label>
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="المدينة، الحي، الشارع"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            نوع العميل
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('individual')}
              className={`py-2 px-3 text-xs rounded-xl font-bold border transition-all ${
                type === 'individual'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-300'
              }`}
            >
              فرد
            </button>
            <button
              type="button"
              onClick={() => setType('company')}
              className={`py-2 px-3 text-xs rounded-xl font-bold border transition-all ${
                type === 'company'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-300'
              }`}
            >
              شركة / مؤسسة
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            ملاحظات
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي ملاحظات إضافية عن العميل..."
            className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : 'حفظ العميل'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('screen-15-customers')}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
};
