import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Applicant, supabase } from '../lib/supabase';

interface AuthContextType {
  applicant: Applicant | null;
  accessToken: string | null;
  loading: boolean;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  updateApplicant: (updates: Partial<Applicant>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    () => localStorage.getItem('sentinel_access_token')
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accessToken) {
      loadApplicant(accessToken);
    } else {
      setLoading(false);
    }
  }, [accessToken]);

  const loadApplicant = async (token: string) => {
    try {
      // Use default Supabase client since access_token is a custom token, not a JWT
      const { data, error } = await supabase
        .from('applicants')
        .select('*')
        .eq('access_token', token)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const expiresAt = new Date(data.access_expires_at);
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

  const login = async (token: string): Promise<boolean> => {
    setLoading(true);
    console.log('Attempting login with token:', token);
    try {
      // Use default Supabase client since access_token is a custom token, not a JWT
      const { data, error } = await supabase
        .from('applicants')
        .select('*')
        .eq('access_token', token)
        .maybeSingle();

      console.log('Query result - data:', data, 'error:', error);

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
        console.log('No applicant found with this token');
      }

      setLoading(false);
      return false;
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    setApplicant(null);
    setAccessToken(null);
    localStorage.removeItem('sentinel_access_token');
  };

  const updateApplicant = (updates: Partial<Applicant>) => {
    if (applicant) {
      setApplicant({ ...applicant, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{ applicant, accessToken, loading, login, logout, updateApplicant }}>
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
