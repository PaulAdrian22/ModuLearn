import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, usernameToEmail } from '../lib/supabase';

const AuthContext = createContext(null);

// Combine auth.users + profiles into a single user object.
// Legacy field aliases (UserID, Name) are kept so existing consumers continue
// to compile; Phase 4 will normalize callers to the new lowercase names.
const buildUser = (authUser, profile) => {
  if (!authUser) return null;
  const id = authUser.id;
  const name = profile?.name ?? authUser.user_metadata?.name ?? '';
  const username = profile?.username ?? authUser.user_metadata?.username ?? '';
  const role = profile?.role ?? 'student';
  return {
    id,
    UserID: id, // legacy alias
    name,
    Name: name, // legacy alias
    username,
    email: authUser.email,
    role,
    age: profile?.age ?? null,
    educational_background: profile?.educational_background ?? null,
    profile_picture: profile?.profile_picture ?? null,
    avatar_type: profile?.avatar_type ?? 'default',
    default_avatar: profile?.default_avatar ?? 'avatar1.svg',
    preferred_language: profile?.preferred_language ?? 'English',
  };
};

const fetchProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no row; trigger handle_new_user normally creates it but
    // synthetic-email signup may race — we'll re-fetch on auth state change.
    console.error('[Auth] profile fetch failed', error);
  }
  return data;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      return;
    }
    const profile = await fetchProfile(authUser.id);
    const built = buildUser(authUser, profile);
    setUser(built);
    // Sync the server's preferred_language into localStorage so subsequent
    // page loads on a new device pick it up before any user interaction.
    if (built?.preferred_language && typeof window !== 'undefined') {
      window.localStorage.setItem('preferredLanguage', built.preferred_language);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      await refreshUser(session?.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await refreshUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshUser]);

  const login = async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) throw error;
    return data;
  };

  const register = async ({ username, password, name, age, gender, educational_background }) => {
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: {
        data: {
          username: String(username).trim().toLowerCase(),
          name,
          age: age ?? null,
          gender: gender ?? null,
          educational_background: educational_background ?? null,
        },
      },
    });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    // Convenience: re-read profile after a self-update
    reloadProfile: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await refreshUser(session?.user ?? null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
