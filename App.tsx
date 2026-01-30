import React, { useState, useEffect, ErrorInfo, Component } from 'react';
import Layout from './components/Layout';
import ServiceForm from './components/ServiceForm';
import AdminDashboard from './components/AdminDashboard';
import AuthPage from './components/AuthPage';
import CustomerDashboard from './components/CustomerDashboard';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Loader2, RefreshCw, AlertTriangle, Play } from 'lucide-react';
import AnchorLogo from './components/AnchorLogo';
import { supabase } from './lib/supabase';

// --- GLOBAL ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
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
             Uygulama başlatılırken bir sorun oluştu. Lütfen tüm verileri temizleyip yeniden deneyin.
           </p>
           
           <div className="flex flex-col gap-3 w-full max-w-xs">
               <button 
                 onClick={this.handleForceReset}
                 className="w-full bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
               >
                 <RefreshCw className="w-4 h-4" /> Uygulamayı Sıfırla
               </button>
           </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const SplashScreen = () => {
    const [seconds, setSeconds] = useState(0);
    const { signOut } = useAuth();

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleForceSkip = () => {
        window.location.reload();
    };

    const isTimingOut = seconds >= 10;

    return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500 px-6 text-center">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full animate-pulse"></div>
                    <div className="relative p-6 bg-gradient-to-br from-zinc-800 to-black rounded-3xl border border-white/10 shadow-2xl shadow-black">
                        <AnchorLogo className="w-20 h-20" large={true} />
                    </div>
                </div>
                
                <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-wider text-zinc-100 mb-3">
                    PANORMOS <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">TATTOO</span>
                </h1>
                <p className="text-xs text-zinc-500 tracking-[0.3em] mb-12">TECHNICAL SERVICE PORTAL</p>
                
                {!isTimingOut ? (
                    <div className="flex flex-col items-center gap-6">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                            <p className="text-zinc-600 text-[10px] uppercase tracking-widest animate-pulse">Sunucuya bağlanılıyor...</p>
                        </div>
                        
                        {seconds >= 3 && (
                            <button 
                                onClick={handleForceSkip}
                                className="flex items-center gap-2 px-6 py-2 bg-zinc-900 border border-white/5 text-zinc-400 hover:text-amber-500 rounded-lg text-xs font-bold transition-all animate-in fade-in slide-in-from-bottom-2"
                            >
                                <Play className="w-3 h-3" /> Hemen Başlat
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 animate-in slide-in-from-bottom-2">
                        <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
                        <p className="text-zinc-300 font-bold mb-2">Bağlantı Gecikti</p>
                        <p className="text-zinc-500 text-sm text-center mb-8 max-w-xs">İnternet bağlantınızı kontrol edin veya oturumu sıfırlayarak tekrar deneyin.</p>
                        
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <button 
                                onClick={() => window.location.reload()}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold py-4 rounded-xl transition-all border border-white/10 shadow-xl flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" /> Tekrar Dene
                            </button>
                            
                            <button 
                                onClick={signOut}
                                className="w-full bg-red-900/10 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" /> Oturumu Sıfırla
                            </button>
                        </div>
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