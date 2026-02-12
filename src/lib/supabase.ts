import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSupabaseClient = (accessToken?: string) => {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { 'x-access-token': accessToken } }
    });
  }
  return supabase;
};

export interface Applicant {
  id: string;
  email: string;
  name: string;
  position: string;
  access_token: string;
  access_expires_at: string;
  rules_accepted: boolean;
  rules_accepted_at: string | null;
  created_at: string;
}

export interface Resume {
  id: string;
  applicant_id: string;
  resume_url: string | null;
  status: string;
  uploaded_at: string;
}

export interface VideoAssessment {
  id: string;
  applicant_id: string;
  video_url: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

export interface PersonalityTest {
  id: string;
  applicant_id: string;
  answers: Array<{ question: number; answer: number }>;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

export interface AdminAction {
  id: string;
  applicant_id: string;
  action_type: string;
  notes: string | null;
  created_at: string;
}
