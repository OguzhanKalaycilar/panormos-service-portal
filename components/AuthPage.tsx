
import React, { useState, useRef, useEffect } from 'react';
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
  
  const isSubmitting = useRef(false);
  const isMounted = useRef(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);

    try {
      if (mode === 'login') {
        const { data: { user }, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (!isMounted.current) return;
        toast.success('Giriş başarılı!');
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (!isMounted.current) return;
            if (profile?.role === 'admin') window.location.hash = '#/admin-dashboard';
            else window.location.hash = '#/my-requests';
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone: phone } },
        });
        if (authError) throw authError;
        if (authData.user) {
          try {
             const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', authData.user.id).maybeSingle();
             if (!existingProfile) {
                const { error: profileError } = await supabase.from('profiles').insert({
                    id: authData.user.id,
                    full_name: fullName,
                    email: email,
                    phone: phone,
                    role: 'customer' 
                });
                if (profileError && profileError.code !== '42501') throw profileError;
             }
          } catch (profileErr) { console.warn(profileErr); }
          if (!isMounted.current) return;
          toast.success('Kayıt başarılı! Yönlendiriliyorsunuz...');
          if (authData.session) window.location.hash = '#/my-requests';
          else {
             setLoading(false);
             isSubmitting.current = false;
             setMode('login');
             window.location.hash = '#/login';
             setPassword(''); 
          }
        }
      }
    } catch (error: any) {
      if (!isMounted.current) return;
      const msg = error?.message || '';
      let errorMessage = 'Bir hata oluştu.';
      if (msg.includes("Invalid login credentials")) errorMessage = "E-posta veya şifre hatalı.";
      else if (msg) errorMessage = msg;
      toast.error(errorMessage);
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8 relative overflow-hidden">
      {/* Background Decor - Smaller */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-[92%] max-w-sm relative z-10">
        <div className="text-center mb-8">
           <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-800 to-black border border-white/10 mb-4 shadow-2xl shadow-black/50">
              <AnchorLogo className="w-12 h-12" large={true} />
           </div>
           <h2 className="text-3xl font-serif font-bold text-zinc-100 mb-2 tracking-tight">
             {mode === 'login' ? 'Hoşgeldiniz' : 'Hesap Oluştur'}
           </h2>
           <p className="text-zinc-400 text-xs">
             {mode === 'login' ? 'Teknik servis portalına giriş yapın.' : 'Servis talebi oluşturmak için kayıt olun.'}
           </p>
        </div>

        <div className="glass-panel p-6 md:p-8 rounded-2xl shadow-2xl">
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Ad Soyad</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="text" required value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      placeholder="Ad Soyad"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Telefon</label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="tel" required value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      placeholder="0555..."
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">E-posta</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  placeholder="ornek@email.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Şifre</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  placeholder="••••••••" minLength={6}
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full mt-4 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 active:scale-95 disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'} 
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-zinc-500 text-xs">
              {mode === 'login' ? "Hesabınız yok mu?" : "Zaten hesabınız var mı?"}
              <button 
                onClick={() => {
                  const newMode = mode === 'login' ? 'register' : 'login';
                  setMode(newMode);
                  window.location.hash = `#/${newMode}`;
                }}
                className="ml-2 text-amber-500 hover:text-amber-400 font-medium transition-all"
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
