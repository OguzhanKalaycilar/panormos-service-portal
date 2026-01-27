import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Mail, Lock, User, Phone, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import AnchorLogo from './AnchorLogo';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
}

const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        const { data: { user }, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast.success('Giriş başarılı!');

        // IMMEDIATELY Fetch Profile & Decide Route
        // This runs before the global AuthContext listener finishes, 
        // ensuring the redirect happens as part of the login flow.
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            
            if (profile?.role === 'admin') {
                window.location.hash = '#/admin-dashboard';
            } else {
                window.location.hash = '#/my-requests';
            }
        }
      } else {
        // Register
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone, 
            },
          },
        });

        if (authError) throw authError;

        if (authData.user) {
          // Manually insert into profiles
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: authData.user.id,
              full_name: fullName,
              email: email,
              phone: phone,
              role: 'customer' 
            });

          if (profileError) {
             console.error("Profile creation error:", profileError);
          }

          toast.success('Kayıt başarılı! Lütfen giriş yapınız.');
          setMode('login');
          window.location.hash = '#/login';
          setPassword(''); 
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Bir hata oluştu.');
    } finally {
      // Note: We don't necessarily need to set loading false if we redirected,
      // but it's good practice in case of errors.
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-12 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
           <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-zinc-800 to-black border border-white/10 mb-6 shadow-2xl shadow-black/50">
              <AnchorLogo className="w-14 h-14" large={true} />
           </div>
           <h2 className="text-4xl font-serif font-bold text-zinc-100 mb-3 tracking-tight">
             {mode === 'login' ? 'Hoşgeldiniz' : 'Hesap Oluştur'}
           </h2>
           <p className="text-zinc-400 text-sm">
             {mode === 'login' 
               ? 'Teknik servis portalına giriş yapın.' 
               : 'Servis talebi oluşturmak için kayıt olun.'}
           </p>
        </div>

        <div className="glass-panel p-8 md:p-10 rounded-3xl shadow-2xl">
          <form onSubmit={handleAuth} className="space-y-5">
            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1">Ad Soyad</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      placeholder="Adınız Soyadınız"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1">Telefon</label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      placeholder="0555 123 45 67"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1">E-posta</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  placeholder="ornek@email.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1">Şifre</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40 hover:-translate-y-0.5"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'} 
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-zinc-500 text-sm">
              {mode === 'login' ? "Hesabınız yok mu?" : "Zaten hesabınız var mı?"}
              <button 
                onClick={() => {
                  const newMode = mode === 'login' ? 'register' : 'login';
                  setMode(newMode);
                  window.location.hash = `#/${newMode}`;
                }}
                className="ml-2 text-amber-500 hover:text-amber-400 font-medium underline-offset-4 hover:underline transition-all"
              >
                {mode === 'login' ? "Hemen Kayıt Olun" : "Giriş Yapın"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;