
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';

const INITIAL_LOAD_TIMEOUT = 8000; // Increased timeout to accommodate retries

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

  const fetchOrCreateProfile = async (currentSession: Session): Promise<Profile | null> => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .maybeSingle();

          if (error) throw error;

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
              // If RLS blocks insert (42501), return valid fallback
              if (createError.code === '42501') {
                 console.warn("Profile creation skipped due to RLS.");
                 return {
                    id: currentSession.user.id,
                    email: currentSession.user.email,
                    full_name: currentSession.user.user_metadata?.full_name || 'Kullanıcı',
                    role: 'customer',
                    has_seen_guide: false
                 } as Profile;
              }
              throw createError;
            }
            return newProfile as Profile;
          }

          return data as Profile;
        } catch (err) {
          attempts++;
          console.warn(`Profile fetch attempt ${attempts} failed:`, err);
          
          if (attempts >= maxAttempts) {
              console.error("Profile fetch failed after max retries. Using fallback.");
              // Return ephemeral profile to prevent app crash
              return {
                id: currentSession.user.id,
                email: currentSession.user.email,
                full_name: currentSession.user.user_metadata?.full_name || 'Kullanıcı',
                role: 'customer', // Default role
                has_seen_guide: false
              } as Profile;
          }
          // Exponential backoff: 500ms, 1000ms, 2000ms
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempts - 1)));
        }
    }
    return null;
  };

  useEffect(() => {
    let mounted = true;

    // Safety timeout
    const bootTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth initialization safety timeout triggered.");
        setLoading(false);
      }
    }, INITIAL_LOAD_TIMEOUT);

    const initializeAuth = async () => {
      try {
        // Check for session
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (mounted) {
          setSession(initialSession);
          
          if (initialSession) {
            const userProfile = await fetchOrCreateProfile(initialSession);
            if (mounted) {
              setProfile(userProfile);
              setLoading(false);
            }
          } else {
            setLoading(false);
          }
          clearTimeout(bootTimer);
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
      
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (newSession) {
        setSession(newSession);
        // If profile is already loaded and matches user, don't refetch to avoid flicker
        if (!profile || profile.id !== newSession.user.id) {
            const p = await fetchOrCreateProfile(newSession);
            if (mounted && p) setProfile(p);
        }
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
