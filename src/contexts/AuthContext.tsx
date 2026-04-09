import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Applicant, getSupabaseClient, getSupabaseAdminClient, supabase } from '../lib/supabase';

interface AdminSession {
  access_token: string;
  expires_at: number;
  user_id: string;
  email: string | null;
}

interface AuthContextType {
  applicant: Applicant | null;
  adminSession: AdminSession | null;
  isAdminAuthenticated: boolean;
  accessToken: string | null;
  loading: boolean;
  userType: 'applicant' | 'admin' | null;
  login: (token: string, email: string) => Promise<boolean>;
  adminLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  adminLogout: () => void;
  updateApplicant: (updates: Partial<Applicant>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    () => {
      // Check for applicant token
      const token = localStorage.getItem('sentinel_access_token');
      if (token) return token;
      // Check for admin session
      const adminData = localStorage.getItem('admin_session');
      if (adminData) {
        try {
          const parsed = JSON.parse(adminData);
          if (parsed.expires_at * 1000 > Date.now()) {
            return parsed.access_token;
          }
        } catch {
          // Invalid session data
        }
      }
      return null;
    }
  );
  const [loading, setLoading] = useState(true);

  // ── Idle session timeout ──────────────────────────────────────────────────
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };

  const resetIdleTimer = (timeoutMinutes: number) => {
    clearIdleTimer();
    if (timeoutMinutes <= 0) return;
    idleTimer.current = setTimeout(() => {
      // Auto-logout on idle
      setAdminSession(null);
      setAccessToken(null);
      localStorage.removeItem('admin_session');
      supabase.auth.signOut();
    }, timeoutMinutes * 60 * 1000);
  };

  // Start/restart idle timer whenever admin session is active
  useEffect(() => {
    if (!adminSession) { clearIdleTimer(); return; }

    const loadTimeout = async () => {
      try {
        const { data } = await getSupabaseAdminClient()
          .from('admin_users')
          .select('session_timeout')
          .eq('id', adminSession.user_id)
          .maybeSingle();
        const minutes = parseInt(data?.session_timeout || '30', 10);
        resetIdleTimer(minutes);

        const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
        const handler = () => resetIdleTimer(minutes);
        events.forEach(e => window.addEventListener(e, handler, { passive: true }));

        // Listen for settings changes (fired by AdminSettings on save)
        const onSettingsChange = (e: Event) => {
          const newMinutes = parseInt((e as CustomEvent).detail?.sessionTimeout || '30', 10);
          resetIdleTimer(newMinutes);
          events.forEach(ev => window.removeEventListener(ev, handler));
          events.forEach(ev => window.addEventListener(ev, () => resetIdleTimer(newMinutes), { passive: true }));
        };
        window.addEventListener('autointel:settings-saved', onSettingsChange);

        return () => {
          events.forEach(e => window.removeEventListener(e, handler));
          window.removeEventListener('autointel:settings-saved', onSettingsChange);
          clearIdleTimer();
        };
      } catch {
        resetIdleTimer(30); // fallback
      }
    };

    let cleanup: (() => void) | undefined;
    loadTimeout().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [adminSession?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (accessToken) {
      // Check if it's an admin session or applicant token
      const adminData = localStorage.getItem('admin_session');
      if (adminData) {
        try {
          const parsed = JSON.parse(adminData);
          if (parsed.access_token === accessToken && parsed.expires_at * 1000 > Date.now()) {
            setAdminSession(parsed);
            setLoading(false);
            return;
          }
        } catch {
          // Invalid session
        }
      }
      // It's an applicant token
      loadApplicant(accessToken);
    } else {
      setLoading(false);
    }
  }, [accessToken]);

  const loadApplicant = async (token: string) => {
    try {
      const client = getSupabaseClient(token);
      const { data, error } = await client
        .from('applicants')
        .select('*')
        .eq('access_token', token)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const expiresAt = new Date(data.access_expires_at);
        console.log('Loaded applicant data:', data);
        if (expiresAt > new Date()) {
          setApplicant(data);
        } else {
          localStorage.removeItem('sentinel_access_token');
          setAccessToken(null);
        }
      } else {
        localStorage.removeItem('sentinel_access_token');
        setAccessToken(null);
      }
    } catch (error) {
      console.error('Error loading applicant:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (token: string, email: string): Promise<boolean> => {
    setLoading(true);
    console.log('[Login] Attempting login with token:', token, 'email:', email);
    try {
      const client = getSupabaseClient(token);
      const { data, error } = await client
        .from('applicants')
        .select('*')
        .eq('access_token', token)
        .eq('email', email)
        .maybeSingle();

      console.log('[Login] Query result - data:', data, 'error:', error);

      if (error) throw error;

      if (data) {
        const expiresAt = new Date(data.access_expires_at);
        console.log('Token expires at:', expiresAt, 'Current time:', new Date());
        if (expiresAt > new Date()) {
          setApplicant(data);
          setAccessToken(token);
          localStorage.setItem('sentinel_access_token', token);
          setLoading(false);
          console.log('Login successful!');
          return true;
        } else {
          console.log('Token has expired');
        }
      } else {
        console.log('No applicant found with this email and token');
      }

      setLoading(false);
      return false;
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
      return false;
    }
  };

  const adminLogin = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    console.log('=== ADMIN LOGIN START ===');
    console.log('Email:', email);
    console.log('Password:', password);
    
    try {
      // First try the RPC function
      console.log('Trying RPC function...');
      const { data: rpcData, error: rpcError } = await supabase.rpc('verify_admin_password', {
        email_param: email.trim(),
        password_param: password,
      });

      console.log('RPC response:');
      console.log('  data:', JSON.stringify(rpcData));
      console.log('  error:', rpcError);

      let adminUser = null;
      
      if (rpcError) {
        console.log('RPC failed, trying direct query...');
        // Fallback: direct query
        const { data: queryData, error: queryError } = await supabase
          .from('admin_users')
          .select('id, email, name, role')
          .eq('email', email.trim())
          .eq('password_hash', password)
          .single();
        
        console.log('Direct query response:');
        console.log('  data:', JSON.stringify(queryData));
        console.log('  error:', queryError);
        
        if (queryError) {
          console.error('Direct query error:', queryError);
        } else {
          adminUser = queryData;
        }
      } else if (rpcData && rpcData.length > 0) {
        console.log('RPC returned data, using first result');
        adminUser = rpcData[0];
      } else {
        console.log('RPC returned no data');
      }

      if (adminUser) {
        console.log('Admin user found!', adminUser);

        // ── Password expiry check ───────────────────────────────────────────
        try {
          const { data: secData } = await getSupabaseAdminClient()
            .from('admin_users')
            .select('password_expiry, last_login_at')
            .eq('id', adminUser.id)
            .maybeSingle();

          if (secData) {
            const expiry = secData.password_expiry;
            const lastLogin = secData.last_login_at;

            if (expiry && expiry !== 'never' && lastLogin) {
              const expiryDays = parseInt(expiry, 10);
              const daysSinceLogin = Math.floor(
                (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSinceLogin >= expiryDays) {
                setLoading(false);
                return {
                  success: false,
                  error: `Your password expired ${daysSinceLogin} days ago (policy: every ${expiryDays} days). Please contact your system administrator to reset it.`,
                };
              }
            }
          }
        } catch (secErr) {
          console.warn('Could not check password expiry:', secErr);
        }

        // ── Update last_login_at ────────────────────────────────────────────
        try {
          await getSupabaseAdminClient()
            .from('admin_users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', adminUser.id);
        } catch (e) {
          console.warn('Could not update last_login_at:', e);
        }

        const adminSession: AdminSession = {
          access_token: `admin_${adminUser.id}_${Date.now()}`,
          expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          user_id: adminUser.id,
          email: adminUser.email,
        };
        setAdminSession(adminSession);
        setAccessToken(adminSession.access_token);
        localStorage.setItem('admin_session', JSON.stringify(adminSession));
        
        console.log('Admin login successful!');
        console.log('=== ADMIN LOGIN END ===');
        setLoading(false);
        return { success: true };
      }

      console.log('No admin user found - credentials invalid');
      console.log('=== ADMIN LOGIN END ===');
      setLoading(false);
      return { success: false, error: 'Invalid email or password' };
    } catch (error: unknown) {
      console.error('Admin login EXCEPTION:', error);
      console.log('=== ADMIN LOGIN END (error) ===');
      setLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const logout = () => {
    setApplicant(null);
    setAccessToken(null);
    localStorage.removeItem('sentinel_access_token');
    // Note: intentionally keep rules_accepted_<token> in localStorage
    // so returning applicants on the same token don't see rules again
    // even if the DB update was blocked by RLS.
  };

  const adminLogout = () => {
    setAdminSession(null);
    setAccessToken(null);
    localStorage.removeItem('admin_session');
    // Sign out from Supabase auth
    supabase.auth.signOut();
  };

  const updateApplicant = (updates: Partial<Applicant>) => {
    if (applicant) {
      setApplicant({ ...applicant, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{
      applicant,
      adminSession,
      isAdminAuthenticated: !!adminSession,
      accessToken,
      loading,
      userType: adminSession ? 'admin' : applicant ? 'applicant' : null,
      login,
      adminLogin,
      logout,
      adminLogout,
      updateApplicant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
