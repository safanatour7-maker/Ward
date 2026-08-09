import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, LogIn, UserPlus, CloudCheck, CloudUpload, LogOut, Lock, Mail, User as UserIcon, RefreshCw } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, login, register, logout, triggerSync, syncing, lastSyncedAt, updateFullName } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [updatedName, setUpdatedName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateArabicFullName = (val: string): string | null => {
    const clean = val.trim();
    if (!clean) return "يرجى كتابة الاسم الثلاثي.";
    if (/[a-zA-Z]/.test(clean)) {
      return "غير مسموح بكتابة الاسم باللغة الإنجليزية. يرجى كتابة الاسم باللغة العربية حصراً.";
    }
    const arabicRegex = /^[\u0600-\u06FF\s]+$/;
    if (!arabicRegex.test(clean)) {
      return "يرجى كتابة الاسم بالحروف العربية فقط بدون أرقام أو رموز خاصة.";
    }
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length < 3) {
      return "يرجى إدخال اسمك الثلاثي الكامل باللغة العربية (3 أسماء على الأقل: الاسم، واسم الأب، والكنية).";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
        setSuccessMsg("تم تسجيل الدخول واسترجاع بياناتك بنجاح!");
        setTimeout(() => onClose(), 1200);
      } else {
        const nameValErr = validateArabicFullName(name);
        if (nameValErr) {
          setErrorMsg(nameValErr);
          setSubmitting(false);
          return;
        }
        await register(name.trim(), email, password);
        setSuccessMsg("تم إنشاء الحساب وحفظ جميع بياناتك الحالية سحابياً!");
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      const msg = err.message || "";
      if (msg.includes("مسجل بالفعل") || err.code === "auth/email-already-in-use") {
        setErrorMsg("هذا الحساب مسجل بالفعل! يرجى الدخول عن طريق (تسجيل الدخول) بدلاً من إنشاء حساب جديد.");
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setErrorMsg("البريد الإلكتروني أو كلمة السر غير صحيحة.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg("كلمة السر ضعيفة جداً. يجب أن تكون 6 أحرف على الأقل.");
      } else if (err.code === "auth/invalid-email") {
        setErrorMsg("صيغة البريد الإلكتروني غير صحيحة.");
      } else {
        setErrorMsg(msg || "حدث خطأ أثناء العملية، حاول مرة أخرى.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await triggerSync();
      setSuccessMsg("تم حفظ وتحديث النسخة السحابية الآن بنجاح!");
    } catch (err) {
      setErrorMsg("فشلت المزامنة، يرجى التحقق من الاتصال بالإنترنت.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white border border-slate-100 rounded-3xl max-w-md w-full p-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <CloudCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">
                {currentUser ? "حسابك والمزامنة السحابية" : mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
              </h3>
              <p className="text-[10px] text-slate-500">
                {currentUser ? "بياناتك محفوظة بأمان على حسابك الشخصي" : "لحفظ إنجازاتك حتى لو تغير رابط التطبيق"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {currentUser ? (
          /* LOGGED IN VIEW */
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100/80 text-right">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-indigo-600 text-white font-black text-sm">
                  {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : <UserIcon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-black text-slate-800 truncate">
                    {currentUser.displayName || "المستخدم"}
                  </h4>
                  <p className="text-[11px] font-medium text-slate-600 truncate dir-ltr text-right">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              {/* Edit Name Section */}
              {editingName ? (
                <div className="mt-3 pt-3 border-t border-indigo-100/80 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700">تعديل الاسم الثلاثي:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={updatedName}
                      onChange={(e) => setUpdatedName(e.target.value)}
                      placeholder="أدخل اسمك الثلاثي الكامل"
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const err = validateArabicFullName(updatedName);
                        if (err) {
                          setErrorMsg(err);
                          return;
                        }
                        await updateFullName(updatedName.trim());
                        setEditingName(false);
                        setSuccessMsg("تم تحديث الاسم الثلاثي بنجاح!");
                      }}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 cursor-pointer"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="px-2.5 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 pt-2 border-t border-indigo-100/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 font-bold">الاسم المسجل: {currentUser.displayName || "غير محدد"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUpdatedName(currentUser.displayName || "");
                      setEditingName(true);
                    }}
                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    تعديل الاسم الثلاثي
                  </button>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-indigo-100/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-semibold flex items-center gap-1">
                  <CloudCheck className="h-3.5 w-3.5 text-emerald-600" />
                  حالة الحساب:
                </span>
                <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full text-[10px]">
                  مفعل ومزامن
                </span>
              </div>

              {lastSyncedAt && (
                <div className="mt-1 text-[10px] text-slate-500 font-medium text-left">
                  آخر مزامنة: {lastSyncedAt}
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                {successMsg}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                <span>{syncing ? "جاري المزامنة..." : "حفظ ومزامنة البيانات سحابياً الآن"}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4 text-red-500" />
                <span>تسجيل الخروج</span>
              </button>

              {currentUser?.isAdmin && (
                <a
                  href="/admin"
                  onClick={onClose}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 block text-center mt-2"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-500" />
                  <span>إعدادات الإدارة المتقدمة</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          /* FORM VIEW FOR LOGIN / REGISTER */
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold space-y-1.5">
                <p>{errorMsg}</p>
                {errorMsg.includes("مسجل بالفعل") && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setErrorMsg("");
                    }}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black cursor-pointer transition-colors shadow-2xs mt-1"
                  >
                    الضغط هنا للانتقال إلى (تسجيل الدخول) 🔑
                  </button>
                )}
              </div>
            )}
            {successMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                {successMsg}
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  الاسم الثلاثي (الاسم واسم الأب والكنية)
                </label>
                <div className="relative">
                  <UserIcon className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل اسمك الثلاثي الكامل"
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none font-semibold text-slate-800"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none font-semibold text-slate-800 dir-ltr text-right"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">كلمة السر</label>
              <div className="relative">
                <Lock className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none font-semibold text-slate-800 dir-ltr text-right"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-98 mt-2 ${
                mode === "login"
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold"
              }`}
            >
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4 text-indigo-600" />}
              <span>{submitting ? "جاري المعالجة..." : mode === "login" ? "تسجيل الدخول واسترجاع البيانات" : "إنشاء حساب وحفظ البيانات"}</span>
            </button>

            <div className="pt-2 border-t border-slate-100 text-center space-y-2">
              {mode === "login" ? (
                <p className="text-xs text-slate-500 font-medium">
                  ليس لديك حساب بعد؟{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setErrorMsg(""); }}
                    className="text-indigo-600 font-bold hover:bg-indigo-100/70 bg-indigo-50 px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors inline-block mr-1"
                  >
                    أنشئ حساباً جديداً
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-500 font-medium">
                  لديك حساب بالفعل؟{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setErrorMsg(""); }}
                    className="text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    تسجيل الدخول
                  </button>
                </p>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-semibold cursor-pointer underline hover:no-underline pt-1 block mx-auto"
              >
                تصفح واستخدام التطبيق كزائر الآن
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
