import React from 'react';
import { LogOut, User as UserIcon, Phone } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import AnchorLogo from './AnchorLogo';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { session, profile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-100 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(24, 24, 27, 0.9)',
            backdropFilter: 'blur(16px)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
          success: {
            iconTheme: {
              primary: '#D4AF37',
              secondary: '#1a1a1a',
            },
          },
        }}
      />
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.hash = session ? (profile?.role === 'admin' ? '#/admin-dashboard' : '#/my-requests') : '#/login'}>
            <div className="p-2 bg-gradient-to-br from-zinc-800 to-black rounded-lg border border-white/10 group-hover:border-amber-500/50 transition-colors shadow-lg shadow-black/50">
               <AnchorLogo className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-serif text-lg md:text-xl font-bold tracking-wider text-zinc-100 group-hover:text-white transition-colors">
                PANORMOS <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">TATTOO</span>
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] leading-none group-hover:text-zinc-400 transition-colors">
                Technical Service
              </p>
            </div>
          </div>
          
          <nav className="flex items-center gap-6">
             {session && profile && (
               <div className="flex items-center gap-4">
                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-sm font-semibold text-zinc-200">{profile.full_name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-amber-500/80 font-medium">{profile.role === 'admin' ? 'Yönetici' : 'Müşteri'}</span>
                  </div>
                  <button 
                    onClick={signOut}
                    className="p-2.5 bg-zinc-800/50 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded-lg transition-all border border-transparent hover:border-red-500/20"
                    title="Çıkış Yap"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
               </div>
             )}
             {!session && (
               <span className="text-zinc-500 text-sm hidden md:block tracking-wide">Professional Equipment Support</span>
             )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-zinc-950 py-12 mt-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Brand Info */}
          <div className="text-center md:text-left">
            <h3 className="font-serif text-lg font-bold text-zinc-200 mb-2 flex items-center justify-center md:justify-start gap-2">
                <AnchorLogo className="w-5 h-5" /> PANORMOS TATTOO
            </h3>
            <p className="text-zinc-500 text-sm max-w-xs">
              Profesyonel dövme ekipmanları ve premium teknik servis hizmetleri.
            </p>
          </div>
          
          {/* Contact - Phone Only */}
          <div className="flex flex-col items-center justify-center">
            <a href="tel:+905302623373" className="flex items-center gap-3 text-zinc-300 hover:text-amber-500 transition-all text-sm font-medium px-6 py-3 bg-zinc-900 rounded-full border border-white/5 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5 group">
               <div className="p-1.5 bg-zinc-800 rounded-full text-zinc-400 group-hover:text-amber-500 transition-colors">
                 <Phone className="w-4 h-4" /> 
               </div>
               <span className="tracking-wide">+90 530 262 33 73</span>
            </a>
          </div>

          {/* Copyright */}
          <div className="text-zinc-600 text-xs text-center md:text-right leading-relaxed">
            &copy; {new Date().getFullYear()} Panormos Tattoo Supply.<br /> Tüm hakları saklıdır.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;