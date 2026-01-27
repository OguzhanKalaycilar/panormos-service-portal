import React, { useState, useEffect, ErrorInfo } from 'react';
import Layout from './components/Layout';
import ServiceForm from './components/ServiceForm';
import AdminDashboard from './components/AdminDashboard';
import AuthPage from './components/AuthPage';
import CustomerDashboard from './components/CustomerDashboard';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Loader2, RefreshCw, LogOut, AlertTriangle, LogOut as LogOutIcon } from 'lucide-react';
import AnchorLogo from './components/AnchorLogo';
import { supabase } from './lib/supabase';
import toast from 'react-hot-toast';

// --- GLOBAL ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Global App Crash:", error, errorInfo);
  }

  handleForceReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Force signout failed", e);
    } finally {
      window.location.hash = '#/login';
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black p-6 text-center animate-in fade-in zoom-in">
           <div className="w-20 h-20 rounded-full bg-red-900/20 border border-red-500/30 flex items-center justify-center mb-6 shadow-2xl">
              <AnchorLogo className="w-10 h-10 text-red-500" />
           </div>
           <h2 className="text-2xl font-serif font-bold text-zinc-100 mb-2">Uygulama Hatası</h2>
           <p className="text-zinc-500 text-sm max-w-md mb-8">
             Bir şeyler ters gitti. Lütfen uygulamayı sıfırlamayı deneyin.
           </p>
           
           <div className="flex flex-col gap-3 w-full max-w-xs">
               <button 
                 onClick={this.handleForceReset}
                 className="w-full bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
               >
                 <RefreshCw className="w-4 h-4" /> Uygulamayı Sıfırla ve Yeniden Başlat
               </button>
           </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Premium Splash Screen Component with Emergency Exit
const SplashScreen = () => {
    const [seconds, setSeconds] = useState(0);
    const [isTimingOut, setIsTimingOut] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (seconds >= 10 && !isTimingOut) {
            setIsTimingOut(true);
            handleAutoLogout();
        }
    }, [seconds, isTimingOut]);

    const handleAutoLogout = async () => {
        try {
            console.warn("Session stuck. Performing auto-logout.");
            await supabase.auth.signOut();
            localStorage.clear();
            toast.error("Oturumunuz zaman aşımına uğradı. Lütfen tekrar giriş yapın.", { id: 'auth-timeout' });
        } catch (e) {
            console.error("Auto logout failed", e);
        }
    };

    const handleHardReset = async () => {
        localStorage.clear();
        sessionStorage.clear();
        await supabase.auth.signOut();
        window.location.hash = '#/login';
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-amber-500/10 blur-2xl rounded-full animate-pulse"></div>
                    <div className="relative p-6 bg-gradient-to-br from-zinc-800 to-black rounded-3xl border border-white/10 shadow-2xl">
                        <AnchorLogo className="w-20 h-20" large={true} />
                    </div>
                </div>
                <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-wider text-zinc-100 mb-3 text-center">
                    PANORMOS <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">TATTOO</span>
                </h1>
                <p className="text-xs text-zinc-500 tracking-[0.3em] mb-12">TECHNICAL SERVICE PORTAL</p>
                
                {!isTimingOut ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest animate-pulse">Bağlantı bekleniyor...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 animate-in slide-in-from-bottom-2">
                        <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                        <p className="text-zinc-400 text-sm text-center mb-6">Sunucu bağlantısı sağlanamadı.</p>
                    </div>
                )}

                {seconds >= 5 && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col items-center gap-3">
                        <button 
                            onClick={handleHardReset}
                            className="flex items-center gap-3 px-8 py-4 bg-red-900/10 border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm font-bold shadow-xl shadow-red-900/10"
                        >
                            <LogOutIcon className="w-4 h-4" /> Oturumu Sıfırla ve Çıkış Yap
                        </button>
                        <p className="text-[10px] text-zinc-600 font-medium text-center">Yükleme çok uzun sürdüyse buradan oturumu kapatabilirsiniz.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

function AppContent() {
  const { session, loading, isAdmin } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash);
    };

    if (!window.location.hash) window.location.hash = '#/login';
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  if (!session) {
    if (currentPath === '#/register') {
      return <AuthPage initialMode="register" />;
    }
    return <AuthPage initialMode="login" />;
  }

  if (isAdmin) {
      if (currentPath === '#/new-request') {
          return <Layout><ServiceForm /></Layout>;
      }
      if (currentPath !== '#/admin-dashboard') {
          window.location.hash = '#/admin-dashboard';
      }
      return <Layout><AdminDashboard /></Layout>;
  }

  if (currentPath === '#/new-request') return <Layout><ServiceForm /></Layout>;
  
  if (currentPath !== '#/my-requests') {
      window.location.hash = '#/my-requests';
  }
  return <Layout><CustomerDashboard /></Layout>;
}

function App() {
  return (
    <GlobalErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GlobalErrorBoundary>
  );
}

export default App;