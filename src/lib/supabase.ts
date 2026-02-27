import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function getSupabaseConfigError(): string | null {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing.length ? `Missing required frontend env vars: ${missing.join(', ')}` : null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigError() === null;
}

let cachedDefaultClient: SupabaseClient | null = null;
const cachedTokenClients = new Map<string, SupabaseClient>();

function createConfiguredClient(accessToken?: string): SupabaseClient {
  // At this point we know they exist, but TS doesn't.
  const url = supabaseUrl as string;
  const key = supabaseAnonKey as string;
  if (accessToken) {
    return createClient(url, key, {
      global: { headers: { 'x-access-token': accessToken } },
    });
  }
  return createClient(url, key);
}

export const supabase: SupabaseClient = (() => {
  const err = getSupabaseConfigError();
  if (err) {
    // Avoid a hard crash (white page). App.tsx will render a config screen.
    // Any accidental usage will throw a clear error.
    return new Proxy(
      {},
      {
        get() {
          throw new Error(err);
        },
      }
    ) as unknown as SupabaseClient;
  }
  cachedDefaultClient = createConfiguredClient();
  return cachedDefaultClient;
})();

export const getSupabaseClient = (accessToken?: string) => {
  const err = getSupabaseConfigError();
  if (err) throw new Error(err);
  if (accessToken) {
    const cached = cachedTokenClients.get(accessToken);
    if (cached) return cached;
    const client = createConfiguredClient(accessToken);
    cachedTokenClients.set(accessToken, client);
    return client;
  }
  if (!cachedDefaultClient) cachedDefaultClient = createConfiguredClient();
  return cachedDefaultClient;
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
  projects?: Array<{ name: string | null; details: string | null }>;
  trainings?: string[];
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
