import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Applicant, getSupabaseClient, supabase } from '../lib/supabase';

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
        } catch (e) {
          // Invalid session data
        }
      }
      return null;
    }
  );
  const [loading, setLoading] = useState(true);

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
        } catch (e) {
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
    } catch (error: any) {
      console.error('Admin login EXCEPTION:', error);
      console.log('=== ADMIN LOGIN END (error) ===');
      setLoading(false);
      return { success: false, error: error.message || 'Login failed' };
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
