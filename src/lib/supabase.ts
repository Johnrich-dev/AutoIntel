import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined;

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

export const getSupabaseAdminClient = () => {
  // Use service role key if available — bypasses RLS for admin operations.
  if (supabaseServiceKey && supabaseUrl) {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  // Fall back to anon key — write operations will rely on RLS policies allowing authenticated users.
  // Ensure job_postings INSERT/UPDATE/DELETE policies exist in Supabase for this to work.
  return getSupabaseClient();
};

export interface Applicant {
  id: string;
  email: string;
  name: string;
  position: string;
  photo_url: string | null;
  access_token: string;
  access_expires_at: string;
  rules_accepted: boolean;
  rules_accepted_at: string | null;
  created_at: string;
  // New fields for recruitment workflow
  status?: string;
  screening_score?: number;
  screening_fit_category?: string;
  screening_status?: 'passed' | 'in_review' | 'failed' | 'not_scored';
  screening_stage?: string;
  screened_at?: string;
  // Component scores (from resume_scores table, joined or fetched separately)
  skills_score?: number | null;
  experience_score?: number | null;
  education_score?: number | null;
  projects_score?: number | null;
  traincert_score?: number | null;
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
  trainings?: Array<{ title: string | null; date: string | null }>;
  skills: {
    hard_skills: string[];
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
  // Transcription fields
  transcription?: string | null;
  transcription_status?: string | null;
  transcription_error?: string | null;
  transcribed_at?: string | null;
  transcription_segments?: Array<{
    start: number;
    end: number;
    text: string;
  }> | null;
  // Video scoring fields
  video_duration_seconds?: number | null;
  transcript_word_count?: number | null;
  transcript_score?: number | null;
  relevance_score?: number | null;
  experience_score?: number | null;
  skills_score?: number | null;
  completeness_score?: number | null;
  validation_status?: string | null;
  validation_message?: string | null;
  scored_at?: string | null;
}

export interface PersonalityTest {
  id: string;
  applicant_id: string;
  answers: Array<{ question: number; answer: number }>;
  essay: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  // Semantic scoring fields
  semantic_score?: number;
  dimension_scores?: Array<{ dimension: string; score: number; hybrid_score?: number; reasoning?: string }> | null;
  strong_areas?: string[];
  moderate_areas?: string[];
  development_areas?: string[];
  essay_insights?: string;
  scoring_method?: string;
  scored_at?: string;
}

export interface AdminAction {
  id: string;
  applicant_id: string;
  action_type: string;
  notes: string | null;
  created_at: string;
}

// ============================================================================
// AutoIntel Recruitment System Types
// ============================================================================

export interface JobPosting {
  job_id: string;
  title: string;
  description: string | null;
  department: string | null;
  skills: string[];
  keywords: string[];
  required_education: string[];
  expected_projects: string[];
  preferred_certifications: string[];
  min_years_experience: number | null;
  max_years_experience: number | null;
  source: 'dataset' | 'admin';
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoringSettings {
  settings_id: string;
  // Weights for 5 resume categories (achievements removed — no job posting basis)
  experience_weight: number;
  skills_weight: number;
  education_weight: number;
  projects_weight: number;
  traincert_weight: number;
  // Overall score weights (resume vs video vs profile fit)
  resume_weight: number;
  video_weight: number;
  profile_weight: number;
  // Resume formula split
  requirement_weight: number;
  count_weight: number;
  // Thresholds
  qualified_threshold: number;
  review_threshold: number;
  // Baselines for count scoring
  baseline_experience: number;
  baseline_skills: number;
  baseline_education: number;
  baseline_projects: number;
  baseline_traincert: number;
  // Scoring type (managed by backend, not user-editable)
  scoring_type: 'semantic' | 'hybrid';
  created_at: string;
  updated_at: string;
}

// Form input types for creating/updating jobs
export interface JobPostingFormData {
  title: string;
  description: string;
  department: string;
  skills: string[];
  keywords: string[];
  required_education: string[];
  expected_projects: string[];
  preferred_certifications: string[];
  min_years_experience: number | '';
  max_years_experience: number | '';
}

export interface AdminUserWithSettings {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
  // General Settings
  company_name: string;
  timezone: string;
  date_format: string;
  language: string;
  // Notification Settings
  email_new_applicant: boolean;
  email_assessment_complete: boolean;
  email_daily_digest: boolean;
  browser_notifications: boolean;
  slack_webhook: string | null;
  // Security Settings
  two_factor_auth: boolean;
  password_expiry: string;
  session_timeout: string;
  ip_whitelist: string | null;
  // Scoring Weights
  resume_weight: number;
  video_weight: number;
  profile_weight: number;
  auto_reject_threshold: number;
  auto_shortlist_threshold: number;
  // Appearance Settings
  theme: string;
  sidebar_collapsed: boolean;
  compact_view: boolean;
  // Advanced Settings
  data_retention: string;
  auto_archive: boolean;
  api_access: boolean;
  debug_mode: boolean;
}
