import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  CheckSquare,
  Square,
  Download,
  FileText,
  Video,
  Star,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  User,
  ThumbsUp,
  MessageSquare,
  FileSpreadsheet,
  File as FilePdf,
  FileCode,
  Users,
  X,
  Play,
  ClipboardList,
  Award,
  TrendingUp,
  BarChart3,
  Save,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  GraduationCap,
  Sparkles
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData, ScoringSettings } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { 
  getWorkStyleResult, 
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
  videoScore?: number;
  profileFit?: number;
  overall?: number;
  status?: string;
  recommendation?: 'highly_recommended' | 'recommended' | 'needs_review';
  notes?: CandidateNote[];
}

interface CandidateNote {
  id: string;
  text: string;
  createdAt: string;
  author: string;
}

interface ComparisonCandidate {
  id: string;
  name: string;
  resumeScore: number;
  videoScore: number;
  profileFit: number;
  overall: number;
  recommendation?: string;
  skills: string[];
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
  job_level: 'entry_level',
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
  // Use backend screening_score if available (combined semantic + count)
  if (applicant?.screening_score !== undefined && applicant?.screening_score !== null) {
    return applicant.screening_score;
  }
  
  // Fallback to count-based calculation if no screening_score
  const resume = applicant?.resume;
  if (!resume || !resume.parsed_data) return 0;
  const parsed = getParsedResumeData(resume);
  if (!parsed) return 0;
  
  const config = settings || DEFAULT_SCORING_SETTINGS;
  
  let skillsScore = 0;
  let experienceScore = 0;
  let educationScore = 0;
  let projectsScore = 0;
  
  const totalSkills = (parsed.skills?.hard_skills?.length || 0) + (parsed.skills?.soft_skills?.length || 0);
  skillsScore = Math.min((totalSkills / 20) * 100, 100);
  
  experienceScore = Math.min(((parsed.experience?.length || 0) / 5) * 100, 100);
  educationScore = Math.min(((parsed.education?.length || 0) / 3) * 100, 100);
  
  const projectCount = parsed.projects?.length || 0;
  projectsScore = projectCount >= config.baseline_projects
    ? Math.min((projectCount / config.baseline_projects) * 100, 100)
    : (projectCount / config.baseline_projects) * 50;
  
  const weightedScore = (
    (skillsScore * (config.skills_weight / 100)) +
    (experienceScore * (config.experience_weight / 100)) +
    (educationScore * (config.education_weight / 100)) +
    (projectsScore * (config.projects_weight / 100))
  );
  
  return Math.min(Math.round(weightedScore), 100);
}

function calculateVideoScore(video?: VideoAssessment): number {
  if (!video) return 0;
  
  // If there's a real transcript score, use it (scaled to 100)
  if (video.transcript_score !== null && video.transcript_score !== undefined) {
    // transcript_score is 0-10, convert to 0-100
    return Math.round(video.transcript_score * 10);
  }
  
  // Fallback: score based on status if no transcript score yet
  if (video.status === 'completed' || video.transcription_status === 'completed') {
    return 50;
  }
  if (video.status === 'submitted') return 30;
  return 0;
}

function calculateProfileFit(test?: PersonalityTest, jobRole?: string): number {
  if (!test || test.status !== 'submitted') return 0;
  if (!test.answers || !Array.isArray(test.answers) || test.answers.length === 0) return 0;
  
  // Convert answers to WorkStyleAnswer format
  const answers: WorkStyleAnswer[] = test.answers.map((a: any) => ({
    question: a.question,
    answer: a.answer,
  }));
  
  // Default to 'Backend Developer' if no job role specified
  const targetRole = jobRole || 'Backend Developer';
  
  // Calculate alignment score using the new config
  const { score } = calculateAlignmentScore(
    calculateDimensionScores(answers),
    targetRole
  );
  
  return score;
}

function calculateOverallScore(resumeScore: number, videoScore: number, profileFit: number): number {
  const weights = { resume: 0.5, video: 0.4, profile: 0.1 };
  const score = (resumeScore * weights.resume) + (videoScore * weights.video) + (profileFit * weights.profile);
  return Math.round(score);
}

function getRecommendation(overall: number, resumeScore: number): 'highly_recommended' | 'recommended' | 'needs_review' {
  if (overall >= 85 && resumeScore >= 80) return 'highly_recommended';
  if (overall >= 70) return 'recommended';
  return 'needs_review';
}

function getRecommendationLabel(recommendation: string): { text: string; color: string; icon: React.ElementType } {
  switch (recommendation) {
    case 'highly_recommended':
      return { text: 'Highly Recommended', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Star };
    case 'recommended':
      return { text: 'Recommended', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: ThumbsUp };
    default:
      return { text: 'Needs Review', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock };
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  let colorClass = 'text-gray-600 bg-gray-100';
  if (score >= 80) colorClass = 'text-emerald-700 bg-emerald-100';
  else if (score >= 60) colorClass = 'text-blue-700 bg-blue-100';
  else if (score >= 40) colorClass = 'text-amber-700 bg-amber-100';
  else if (score > 0) colorClass = 'text-red-700 bg-red-100';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

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
    rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rejected' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: 'Pending' },
  };

  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const { text, color, icon: Icon } = getRecommendationLabel(recommendation);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {text}
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
  onAddNote: (id: string, note: string) => void;
}

function QuickProfilePanel({ candidate, isOpen, onClose, onStatusChange, onAddNote }: QuickProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'resume' | 'video' | 'notes'>('overview');
  const [newNote, setNewNote] = useState('');

  if (!candidate || !isOpen) return null;

  const parsedResume = getParsedResumeData(candidate.resume);
  const topSkills = parsedResume?.skills?.hard_skills?.slice(0, 8) || [];

  const handleAddNote = () => {
    if (newNote.trim()) {
      onAddNote(candidate.id, newNote.trim());
      setNewNote('');
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-hidden flex flex-col">
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

      {/* Overall Score Banner */}
      <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{candidate.overall}</div>
              <div className="text-xs text-blue-100">Overall Score</div>
            </div>
            <div className="h-12 w-px bg-blue-400/50" />
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-blue-200">Resume:</span>{' '}
                <span className="font-semibold">{candidate.resumeScore}</span>
              </div>
              <div>
                <span className="text-blue-200">Video:</span>{' '}
                <span className="font-semibold">{candidate.videoScore}</span>
              </div>
              <div>
                <span className="text-blue-200">Profile:</span>{' '}
                <span className="font-semibold">{candidate.profileFit}</span>
              </div>
            </div>
          </div>
          <RecommendationBadge recommendation={candidate.recommendation || 'needs_review'} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        {[
          { id: 'overview', label: 'Overview', icon: User },
          { id: 'resume', label: 'Resume', icon: FileText },
          { id: 'video', label: 'Interview', icon: Video },
          { id: 'notes', label: 'Notes', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* AI Summary */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">AI-Generated Summary</h3>
              </div>
              <p className="text-sm text-blue-800 leading-relaxed">
                {candidate.name} demonstrates strong qualifications with a solid foundation in {topSkills.slice(0, 3).join(', ')}.
                Their profile shows {(candidate.resumeScore || 0) >= 75 ? 'exceptional' : 'good'} alignment with the role requirements,
                scoring {candidate.resumeScore || 0}/100 on resume match. {(candidate.videoScore || 0) >= 70 && 'Video assessment indicates strong communication skills.'}
              </p>
            </div>

            {/* Top Skills */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {topSkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full font-medium"
                  >
                    {skill}
                  </span>
                ))}
                {topSkills.length === 0 && (
                  <span className="text-sm text-gray-400">No skills extracted</span>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">{candidate.email}</span>
              </div>
              {parsedResume?.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{parsedResume.phone}</span>
                </div>
              )}
            </div>

            {/* Experience & Education Highlights */}
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
              {!parsedResume?.experience?.length && (
                <p className="text-sm text-gray-400">No experience data available</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'resume' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Resume Highlights</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <FileText className="w-4 h-4" />
                View Full Resume
              </button>
            </div>
            {parsedResume && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Education</h4>
                  {parsedResume.education?.map((edu, idx) => (
                    <div key={idx} className="text-sm text-gray-600 mb-1">
                      {edu.school} - {edu.course_or_strand}
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedResume.skills?.all?.map((skill, idx) => (
                      <span key={idx} className="px-2 py-1 bg-white text-gray-700 text-xs rounded border">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'video' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Video Interview Assessment</h3>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Play className="w-4 h-4" />
                  Watch Video
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  <FileText className="w-4 h-4" />
                  Transcript
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                <div className="text-sm text-blue-600 mb-1">Communication Score</div>
                <div className="text-3xl font-bold text-blue-900">
                  {candidate.videoScore ? Math.round(candidate.videoScore * 0.9) : '-'}
                </div>
                <div className="text-xs text-blue-500 mt-1">Based on clarity and articulation</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                <div className="text-sm text-emerald-600 mb-1">Answer Relevance</div>
                <div className="text-3xl font-bold text-emerald-900">
                  {candidate.videoScore ? Math.round(candidate.videoScore * 0.95) : '-'}
                </div>
                <div className="text-xs text-emerald-500 mt-1">Alignment with questions</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Add Private Note</h3>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter your notes about this candidate..."
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Previous Notes</h3>
              {candidate.notes?.length ? (
                candidate.notes.map((note) => (
                  <div key={note.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{note.author}</span>
                      <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-700">{note.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">No notes added yet</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3">
        <button
          onClick={() => onStatusChange(candidate.id, 'final_interview')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          Move to Final Interview
        </button>
        <button
          onClick={() => onStatusChange(candidate.id, 'shortlisted')}
          className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Keep in Shortlist
        </button>
        <button
          onClick={() => onStatusChange(candidate.id, 'rejected')}
          className="px-4 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Modal Component
// ============================================================================

interface ComparisonModalProps {
  candidates: ApplicantWithDetails[];
  isOpen: boolean;
  onClose: () => void;
}

function ComparisonModal({ candidates, isOpen, onClose }: ComparisonModalProps) {
  if (!isOpen || candidates.length < 2) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Candidate Comparison</h2>
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
              {candidates.length} candidates
            </span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className={`grid gap-4 ${candidates.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {candidates.map((candidate) => (
              <div key={candidate.id} className="bg-gray-50 rounded-xl p-4 space-y-4">
                <div className="text-center pb-4 border-b border-gray-200">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-gray-900">{candidate.name}</h3>
                  <p className="text-sm text-gray-500">{candidate.position}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Resume Match</span>
                    <ScoreBadge score={candidate.resumeScore || 0} size="sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Communication</span>
                    <ScoreBadge score={candidate.videoScore ? Math.round(candidate.videoScore * 0.9) : 0} size="sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Technical Relevance</span>
                    <ScoreBadge score={candidate.resumeScore ? Math.round(candidate.resumeScore * 0.85) : 0} size="sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm text-gray-600">Profile Fit</span>
                    <ScoreBadge score={candidate.profileFit || 0} size="sm" />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Overall Score</span>
                    <span className="text-2xl font-bold text-blue-600">{candidate.overall}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <RecommendationBadge recommendation={candidate.recommendation || 'needs_review'} />
                </div>
              </div>
            ))}
          </div>

          {/* Comparison Chart */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Score Breakdown Comparison
            </h3>
            <div className="space-y-4">
              {['Resume Match', 'Communication', 'Technical Relevance', 'Profile Fit', 'Overall'].map((metric, idx) => {
                const keys: ('resume' | 'video' | 'technical' | 'profile' | 'overall')[] = ['resume', 'video', 'technical', 'profile', 'overall'];
                const key = keys[idx];
                return (
                  <div key={metric} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{metric}</span>
                    </div>
                    <div className={`grid gap-2 ${candidates.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {candidates.map((candidate) => {
                        let score = 0;
                        switch (key) {
                          case 'resume': score = candidate.resumeScore || 0; break;
                          case 'video': score = candidate.videoScore ? Math.round(candidate.videoScore * 0.9) : 0; break;
                          case 'technical': score = candidate.resumeScore ? Math.round(candidate.resumeScore * 0.85) : 0; break;
                          case 'profile': score = candidate.profileFit || 0; break;
                          case 'overall': score = candidate.overall || 0; break;
                        }
                        return (
                          <div key={candidate.id} className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-500"
                              style={{ width: `${score}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                              {candidate.name.split(' ')[0]}: {score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
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
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Export {candidateCount} shortlisted candidates to your preferred format.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => onExport('pdf')}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <FilePdf className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as PDF</div>
              <div className="text-sm text-gray-500">Formatted report with all details</div>
            </div>
          </button>

          <button
            onClick={() => onExport('excel')}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Export as Excel</div>
              <div className="text-sm text-gray-500">Spreadsheet with all candidate data</div>
            </div>
          </button>

          <button
            onClick={() => onExport('csv')}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
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
}

export function ShortlistedCandidates({ applicants: externalApplicants }: ShortlistedCandidatesProps) {
  // State
  const [applicants, setApplicants] = useState<ApplicantWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [recommendationFilter, setRecommendationFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<ApplicantWithDetails | null>(null);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const itemsPerPage = 10;

  // Fetch applicants and scoring settings
  useEffect(() => {
    async function initialize() {
      try {
        // Fetch scoring settings
        const { data: settingsData } = await supabase
          .from('scoring_settings')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (settingsData) {
          setScoringSettings(settingsData);
        }

        // If external applicants provided, use them
        if (externalApplicants) {
          setApplicants(externalApplicants);
        } else {
          // Otherwise fetch from database
          const { data: applicantsData } = await supabase
            .from('applicants')
            .select('*')
            .order('created_at', { ascending: false });

          if (applicantsData) {
            const applicantsWithDetails = await Promise.all(
              applicantsData.map(async (applicant) => {
                const [resumeResult, videoResult, testResult] = await Promise.all([
                  supabase.from('resumes').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                  supabase.from('video_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
                  supabase.from('personality_tests').select('*').eq('applicant_id', applicant.id).maybeSingle(),
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
      }
    }

    initialize();
  }, [externalApplicants]);

  // Process applicants with scores
  const processedApplicants = useMemo(() => {
    return applicants.map((applicant) => {
      const resumeScore = calculateResumeScore(applicant, scoringSettings);
      const videoScore = calculateVideoScore(applicant.video);
      const profileFit = calculateProfileFit(applicant.test, applicant.position);
      const overall = calculateOverallScore(resumeScore, videoScore, profileFit);
      const recommendation = getRecommendation(overall, resumeScore);
      
      // Default to shortlisted status if not set
      let status = applicant.status || 'shortlisted';
      if (!applicant.status) {
        if (applicant.test?.status === 'completed') status = 'shortlisted';
        else if (applicant.video?.status === 'completed') status = 'shortlisted';
      }

      return {
        ...applicant,
        resumeScore,
        videoScore,
        profileFit,
        overall,
        recommendation,
        status,
      };
    });
  }, [applicants, scoringSettings]);

  // Filter and sort
  const filteredApplicants = useMemo(() => {
    let result = processedApplicants;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((a) =>
        a.name.toLowerCase().includes(query) ||
        a.email.toLowerCase().includes(query) ||
        a.position.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }

    // Recommendation filter
    if (recommendationFilter !== 'all') {
      result = result.filter((a) => a.recommendation === recommendationFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'overall':
          comparison = (a.overall || 0) - (b.overall || 0);
          break;
        case 'resume':
          comparison = (a.resumeScore || 0) - (b.resumeScore || 0);
          break;
        case 'video':
          comparison = (a.videoScore || 0) - (b.videoScore || 0);
          break;
        case 'profile':
          comparison = (a.profileFit || 0) - (b.profileFit || 0);
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [processedApplicants, searchQuery, statusFilter, recommendationFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedCandidates);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCandidates(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedCandidates.size === paginatedApplicants.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(paginatedApplicants.map((a) => a.id)));
    }
  };

  const handleStatusChange = useCallback((id: string, newStatus: string) => {
    setApplicants((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
  }, []);

  const handleAddNote = useCallback((id: string, noteText: string) => {
    const newNote: CandidateNote = {
      id: Date.now().toString(),
      text: noteText,
      createdAt: new Date().toISOString(),
      author: 'HR Manager',
    };
    
    setApplicants((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, notes: [...(a.notes || []), newNote] }
          : a
      )
    );
    
    if (selectedCandidate?.id === id) {
      setSelectedCandidate((prev) =>
        prev ? { ...prev, notes: [...(prev.notes || []), newNote] } : null
      );
    }
  }, [selectedCandidate]);

  const handleExport = (format: ExportFormat) => {
    const dataToExport = selectedCandidates.size > 0
      ? filteredApplicants.filter((a) => selectedCandidates.has(a.id))
      : filteredApplicants;

    switch (format) {
      case 'csv':
        exportToCSV(dataToExport);
        break;
      case 'excel':
        exportToExcel(dataToExport);
        break;
      case 'pdf':
        exportToPDF(dataToExport);
        break;
    }
    setIsExportOpen(false);
  };

  const exportToCSV = (data: ApplicantWithDetails[]) => {
    const headers = ['Name', 'Email', 'Position', 'Resume Score', 'Video Score', 'Profile Fit', 'Overall', 'Status', 'Recommendation'];
    const rows = data.map((a) => [
      a.name,
      a.email,
      a.position,
      a.resumeScore,
      a.videoScore,
      a.profileFit,
      a.overall,
      a.status,
      a.recommendation,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(csv, 'shortlisted-candidates.csv', 'text/csv');
  };

  const exportToExcel = (data: ApplicantWithDetails[]) => {
    // Simplified Excel export (HTML table format)
    const html = `
      <table>
        <tr><th>Name</th><th>Email</th><th>Position</th><th>Resume Score</th><th>Video Score</th><th>Overall</th><th>Status</th></tr>
        ${data.map((a) => `
          <tr>
            <td>${a.name}</td>
            <td>${a.email}</td>
            <td>${a.position}</td>
            <td>${a.resumeScore}</td>
            <td>${a.videoScore}</td>
            <td>${a.overall}</td>
            <td>${a.status}</td>
          </tr>
        `).join('')}
      </table>
    `;
    downloadFile(html, 'shortlisted-candidates.xls', 'application/vnd.ms-excel');
  };

  const exportToPDF = (data: ApplicantWithDetails[]) => {
    // Create a simple HTML document for PDF printing
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Shortlisted Candidates</title></head>
      <body>
        <h1>Shortlisted Candidates Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        <table border="1" cellpadding="8">
          <tr><th>Name</th><th>Position</th><th>Overall Score</th><th>Status</th><th>Recommendation</th></tr>
          ${data.map((a) => `
            <tr>
              <td>${a.name}</td>
              <td>${a.position}</td>
              <td>${a.overall}</td>
              <td>${a.status}</td>
              <td>${a.recommendation}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openProfilePanel = (candidate: ApplicantWithDetails) => {
    setSelectedCandidate(candidate);
    setIsProfilePanelOpen(true);
  };

  const openComparison = () => {
    if (selectedCandidates.size >= 2 && selectedCandidates.size <= 3) {
      setIsComparisonOpen(true);
    }
  };

  const comparisonCandidates = useMemo(() => {
    return filteredApplicants.filter((a) => selectedCandidates.has(a.id));
  }, [filteredApplicants, selectedCandidates]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading shortlisted candidates...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shortlisted Candidates</h1>
            <p className="text-gray-600 mt-1">Review and manage top candidates for final interview selection</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {selectedCandidates.size >= 2 && (
              <button
                onClick={openComparison}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Users className="w-4 h-4" />
                Compare ({selectedCandidates.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Shortlisted', value: processedApplicants.length, icon: Users, color: 'blue' },
          { label: 'Highly Recommended', value: processedApplicants.filter((a) => a.recommendation === 'highly_recommended').length, icon: Star, color: 'emerald' },
          { label: 'Final Interview', value: processedApplicants.filter((a) => a.status === 'final_interview').length, icon: CheckCircle, color: 'green' },
          { label: 'Avg. Overall Score', value: processedApplicants.length ? Math.round(processedApplicants.reduce((sum, a) => sum + (a.overall || 0), 0) / processedApplicants.length) : 0, icon: TrendingUp, color: 'purple' },
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

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidates by name, email, or position..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="final_interview">Final Interview</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={recommendationFilter}
              onChange={(e) => setRecommendationFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Recommendations</option>
              <option value="highly_recommended">Highly Recommended</option>
              <option value="recommended">Recommended</option>
              <option value="needs_review">Needs Review</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={toggleAllSelection}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {selectedCandidates.size === paginatedApplicants.length && paginatedApplicants.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    Candidate
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('resume')}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center justify-center gap-1">
                    Resume
                    {sortField === 'resume' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('video')}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center justify-center gap-1">
                    Video
                    {sortField === 'video' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('profile')}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center justify-center gap-1">
                    Profile Fit
                    {sortField === 'profile' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('overall')}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center justify-center gap-1">
                    Overall
                    {sortField === 'overall' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  AI Rec.
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedApplicants.map((applicant) => (
                <tr
                  key={applicant.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-4">
                    <button
                      onClick={() => toggleSelection(applicant.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {selectedCandidates.has(applicant.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        {applicant.photo_url ? (
                          <img
                            src={applicant.photo_url}
                            alt={applicant.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{applicant.name}</div>
                        <div className="text-sm text-gray-500">{applicant.position}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <ScoreBadge score={applicant.resumeScore || 0} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <ScoreBadge score={applicant.videoScore || 0} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <ScoreBadge score={applicant.profileFit || 0} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold">
                      {applicant.overall}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={applicant.status || 'shortlisted'} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <RecommendationBadge recommendation={applicant.recommendation || 'needs_review'} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openProfilePanel(applicant)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <div className="relative group">
                        <button className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover:block z-10">
                          <button
                            onClick={() => handleStatusChange(applicant.id, 'final_interview')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            Move to Final Interview
                          </button>
                          <button
                            onClick={() => handleStatusChange(applicant.id, 'shortlisted')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Star className="w-4 h-4 text-purple-600" />
                            Keep in Shortlist
                          </button>
                          <button
                            onClick={() => handleStatusChange(applicant.id, 'rejected')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                            Reject Candidate
                          </button>
                          <hr className="my-1 border-gray-200" />
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <FileText className="w-4 h-4" />
                            View Resume
                          </button>
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Video className="w-4 h-4" />
                            Watch Interview
                          </button>
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <ClipboardList className="w-4 h-4" />
                            View Transcript
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedApplicants.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <Users className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No shortlisted candidates found</p>
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
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of{' '}
              {filteredApplicants.length} candidates
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
          onAddNote={handleAddNote}
        />
      )}

      <ComparisonModal
        candidates={comparisonCandidates}
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
        candidateCount={selectedCandidates.size || filteredApplicants.length}
      />

      {/* Overlay for profile panel */}
      {isProfilePanelOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setIsProfilePanelOpen(false)}
        />
      )}
    </div>
  );
}

export default ShortlistedCandidates;
