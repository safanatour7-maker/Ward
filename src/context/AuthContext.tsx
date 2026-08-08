import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, dbFirestore } from "@/lib/firebase";
import { pullCloudToLocal, pushLocalToCloud } from "@/lib/cloud-sync";

export interface AppUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  isLocal?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  currentUser: AppUser | null;
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  triggerSync: () => Promise<void>;
  toggleAdminRole: (passcode?: string) => Promise<boolean>;
  updateFullName: (newName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getAccountDocId(email: string): string {
  const clean = email.trim().toLowerCase();
  return "acc_" + clean.replace(/[^a-zA-Z0-9]/g, "_");
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // 1. Restore saved account session from localStorage on load
  useEffect(() => {
    const savedSession = localStorage.getItem("app_account_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.uid && parsed.email) {
          setCurrentUser(parsed);
          pullCloudToLocal(parsed.uid).then(() => {
            setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
          });
        }
      } catch (e) {
        console.error("Failed restoring saved session", e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        const accId = user.uid;
        let name = user.displayName;
        if (!name) {
          const userSnap = await getDoc(doc(dbFirestore, "users", accId)).catch(() => null);
          if (userSnap && userSnap.exists()) {
            name = userSnap.data()?.displayName;
          }
        }
        if (!name) {
          name = localStorage.getItem(`profile_name_${user.email.toLowerCase()}`) || user.email.split("@")[0];
        }

        const appUser: AppUser = {
          uid: accId,
          email: user.email,
          displayName: name,
          isLocal: false,
        };
        setCurrentUser(appUser);
        localStorage.setItem("app_account_session", JSON.stringify(appUser));
        setSyncing(true);
        await pullCloudToLocal(accId);
        setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
        setSyncing(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // 2. Periodic background auto-sync every 8 seconds if user is logged in
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;

    const interval = setInterval(() => {
      pushLocalToCloud(currentUser.uid).then(() => {
        setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
      });
    }, 8000);

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        pushLocalToCloud(currentUser.uid);
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentUser]);

  const register = async (name: string, email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const accDocId = getAccountDocId(cleanEmail);
    const resolvedName = name.trim();

    // 1. Mandatory 3-part full name validation
    const nameParts = resolvedName.split(/\s+/).filter(Boolean);
    if (nameParts.length < 3) {
      throw new Error("يرجى إدخال اسمك الثلاثي الكامل (على الأقل 3 كلمات: الاسم، واسم الأب، والكنية).");
    }

    setSyncing(true);

    // 2. Pre-check duplicate account in Firestore
    try {
      const existingDoc = await getDoc(doc(dbFirestore, "users", accDocId)).catch(() => null);
      if (existingDoc && existingDoc.exists()) {
        setSyncing(false);
        throw new Error("هذا الحساب مسجل بالفعل! يرجى الانتقال إلى (تسجيل الدخول) للدخول إلى حسابك بدون تكرار.");
      }
    } catch (e: any) {
      if (e.message?.includes("مسجل بالفعل")) {
        throw e;
      }
    }

    localStorage.setItem(`profile_name_${cleanEmail}`, resolvedName);

    let finalUid = accDocId;
    try {
      const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      if (userCred.user) {
        finalUid = userCred.user.uid;
        if (resolvedName) {
          await updateProfile(userCred.user, { displayName: resolvedName }).catch(() => {});
        }
      }
    } catch (e: any) {
      if (e.code === "auth/email-already-in-use") {
        setSyncing(false);
        throw new Error("هذا الحساب مسجل بالفعل! يرجى الانتقال إلى (تسجيل الدخول) للدخول إلى حسابك بدون تكرار.");
      }
      console.log("Firebase auth note:", e.message);
    }

    const userPayload = {
      displayName: resolvedName,
      email: cleanEmail,
      password: pass,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(dbFirestore, "users", accDocId), userPayload, { merge: true }).catch(() => {});
    if (finalUid !== accDocId) {
      await setDoc(doc(dbFirestore, "users", finalUid), userPayload, { merge: true }).catch(() => {});
    }

    const appUser: AppUser = {
      uid: finalUid,
      email: cleanEmail,
      displayName: resolvedName,
      isLocal: false,
    };

    setCurrentUser(appUser);
    localStorage.setItem("app_account_session", JSON.stringify(appUser));

    await pushLocalToCloud(finalUid);
    if (finalUid !== accDocId) {
      await pushLocalToCloud(accDocId);
    }

    setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
    setSyncing(false);
  };

  const login = async (email: string, pass: string) => {
    setSyncing(true);
    const cleanEmail = email.trim().toLowerCase();
    const accDocId = getAccountDocId(cleanEmail);

    let finalUid = accDocId;
    let fetchedName = "";

    // 1. Try Firebase Auth
    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      if (userCred.user) {
        finalUid = userCred.user.uid;
        fetchedName = userCred.user.displayName || "";
      }
    } catch (e: any) {
      console.log("Firebase Auth signin note:", e.message);
    }

    // 2. Fetch profile from Firestore to ensure name & account validity
    let userSnap = await getDoc(doc(dbFirestore, "users", accDocId)).catch(() => null);
    if ((!userSnap || !userSnap.exists()) && finalUid !== accDocId) {
      userSnap = await getDoc(doc(dbFirestore, "users", finalUid)).catch(() => null);
    }

    if (userSnap && userSnap.exists()) {
      const data = userSnap.data();
      if (!fetchedName && data?.displayName) {
        fetchedName = data.displayName;
      }
      if (data?.password && pass && data.password !== pass) {
        setSyncing(false);
        throw new Error("كلمة السر غير صحيحة");
      }
    } else {
      fetchedName = localStorage.getItem(`profile_name_${cleanEmail}`) || cleanEmail.split("@")[0] || "المستخدم";
      await setDoc(doc(dbFirestore, "users", accDocId), {
        displayName: fetchedName,
        email: cleanEmail,
        password: pass,
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }

    if (!fetchedName) {
      fetchedName = localStorage.getItem(`profile_name_${cleanEmail}`) || cleanEmail.split("@")[0] || "المستخدم";
    }

    const appUser: AppUser = {
      uid: finalUid,
      email: cleanEmail,
      displayName: fetchedName,
      isLocal: false,
    };

    setCurrentUser(appUser);
    localStorage.setItem("app_account_session", JSON.stringify(appUser));

    // Pull cloud data into local Dexie database!
    let pulled = await pullCloudToLocal(finalUid);
    if (!pulled && finalUid !== accDocId) {
      pulled = await pullCloudToLocal(accDocId);
    }

    setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
    setSyncing(false);
  };

  const logout = async () => {
    localStorage.removeItem("app_account_session");
    setCurrentUser(null);
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
  };

  const triggerSync = async () => {
    if (!currentUser || !currentUser.uid) return;
    setSyncing(true);
    await pushLocalToCloud(currentUser.uid);
    setLastSyncedAt(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
    setSyncing(false);
  };

  const toggleAdminRole = async (passcode?: string): Promise<boolean> => {
    // If already admin and toggling off, no PIN needed
    if (currentUser && currentUser.isAdmin) {
      const updatedUser: AppUser = { ...currentUser, isAdmin: false };
      setCurrentUser(updatedUser);
      localStorage.setItem("app_account_session", JSON.stringify(updatedUser));
      if (currentUser.uid) {
        await setDoc(doc(dbFirestore, "users", currentUser.uid), {
          isAdmin: false,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
      return true;
    }

    // Require exact secret PIN to toggle ON
    const cleanPass = (passcode || "").trim().toLowerCase();
    const isValid = cleanPass === "werd2026" || cleanPass === "778899" || cleanPass === "admin";
    if (!isValid) return false;

    let updatedUser: AppUser;
    if (currentUser) {
      updatedUser = { ...currentUser, isAdmin: true };
    } else {
      updatedUser = {
        uid: "admin_local",
        email: "admin@werd.app",
        displayName: "مدير النظام",
        isAdmin: true,
      };
    }

    setCurrentUser(updatedUser);
    localStorage.setItem("app_account_session", JSON.stringify(updatedUser));

    if (updatedUser.uid && updatedUser.uid !== "admin_local") {
      await setDoc(doc(dbFirestore, "users", updatedUser.uid), {
        isAdmin: true,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }

    return true;
  };

  const updateFullName = async (newName: string) => {
    if (!currentUser) return;
    const cleanName = newName.trim();
    if (!cleanName) return;

    const updatedUser: AppUser = { ...currentUser, displayName: cleanName };
    setCurrentUser(updatedUser);
    localStorage.setItem("app_account_session", JSON.stringify(updatedUser));

    if (currentUser.email) {
      localStorage.setItem(`profile_name_${currentUser.email.toLowerCase()}`, cleanName);
    }

    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
    }

    if (currentUser.uid) {
      const accDocId = currentUser.email ? getAccountDocId(currentUser.email) : currentUser.uid;
      await setDoc(doc(dbFirestore, "users", currentUser.uid), {
        displayName: cleanName,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
      if (accDocId !== currentUser.uid) {
        await setDoc(doc(dbFirestore, "users", accDocId), {
          displayName: cleanName,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        syncing,
        lastSyncedAt,
        login,
        register,
        logout,
        triggerSync,
        toggleAdminRole,
        updateFullName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

