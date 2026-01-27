import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';
import toast from 'react-hot-toast';

const MAX_AUTH_LOADING_TIME = 5000; // Reduced to 5s for better UX

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrCreateProfile = async (currentSession: Session) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .maybeSingle();

        if (error) {
            console.error("Profile Fetch Error:", error);
            return null; 
        }

        if (!data) {
            const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: currentSession.user.id,
                    email: currentSession.user.email,
                    full_name: currentSession.user.user_metadata?.full_name || 'Kullanıcı',
                    role: 'customer',
                    phone: currentSession.user.user_metadata?.phone || '',
                })
                .select()
                .single();
            
            if (createError) {
                console.error("Auto-create failed:", createError);
                return null;
            }
            return newProfile as Profile;
        }

        return data as Profile;
    } catch (err) {
        console.error("Unexpected Profile Exception:", err);
        return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Safety timeout to prevent infinite splash screen
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn(`Auth loading timed out at ${MAX_AUTH_LOADING_TIME}ms. Forcing UI render.`);
        setLoading(false);
      }
    }, MAX_AUTH_LOADING_TIME);

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(initialSession);
          // Finish main app loading immediately after session is known
          setLoading(false);
          clearTimeout(safetyTimeout);

          // Fetch profile in background
          if (initialSession) {
            const userProfile = await fetchOrCreateProfile(initialSession);
            if (mounted) setProfile(userProfile);
          }
        }
      } catch (error: any) {
        console.error("Auth Initialization Error:", error);
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      
      console.log("Supabase Auth Event:", event);

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (newSession) {
        setSession(newSession);
        // Background sync
        const userProfile = await fetchOrCreateProfile(newSession);
        if (mounted) setProfile(userProfile);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    try {
        await supabase.auth.signOut();
        localStorage.clear(); 
        sessionStorage.clear();
    } catch (e) {
        console.error("Signout error", e);
    } finally {
        setProfile(null);
        setSession(null);
        setLoading(false);
        window.location.hash = '#/login';
        toast.success('Oturum sonlandırıldı.');
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ session, profile, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};