import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';

const INITIAL_LOAD_TIMEOUT = 5000; // Final safety timeout

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
        // Attempt to insert profile if missing
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
          // If RLS blocks insert (42501), assume trigger handled it or it's read-only.
          // We return null here but don't log as error to avoid noise/panic.
          if (createError.code === '42501') {
             console.warn("Profile creation skipped due to RLS (safe if trigger exists).");
             return null; 
          }
          console.error("Auto-create profile failed:", createError);
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

    // Safety timeout to ensure the app ALWAYS boots even if Supabase is slow
    const bootTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth initialization safety timeout triggered.");
        setLoading(false);
      }
    }, INITIAL_LOAD_TIMEOUT);

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(initialSession);
          
          if (initialSession) {
            // Fetch profile but don't let it block the main 'loading' state if it takes too long
            const userProfile = await fetchOrCreateProfile(initialSession);
            if (mounted) {
              setProfile(userProfile);
              setLoading(false);
              clearTimeout(bootTimer);
            }
          } else {
            setLoading(false);
            clearTimeout(bootTimer);
          }
        }
      } catch (error: any) {
        console.error("Auth Initialization Error:", error);
        if (mounted) {
          setLoading(false);
          clearTimeout(bootTimer);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      
      if ((event as string) === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (newSession) {
        setSession(newSession);
        // Silently update profile in background on auth changes
        fetchOrCreateProfile(newSession).then(p => {
          if (mounted && p) setProfile(p);
        });
      }
    });

    return () => {
      mounted = false;
      clearTimeout(bootTimer);
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