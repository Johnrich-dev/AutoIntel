import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  User,
  FileSpreadsheet,
  File as FilePdf,
  FileCode,
  Users,
  X,
  Award,
  Mail,
  Phone,
  Briefcase,
  Sparkles,
  Clock,
  XCircle,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData, ScoringSettings } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';
import { supabase } from '../lib/supabase';
import {
  calculateAlignmentScore,
  calculateDimensionScores,
  WorkStyleAnswer
} from '../config/workStyleConfig';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  resumeScore?: number;
  videoScore?: number | null;
  profileFit?: number;
  overall?: number;
  // status is inherited from Applicant: 'shortlisted' | 'final_interview' | 'rejected' | 'hired'
}

type SortField = 'name' | 'overall' | 'resume' | 'video' | 'profile' | 'date';
type SortDirection = 'asc' | 'desc';
type ExportFormat = 'pdf' | 'excel' | 'csv';

// ============================================================================
// Helper Functions
// ============================================================================

function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  settings_id: 'default',
  job_level: 'unified',
  experience_weight: 28,
  skills_weight: 30,
  education_weight: 18,
  projects_weight: 14,
  traincert_weight: 6,
  achievements_weight: 4,
  qualified_threshold: 78,
  review_threshold: 65,
  baseline_experience: 2,
  baseline_skills: 10,
  baseline_education: 2,
  baseline_projects: 2,
  baseline_traincert: 2,
  baseline_achievements: 1,
  scoring_type: 'hybrid',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function calculateResumeScore(applicant?: ApplicantWithDetails, settings?: ScoringSettings | null): number {
  if (applicant?.screening_score !== undefined && applicant?.screening_score !== null) {
    return Math.round(applicant.screening_score);
  }
  const resume = applicant?.resume;
  if (!resume || !resume.parsed_data) return 0;
  const parsed = getParsedResumeData(resume);
  if (!parsed) return 0;
  const config = settings || DEFAULT_SCORING_SETTINGS;
  const totalSkills = parsed.skills?.hard_skills?.length || 0;
  const skillsScore = Math.min((totalSkills / (config.baseline_skills || 20)) * 100, 100);
  const experienceScore = Math.min(((parsed.experience?.length || 0) / (config.baseline_experience || 5)) * 100, 100);
  // Prefer the stored education_score (requirement-match based) over count-based fallback
  const educationScore = (applicant?.education_score != null && applicant.education_score > 0)
    ? applicant.education_score
    : Math.min(((parsed.education?.length || 0) / (config.baseline_education || 3)) * 100, 100);
  const projectCount = parsed.projects?.length || 0;
  const projectsScore = projectCount >= config.baseline_projects
    ? Math.min((projectCount / config.baseline_projects) * 100, 100)
    : (projectCount / config.baseline_projects) * 50;
  return Math.min(Math.round(
    (skillsScore * (config.skills_weight / 100)) +
    (experienceScore * (config.experience_weight / 100)) +
    (educationScore * (config.education_weight / 100)) +
    (projectsScore * (config.projects_weight / 100))
  ), 100);
}

function calculateVideoScore(video?: VideoAssessment): number | null {
  if (!video) return null;
  if (video.transcript_score !== null && video.transcript_score !== undefined) {
    return Math.round(video.transcript_score * 10);
  }
  // Video exists but hasn't been scored yet — return null so it shows as Pending
  if (video.status === 'completed' || video.transcription_status === 'completed' || video.status === 'submitted') {
    return null;
  }
  return null;
}

function calculateProfileFit(test?: PersonalityTest, jobRole?: string): number {
  if (!test) return 0;
  // Accept both 'submitted' (saved but not yet scored) and 'completed' (scored by API)
  if (test.status !== 'submitted' && test.status !== 'completed') return 0;
  // Prefer the pre-computed semantic score stored by the scoring API
  if (typeof test.semantic_score === 'number' && test.semantic_score > 0) {
    return Math.round(test.semantic_score);
  }
  if (!test.answers || !Array.isArray(test.answers) || test.answers.length === 0) return 0;
  const answers: WorkStyleAnswer[] = test.answers.map((a) => ({
    question: a.question,
    answer: a.answer,
  }));
  const targetRole = jobRole || 'Backend Developer';
  const { score } = calculateAlignmentScore(calculateDimensionScores(answers), targetRole);
  return score;
}

function calculateOverallScore(
  resumeScore: number,
  videoScore: number | null,
  profileFit: number,
  weights?: { resume: number; video: number; profile: number }
): number {
  const w = weights ?? { resume: 50, video: 40, profile: 10 };
  // If video is pending, exclude it and redistribute its weight proportionally
  if (videoScore === null) {
    const nonVideoTotal = w.resume + w.profile;
    if (nonVideoTotal === 0) return 0;
    return Math.round(
      (resumeScore * (w.resume / nonVideoTotal)) +
      (profileFit * (w.profile / nonVideoTotal))
    );
  }
  const total = w.resume + w.video + w.profile;
  if (total === 0) return 0;
  return Math.round(
    (resumeScore * (w.resume / total)) +
    (videoScore * (w.video / total)) +
    (profileFit * (w.profile / total))
  );
}

function getDaysInStage(applicant: { created_at: string; screened_at?: string }): number {
  const ref = applicant.screened_at || applicant.created_at;
  return Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Sub-Components
// ============================================================================

function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1.5 text-base' };
  if (score === null) {
    return (
      <span className={`inline-flex items-center rounded-lg font-semibold text-gray-500 bg-gray-100 ${sizeClasses[size]}`}>
        Pending
      </span>
    );
  }
  let colorClass = 'text-gray-600 bg-gray-100';
  if (score >= 80) colorClass = 'text-emerald-700 bg-emerald-100';
  else if (score >= 60) colorClass = 'text-blue-700 bg-blue-100';
  else if (score >= 40) colorClass = 'text-amber-700 bg-amber-100';
  else if (score > 0) colorClass = 'text-red-700 bg-red-100';
  return (
    <span className={`inline-flex items-center rounded-lg font-semibold ${colorClass} ${sizeClasses[size]}`}>
      {score > 0 ? score : '-'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: React.ElementType; label: string }> = {
    shortlisted: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Star, label: 'Shortlisted' },
    final_interview: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle, label: 'Final Interview' },
  };
  const config = configs[status] || configs.shortlisted;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Quick Profile Panel Component
// ============================================================================

interface QuickProfilePanelProps {
  candidate: ApplicantWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onScheduleInterview?: (id: string) => void;
}

function buildAISummary(candidate: ApplicantWithDetails, parsedResume: ResumeParsedData | null, topSkills: string[]): string {
  const name = candidate.name.split(' ')[0];
  const resumeScore = candidate.resumeScore || 0;
  const videoScore = candidate.videoScore ?? null;
  const profileFit = candidate.profileFit || 0;
  const overall = candidate.overall || 0;

  const expCount = parsedResume?.experience?.length || 0;
  const eduList = parsedResume?.education || [];
  const highestEdu = eduList[0]?.course_or_strand || eduList[0]?.school || null;

  const strengthTier = overall >= 80 ? 'a strong' : overall >= 65 ? 'a solid' : 'a developing';
  const resumeTier = resumeScore >= 80 ? 'excellent' : resumeScore >= 65 ? 'good' : 'moderate';
  const videoNote = videoScore === null
    ? 'Video assessment is pending scoring.'
    : videoScore >= 70
    ? 'Video assessment reflects strong communication and articulation.'
    : videoScore >= 50
    ? 'Video assessment shows adequate communication skills.'
    : '';
  const profileNote = profileFit >= 70
    ? `Work style profile aligns well with the ${candidate.position} role.`
    : profileFit >= 50
    ? `Work style profile shows partial alignment with the ${candidate.position} role.`
    : '';

  const expNote = expCount >= 3
    ? `${expCount} work experience entries on record.`
    : expCount === 1
    ? '1 work experience entry on record.'
    : 'No prior work experience listed.';

  const eduNote = highestEdu ? `Educational background includes ${highestEdu}.` : '';
  const skillNote = topSkills.length > 0
    ? `Key skills include ${topSkills.slice(0, 3).join(', ')}.`
    : '';

  return [
    `${name} presents ${strengthTier} overall profile with a score of ${overall}/100.`,
    `Resume match is ${resumeTier} at ${resumeScore}/100. ${expNote}`,
    eduNote,
    skillNote,
    videoNote,
    profileNote,
  ].filter(Boolean).join(' ');
}

function RejectConfirmDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Remove from Shortlist?</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          You are about to reject <span className="font-medium text-gray-700">{name}</span> from the shortlist.
        </p>
        <p className="text-xs text-gray-400 text-center mb-5">
          This candidate will be marked as rejected and removed from the active pipeline. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Reject Candidate
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickProfilePanel({ candidate, isOpen, onClose, onStatusChange, onScheduleInterview }: QuickProfilePanelProps) {
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showFinalInterviewConfirm, setShowFinalInterviewConfirm] = useState(false);

  if (!candidate || !isOpen) return null;

  const parsedResume = getParsedResumeData(candidate.resume);

  // Extract skills — handle both old format and NER format
  let topSkills: string[] = [];
  if (parsedResume?.skills) {
    const skills = parsedResume.skills as { hard_skills?: string[]; all?: string[] } & Record<string, string | string[]>;
    if (skills.hard_skills && Array.isArray(skills.hard_skills)) {
      topSkills = skills.hard_skills.slice(0, 8);
    } else if (skills.all && Array.isArray(skills.all)) {
      topSkills = skills.all.slice(0, 8);
    } else if (typeof skills === 'object') {
      const allSkills: string[] = [];
      Object.values(skills as Record<string, string | string[]>).forEach((value) => {
        if (typeof value === 'string') allSkills.push(...value.split(',').map((s) => s.trim()));
        else if (Array.isArray(value)) allSkills.push(...value);
      });
      topSkills = allSkills.slice(0, 8);
    }
  }

  const aiSummary = buildAISummary(candidate, parsedResume, topSkills);
  // Days since shortlisted: use screened_at if available, otherwise created_at
  const stageRef = candidate.screened_at || candidate.created_at;
  const daysInStage = Math.floor((Date.now() - new Date(stageRef).getTime()) / (1000 * 60 * 60 * 24));
  const stageLabel = candidate.screened_at ? 'days since screened' : 'days since applied';

  return (
    <>
      {showRejectConfirm && (
        <RejectConfirmDialog
          name={candidate.name}
          onConfirm={() => { setShowRejectConfirm(false); onStatusChange(candidate.id, 'rejected'); }}
          onCancel={() => setShowRejectConfirm(false)}
        />
      )}

      {/* Final Interview Confirmation */}
      {showFinalInterviewConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Advance to Final Interview?</h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              You are about to move <span className="font-medium text-gray-700">{candidate.name}</span> to the Final Interview stage.
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              This candidate will be marked as ready for final interview scheduling. Ensure all assessments have been reviewed before proceeding.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinalInterviewConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowFinalInterviewConfirm(false); onStatusChange(candidate.id, 'final_interview'); }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Advance to Final Interview
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            {candidate.photo_url ? (
              <img src={candidate.photo_url} alt={candidate.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-blue-600" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{candidate.name}</h2>
            <p className="text-sm text-gray-500">{candidate.position}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Score Banner */}
      <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{candidate.overall}</div>
              <div className="text-xs text-blue-100">Overall Score</div>
            </div>
            <div className="h-12 w-px bg-blue-400/50" />
            <div className="flex gap-4 text-sm">
              <div><span className="text-blue-200">Resume:</span> <span className="font-semibold">{candidate.resumeScore}</span></div>
              <div><span className="text-blue-200">Video:</span> <span className="font-semibold">{candidate.videoScore ?? 'Pending'}</span></div>
              <div><span className="text-blue-200">Profile:</span> <span className="font-semibold">{candidate.profileFit}</span></div>
            </div>
          </div>
          <StatusBadge status={candidate.status || 'shortlisted'} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">AI-Generated Summary</h3>
              </div>
              <p className="text-sm text-blue-800 leading-relaxed">{aiSummary}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {topSkills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full font-medium">{skill}</span>
                ))}
                {topSkills.length === 0 && <span className="text-sm text-gray-400">No skills extracted</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`mailto:${candidate.email}`} className="text-sm text-blue-600 hover:underline truncate">{candidate.email}</a>
              </div>
              {parsedResume?.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{parsedResume.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">Applied {new Date(candidate.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">{daysInStage}d {stageLabel}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" />
                Recent Experience
              </h3>
              {parsedResume?.experience?.slice(0, 2).map((exp, idx) => (
                <div key={idx} className="border-l-2 border-blue-200 pl-4 py-1">
                  <p className="font-medium text-gray-900">{exp.role}</p>
                  <p className="text-sm text-gray-600">{exp.company}</p>
                  <p className="text-xs text-gray-400">{exp.years}</p>
                </div>
              ))}
              {!parsedResume?.experience?.length && <p className="text-sm text-gray-400">No experience data available</p>}
            </div>
          </div>

      </div>

      {/* Action Footer */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3">
        {candidate.status === 'final_interview' ? (
          <>
            <button
              onClick={() => onScheduleInterview?.(candidate.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Calendar className="w-4 h-4" />
              Schedule Interview
            </button>
            <button
              onClick={() => onStatusChange(candidate.id, 'shortlisted')}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
            >
              Move Back
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setShowFinalInterviewConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <CheckCircle className="w-4 h-4" />
              Move to Final Interview
            </button>
            <button
              onClick={() => setShowRejectConfirm(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-medium"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );
}

// ============================================================================
// Export Modal Component
// ============================================================================

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  candidateCount: number;
}

function ExportModal({ isOpen, onClose, onExport, candidateCount }: ExportModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Export Shortlist</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-6">Export {candidateCount} shortlisted candidates to your preferred format.</p>
        <div className="space-y-3">
          <button onClick={() => onExport('pdf')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <FilePdf className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as PDF</div>
              <div className="text-sm text-gray-500">Formatted report with all details</div>
            </div>
          </button>
          <button onClick={() => onExport('excel')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as Excel</div>
              <div className="text-sm text-gray-500">Spreadsheet with all candidate data</div>
            </div>
          </button>
          <button onClick={() => onExport('csv')} className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <FileCode className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as CSV</div>
              <div className="text-sm text-gray-500">Simple data format for import</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ShortlistedCandidatesProps {
  applicants?: ApplicantWithDetails[];
  onNavigateToInterview?: (applicantId: string) => void;
  onApplicantStatusChanged?: () => void;
}

export function ShortlistedCandidates({ applicants: externalApplicants, onNavigateToInterview, onApplicantStatusChanged }: ShortlistedCandidatesProps) {
  const [applicants, setApplicants] = useState<ApplicantWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Pipeline stage filter: 'all' | 'shortlisted' | 'final_interview'
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<ApplicantWithDetails | null>(null);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings | null>(null);
  const [overallWeights, setOverallWeights] = useState<{ resume: number; video: number; profile: number }>({ resume: 50, video: 40, profile: 10 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Departments fetched from job_postings
  const [departments, setDepartments] = useState<string[]>([]);
  // Maps job title → department for filtering (e.g. "Data Engineer" → "MIS / IT")
  const [jobDepartmentMap, setJobDepartmentMap] = useState<Record<string, string>>({});
  const itemsPerPage = 10;

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data: settingsData } = await supabase
        .from('scoring_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (settingsData) setScoringSettings(settingsData);

      // Read overall score weights from scoring_settings
      if (settingsData) {
        setOverallWeights({
          resume: settingsData.resume_weight ?? 50,
          video: settingsData.video_weight ?? 40,
          profile: settingsData.profile_weight ?? 10,
        });
      }

      const { data: jobsData } = await supabase
        .from('job_postings')
        .select('title, department')
        .eq('is_active', true);
      if (jobsData) {
        const depts = Array.from(new Set(jobsData.map((j) => j.department).filter(Boolean))) as string[];
        setDepartments(depts.sort());
        const map: Record<string, string> = {};
        jobsData.forEach((j) => {
          if (j.title && j.department) map[j.title.toLowerCase()] = j.department;
        });
        setJobDepartmentMap(map);
      }

      if (externalApplicants) {
        setApplicants(externalApplicants);
      } else {
        const { data: applicantsData } = await supabase
          .from('applicants')
          .select('*')
          .in('status', ['shortlisted', 'final_interview'])
          .order('created_at', { ascending: false });

        if (applicantsData) {
          const applicantsWithDetails = await Promise.all(
            applicantsData.map(async (applicant) => {
              const [resumeResult, videoResult, testResult] = await Promise.all([
                supabase.from('resumes').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                supabase.from('video_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                supabase.from('work_style_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
              ]);
              return {
                ...applicant,
                resume: resumeResult.data || undefined,
                video: videoResult.data || undefined,
                test: testResult.data || undefined,
              };
            })
          );
          setApplicants(applicantsWithDetails);
        }
      }
    } catch (err) {
      console.error('Error initializing:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [externalApplicants]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute scores for each applicant
  const processedApplicants = useMemo(() => {
    return applicants.map((applicant) => {
      const resumeScore = calculateResumeScore(applicant, scoringSettings);
      const videoScore = calculateVideoScore(applicant.video);
      const profileFit = calculateProfileFit(applicant.test, applicant.position);
      const overall = calculateOverallScore(resumeScore, videoScore, profileFit, overallWeights);
      const status = applicant.status || 'shortlisted';
      return { ...applicant, resumeScore, videoScore, profileFit, overall, status };
    }).filter(a => a.status === 'shortlisted' || a.status === 'final_interview');
  }, [applicants, scoringSettings, overallWeights]);

  // Derive department from position by matching job_postings (best-effort via position string)
  // We use position as a proxy for department label when no direct mapping exists
  const filteredApplicants = useMemo(() => {
    let result = processedApplicants;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.position.toLowerCase().includes(q)
      );
    }

    // Pipeline stage filter
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }

    // Department filter — match applicant.position against department via job_postings lookup
    // Uses partial matching so "Data Engineer" matches even if casing differs
    if (departmentFilter !== 'all') {
      result = result.filter(a => {
        const pos = a.position?.toLowerCase() || '';
        // exact match first
        if (jobDepartmentMap[pos] === departmentFilter) return true;
        // partial match: check if any job title that belongs to this dept is contained in the position
        return Object.entries(jobDepartmentMap).some(
          ([title, dept]) => dept === departmentFilter && pos.includes(title)
        );
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'overall': cmp = (a.overall || 0) - (b.overall || 0); break;
        case 'resume': cmp = (a.resumeScore || 0) - (b.resumeScore || 0); break;
        case 'video': cmp = (a.videoScore || 0) - (b.videoScore || 0); break;
        case 'profile': cmp = (a.profileFit || 0) - (b.profileFit || 0); break;
        case 'date': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [processedApplicants, searchQuery, statusFilter, departmentFilter, sortField, sortDirection, jobDepartmentMap]);

  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
    setCurrentPage(1);
  };

  // Update applicant pipeline stage (shortlisted → final_interview)
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('applicants')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { console.error('Error updating applicant status:', error); return; }

      setApplicants(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      if (selectedCandidate?.id === id) {
        setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null);
      }

      onApplicantStatusChanged?.();

      // Don't navigate away — HR stays in the list to continue reviewing
      // onNavigateToInterview is only called if HR explicitly wants to go schedule
    } catch (err) {
      console.error('Error updating status:', err);
    }
  }, [selectedCandidate, onApplicantStatusChanged]);

  const handleExport = (format: ExportFormat) => {
    const data = filteredApplicants;
    if (format === 'csv') exportToCSV(data);
    else if (format === 'excel') exportToExcel(data);
    else exportToPDF(data);
    setIsExportOpen(false);
  };

  const exportToCSV = (data: ApplicantWithDetails[]) => {
    const headers = ['Name', 'Email', 'Position', 'Education', 'Resume Score', 'Video Score', 'Profile Fit', 'Overall', 'Status', 'Applied', 'Days in Stage'];
    const rows = data.map(a => {
      const edu = getParsedResumeData(a.resume)?.education?.[0]?.course_or_strand || '';
      return [a.name, a.email, a.position, edu, a.resumeScore, a.videoScore, a.profileFit, a.overall, a.status, new Date(a.created_at).toLocaleDateString(), getDaysInStage(a)];
    });
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'shortlisted-candidates.csv', 'text/csv');
  };

  const exportToExcel = (data: ApplicantWithDetails[]) => {
    const html = `<table><tr><th>Name</th><th>Email</th><th>Position</th><th>Education</th><th>Resume</th><th>Video</th><th>Profile Fit</th><th>Overall</th><th>Status</th><th>Applied</th><th>Days in Stage</th></tr>${data.map(a => {
      const edu = getParsedResumeData(a.resume)?.education?.[0]?.course_or_strand || '';
      return `<tr><td>${a.name}</td><td>${a.email}</td><td>${a.position}</td><td>${edu}</td><td>${a.resumeScore}</td><td>${a.videoScore}</td><td>${a.profileFit}</td><td>${a.overall}</td><td>${a.status}</td><td>${new Date(a.created_at).toLocaleDateString()}</td><td>${getDaysInStage(a)}</td></tr>`;
    }).join('')}</table>`;
    downloadFile(html, 'shortlisted-candidates.xls', 'application/vnd.ms-excel');
  };

  const exportToPDF = (data: ApplicantWithDetails[]) => {
    const html = `<!DOCTYPE html><html><head><title>Shortlisted Candidates</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>Shortlisted Candidates Report</h1><p>Generated on ${new Date().toLocaleDateString()}</p><table><tr><th>Name</th><th>Position</th><th>Education</th><th>Overall</th><th>Status</th><th>Applied</th><th>Days in Stage</th></tr>${data.map(a => {
      const edu = getParsedResumeData(a.resume)?.education?.[0]?.course_or_strand || '-';
      return `<tr><td>${a.name}</td><td>${a.position}</td><td>${edu}</td><td>${a.overall}</td><td>${a.status}</td><td>${new Date(a.created_at).toLocaleDateString()}</td><td>${getDaysInStage(a)}</td></tr>`;
    }).join('')}</table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  // Track which candidates HR has already opened this session
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const openProfilePanel = (candidate: ApplicantWithDetails) => {
    setSelectedCandidate(candidate);
    setIsProfilePanelOpen(true);
    setReviewedIds(prev => new Set(prev).add(candidate.id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading shortlisted candidates...</div>
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)
      : null;

  return (
    <div className="min-h-screen bg-slate-50 p-8 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shortlisted Candidates</h1>
            <p className="text-gray-600 mt-1">Review and manage top candidates for final interview selection</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2.5 sm:px-4 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-60"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => setIsExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards — workflow-based only */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Active', value: processedApplicants.length, icon: Users, color: 'blue' },
          { label: 'Shortlisted', value: processedApplicants.filter(a => a.status === 'shortlisted').length, icon: Star, color: 'purple' },
          { label: 'Final Interview', value: processedApplicants.filter(a => a.status === 'final_interview').length, icon: CheckCircle, color: 'emerald' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 bg-${stat.color}-100 rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline Stage Filter Chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[
          { value: 'all', label: 'All', count: processedApplicants.length },
          { value: 'shortlisted', label: 'Shortlisted', count: processedApplicants.filter(a => a.status === 'shortlisted').length },
          { value: 'final_interview', label: 'Final Interview', count: processedApplicants.filter(a => a.status === 'final_interview').length },
        ].map(chip => (
          <button
            key={chip.value}
            onClick={() => { setStatusFilter(chip.value); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              statusFilter === chip.value
                ? chip.value === 'all' ? 'bg-gray-900 text-white'
                  : chip.value === 'shortlisted' ? 'bg-purple-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {chip.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusFilter === chip.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search candidate name, email, or position..."
              className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Department filter */}
          <FilterDropdown
            value={departmentFilter}
            onChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All Departments' },
              ...departments.map(dept => ({ value: dept, label: dept }))
            ]}
            width="w-full sm:w-52"
          />

          {/* Status filter */}
          <FilterDropdown
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'shortlisted', label: 'Shortlisted' },
              { value: 'final_interview', label: 'Final Interview' },
            ]}
            width="w-full sm:w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th onClick={() => handleSort('name')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center gap-1">Candidate <SortIcon field="name" /></div>
                </th>
                <th onClick={() => handleSort('resume')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Resume <SortIcon field="resume" /></div>
                </th>
                <th onClick={() => handleSort('video')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Video <SortIcon field="video" /></div>
                </th>
                <th onClick={() => handleSort('profile')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Profile Fit <SortIcon field="profile" /></div>
                </th>
                <th onClick={() => handleSort('overall')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Overall <SortIcon field="overall" /></div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th onClick={() => handleSort('date')} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center justify-center gap-1">Applied <SortIcon field="date" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedApplicants.map((applicant) => (
                <tr
                  key={applicant.id}
                  className={`cursor-pointer transition-colors ${
                    reviewedIds.has(applicant.id) ? 'bg-gray-50 hover:bg-blue-50' : 'hover:bg-blue-50'
                  }`}
                  onClick={() => openProfilePanel(applicant)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          {applicant.photo_url
                            ? <img src={applicant.photo_url} alt={applicant.name} className="w-10 h-10 rounded-full object-cover" />
                            : <User className="w-5 h-5 text-blue-600" />}
                        </div>
                        {reviewedIds.has(applicant.id) && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" title="Reviewed" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{applicant.name}</div>
                        <div className="text-sm text-gray-500">{applicant.position}</div>
                        {(() => {
                          const parsed = getParsedResumeData(applicant.resume);
                          const edu = parsed?.education?.[0];
                          return edu?.course_or_strand
                            ? <div className="text-xs text-gray-400 mt-0.5">{edu.course_or_strand}</div>
                            : null;
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.resumeScore ?? 0} /></td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.videoScore ?? null} /></td>
                  <td className="px-4 py-4 text-center"><ScoreBadge score={applicant.profileFit ?? 0} /></td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold">{applicant.overall}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={applicant.status || 'shortlisted'} />
                      {applicant.status === 'final_interview' && (
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Ready to schedule
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="text-sm text-gray-600">{new Date(applicant.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {getDaysInStage(applicant)}d in stage
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedApplicants.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <Users className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No candidates found</p>
                      <p className="text-sm text-gray-400">Try adjusting your filters or search query</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} candidates
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${currentPage === page ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {page}
                </button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Panels */}
      {selectedCandidate && (
        <QuickProfilePanel
          candidate={selectedCandidate}
          isOpen={isProfilePanelOpen}
          onClose={() => setIsProfilePanelOpen(false)}
          onStatusChange={handleStatusChange}
          onScheduleInterview={(id) => { setIsProfilePanelOpen(false); onNavigateToInterview?.(id); }}
        />
      )}

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
        candidateCount={filteredApplicants.length}
      />

      {isProfilePanelOpen && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setIsProfilePanelOpen(false)} />
      )}
    </div>
  );
}

export default ShortlistedCandidates;
