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
  raw_extracted_content: string | null;
  parsed_data: ResumeParsedData | string | null;
  ner_status: string | null;
}

export interface ResumeParsedData {
  name: string | null;
  email: string | null;
  phone: string | null;
  education: Array<{ year_range: string | null; school: string | null; course_or_strand: string | null; education_type: string | null; raw_text: string }>;
  experience: Array<{ company: string | null; role: string | null; years: string | null; summary: string | null; raw_text: string }>;
  skills: {
    hard_skills: string[];
    soft_skills: string[];
    all: string[];
  };
  parsed_at: string;
  error?: string;
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
