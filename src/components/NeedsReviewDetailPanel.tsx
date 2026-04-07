import { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  Target,
  Check,
  AlertTriangle,
  Video,
  ClipboardCheck,
  BookOpen,
  Maximize2,
  Minimize2,
  FolderOpen,
  Briefcase,
  AlertCircle,
  CheckCircle,
  FileText,
  BarChart3,
  MessageSquare,
  GraduationCap,
  Award,
  Sparkles,
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  StickyNote
} from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';

// ---- Local types for parsed resume data ----
interface ResumeEducation {
  course_or_strand?: string;
  degree?: string;
  field?: string;
  school?: string;
  institution?: string;
  year_range?: string;
  years?: string;
  education_type?: string;
}

interface ResumeExperience {
  role?: string;
  title?: string;
  company?: string;
  organization?: string;
  years?: string;
  duration?: string;
  year_range?: string;
  summary?: string;
  description?: string;
}

interface ResumeProject {
  name?: string;
  title?: string;
  details?: string | string[];
}

interface ResumeTraining {
  title?: string;
  date?: string;
}

interface ParsedResumeData {
  education?: ResumeEducation[];
  experience?: ResumeExperience[];
  projects?: ResumeProject[];
  trainings?: (ResumeTraining | string)[];
  skills?: Record<string, string | string[]> & { hard_skills?: string[] };
  [key: string]: unknown;
}

interface ResumeRecord {
  parsed_data?: ParsedResumeData | string | null;
  resume_url?: string;
}

interface VideoRecord {
  video_url?: string | null;
  transcription?: string | null;
  transcript_score?: number | null;
  relevance_score?: number | null;
  experience_score?: number | null;
  skills_score?: number | null;
  completeness_score?: number | null;
}

interface AiInsight {
  type: 'strength' | 'weakness' | 'opportunity';
  title: string;
  description: string;
}

interface AiSuggestion {
  action: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

interface AiInsightsData {
  status: string;
  insights?: AiInsight[];
  suggestions?: AiSuggestion[];
  summary?: string;
}

interface WorkStyleDimension {
  dimension?: string;
  score?: number;
  hybrid_score?: number;
  reasoning?: string;
}

interface WorkStyleRecord {
  semantic_score?: number;
  role_family?: string;
  scoring_method?: string;
  dimension_scores?: WorkStyleDimension[];
  essay_response?: string;
  essay_score?: number;
  essay_feedback?: string;
  strong_areas?: string[];
  moderate_areas?: string[];
  development_areas?: string[];
  essay_insights?: string;
}

// Interfaces - separate from Applicant to avoid requiring all base fields
export interface NeedsReviewApplicant {
  id: string;
  name?: string;
  email?: string;
  position?: string;
  resume?: ResumeRecord;
  overall_score?: number;
  skills_score?: number;
  experience_score?: number;
  education_score?: number;
  projects_score?: number;
  screening_status?: 'in_review';
  screened_at?: string;
  matched_skills?: string[];
  missing_skills?: string[];
  key_issue?: string;
  reason_for_review?: string;
  job_requirements?: string[];
  video_score?: number;
  profileFit?: number;
  video_completed?: boolean;
  profiling_completed?: boolean;
  // Additional fields from database
  status?: string;
  screening_score?: number;
  screening_fit_category?: string;
  video_assessment_score?: number;
  work_style_score?: number;
  created_at?: string;
  updated_at?: string;
}

// Tab configuration
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'resume', label: 'Resume', icon: FileText },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'work', label: 'Work', icon: ClipboardCheck },
] as const;

type TabId = typeof TABS[number]['id'];

// Detailed side panel
export function NeedsReviewDetailPanel({
  applicant,
  isOpen,
  onClose,
  onNavigate,
  currentIndex,
  totalCount,
  onDecision,
}: {
  applicant: NeedsReviewApplicant | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  currentIndex?: number;
  totalCount?: number;
  onDecision?: (type: 'verified' | 'mismatch') => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [videoData, setVideoData] = useState<VideoRecord | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [videoSnapshotUrl, setVideoSnapshotUrl] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [verifyingVideo, setVerifyingVideo] = useState(false);
  const [workStyleData, setWorkStyleData] = useState<WorkStyleRecord | null>(null);
  const [loadingWorkStyle, setLoadingWorkStyle] = useState(false);
  const [resumeScores, setResumeScores] = useState<{ skills_score: number; experience_score: number; education_score: number; project_score: number } | null>(null);
  const [hrNotes, setHrNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'verified' | 'mismatch' } | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Handle video verification (Verified or Mismatch)
  const handleVideoVerification = async (verificationStatus: 'verified' | 'mismatch') => {
    if (!applicant?.id || !applicant?.email || !applicant?.name || !applicant?.position) {
      console.error('Missing applicant data for video verification');
      return;
    }

    setVerifyingVideo(true);
    try {
      const response = await fetch('http://localhost:5000/api/video-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicant_id: applicant.id,
          applicant_email: applicant.email,
          applicant_name: applicant.name,
          position: applicant.position,
          verification_status: verificationStatus,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onDecision?.(verificationStatus);
        onClose();
      } else {
        // Surface error via onDecision with a fallback — parent handles toast
        console.error('Verification error:', result.error);
      }
    } catch (error) {
      console.error('Error during video verification:', error);
    } finally {
      setVerifyingVideo(false);
    }
  };

  // Show confirmation dialog before making a decision
  const requestDecision = (type: 'verified' | 'mismatch') => {
    setConfirmDialog({ type });
  };

  const confirmDecision = () => {
    if (confirmDialog) {
      handleVideoVerification(confirmDialog.type);
      setConfirmDialog(null);
    }
  };

  // Save HR notes
  const handleSaveNotes = async () => {
    if (!applicant?.id || !hrNotes.trim()) return;
    setSavingNotes(true);
    try {
      const adminClient = getSupabaseAdminClient();
      await adminClient
        .from('applicants')
        .update({ hr_notes: hrNotes })
        .eq('id', applicant.id);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  // Reset notes saved state when applicant changes, and load existing notes
  useEffect(() => {
    setHrNotes('');
    setNotesSaved(false);
    setShowNotes(false);
    setResumeScores(null);

    const fetchExistingNotes = async () => {
      if (!applicant?.id) return;
      try {
        const adminClient = getSupabaseAdminClient();
        const { data } = await adminClient
          .from('applicants')
          .select('hr_notes')
          .eq('id', applicant.id)
          .maybeSingle();
        if (data?.hr_notes) setHrNotes(data.hr_notes);
      } catch {
        // silently ignore — notes are optional
      }
    };

    const fetchResumeScores = async () => {
      if (!applicant?.id) return;
      try {
        const adminClient = getSupabaseAdminClient();
        const { data } = await adminClient
          .from('resume_scores')
          .select('skills_score, experience_score, education_score, project_score, match_explain')
          .eq('applicant_id', applicant.id)
          .order('score_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          // If sub-scores are zero, try to recover from match_explain JSON
          let scores = {
            skills_score: data.skills_score || 0,
            experience_score: data.experience_score || 0,
            education_score: data.education_score || 0,
            project_score: data.project_score || 0,
          };
          const allZero = Object.values(scores).every(v => v === 0);
          if (allZero && data.match_explain) {
            try {
              const explain = typeof data.match_explain === 'string'
                ? JSON.parse(data.match_explain)
                : data.match_explain;
              const bd = explain?.component_breakdown?.count || explain?.count_breakdown || {};
              scores = {
                skills_score: bd.skills || 0,
                experience_score: bd.experience || 0,
                education_score: bd.education || 0,
                project_score: bd.projects || 0,
              };
            } catch { /* ignore parse errors */ }
          }
          setResumeScores(scores);
        }
      } catch {
        // no resume_scores row yet — breakdown stays empty
      }
    };

    if (applicant?.id) {
      fetchExistingNotes();
      fetchResumeScores();
    }
  }, [applicant?.id]);

  // Fetch video assessment data when video tab is active
  useEffect(() => {
    const fetchVideoData = async () => {
      if (!applicant?.id) return;
      
      setLoadingVideo(true);
      try {
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient
          .from('video_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .single();
        
        if (error) throw error;
        setVideoData(data);
      } catch (err) {
        console.error('Error fetching video assessment:', err);
        setVideoData(null);
      } finally {
        setLoadingVideo(false);
      }
    };

    if (isOpen && applicant) {
      fetchVideoData();
    }
  }, [isOpen, applicant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch profile photo URL when panel opens
  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!applicant?.id) return;
      
      setLoadingPhoto(true);
      try {
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient
          .from('applicants')
          .select('photo_url')
          .eq('id', applicant.id)
          .single();
        
        if (error) throw error;
        setProfilePhotoUrl(data?.photo_url || null);
      } catch (err) {
        console.error('Error fetching profile photo:', err);
        setProfilePhotoUrl(null);
      } finally {
        setLoadingPhoto(false);
      }
    };

    if (isOpen && applicant) {
      fetchProfilePhoto();
    }
  }, [isOpen, applicant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture video frame when video data is loaded
  useEffect(() => {
    if (!videoData?.video_url) {
      setVideoSnapshotUrl(null);
      return;
    }

    const video = document.createElement('video');
    video.src = `${videoData.video_url}#t=0.001`;
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const snapshotUrl = canvas.toDataURL('image/jpeg', 0.8);
          setVideoSnapshotUrl(snapshotUrl);
        }
      } catch (err) {
        console.error('Error capturing video frame:', err);
        setVideoSnapshotUrl(null);
      }
    };

    video.addEventListener('loadeddata', () => {
      video.currentTime = 1; // Seek to 1 second for thumbnail
    });

    video.addEventListener('seeked', captureFrame);

    video.addEventListener('error', () => {
      console.error('Error loading video for snapshot');
      setVideoSnapshotUrl(null);
    });

    return () => {
      video.removeEventListener('seeked', captureFrame);
      video.removeEventListener('loadeddata', () => {});
      video.removeEventListener('error', () => {});
    };
  }, [videoData?.video_url]);

  // Fetch AI insights when component mounts
  useEffect(() => {
    const fetchAiInsights = async () => {
      if (!applicant?.id) return;
      
      // Reset insights when applicant changes
      setAiInsights(null);
      setLoadingInsights(true);
      try {
        const response = await fetch('http://localhost:5000/api/generate-ai-insights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            applicant_id: applicant.id,
            overall_score: applicant.overall_score || 0,
            skills_score: resumeScores?.skills_score || applicant.skills_score || 0,
            experience_score: resumeScores?.experience_score || applicant.experience_score || 0,
            education_score: resumeScores?.education_score || applicant.education_score || 0,
            projects_score: resumeScores?.project_score || applicant.projects_score || 0,
            video_score: applicant.video_assessment_score || 0,
            work_style_score: applicant.work_style_score || 0,
            matched_skills: applicant.matched_skills || [],
            missing_skills: applicant.missing_skills || [],
            position: applicant.position || 'the position'
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch AI insights');
        }
        
        const data = await response.json();
        if (data.status === 'success') {
          setAiInsights(data);
        }
      } catch (err) {
        console.error('Error fetching AI insights:', err);
        setAiInsights(null);
      } finally {
        setLoadingInsights(false);
      }
    };

    if (isOpen && applicant && resumeScores !== undefined) {
      fetchAiInsights();
    }
  }, [isOpen, applicant?.id, resumeScores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch work style assessment data when work tab is active
  useEffect(() => {
    const fetchWorkStyleData = async () => {
      if (!applicant?.id) return;
      
      setLoadingWorkStyle(true);
      try {
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient
          .from('work_style_assessments')
          .select('*')
          .eq('applicant_id', applicant.id)
          .single();
        
        if (error) throw error;
        setWorkStyleData(data);
      } catch (err) {
        console.error('Error fetching work style assessment:', err);
        setWorkStyleData(null);
      } finally {
        setLoadingWorkStyle(false);
      }
    };

    if (isOpen && applicant && activeTab === 'work') {
      fetchWorkStyleData();
    }
  }, [isOpen, applicant?.id, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !applicant) return null;

  // Helper function to parse resume data
  const getParsedResumeData = (resume: ResumeRecord | undefined): ParsedResumeData | null => {
    if (!resume?.parsed_data) return null;
    if (typeof resume.parsed_data === 'object') return resume.parsed_data as ParsedResumeData;
    try {
      return JSON.parse(resume.parsed_data) as ParsedResumeData;
    } catch {
      return null;
    }
  };

  const parsedResume = applicant ? getParsedResumeData(applicant.resume) : null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const scoreCategories = [
    { label: 'Skills', score: resumeScores?.skills_score || applicant.skills_score || 0, icon: Target },
    { label: 'Experience', score: resumeScores?.experience_score || applicant.experience_score || 0, icon: Briefcase },
    { label: 'Education', score: resumeScores?.education_score || applicant.education_score || 0, icon: BookOpen },
    { label: 'Projects', score: resumeScores?.project_score || applicant.projects_score || 0, icon: FolderOpen },
  ];

  // Compute overall combined score from all three pillars
  const resumeScore = applicant.screening_score || applicant.overall_score || 0;
  const videoScore = applicant.video_assessment_score || 0;
  const workScore = applicant.work_style_score || 0;
  const scoredPillars = [resumeScore, videoScore, workScore].filter(s => s > 0);
  const overallCombined = scoredPillars.length > 0
    ? Math.round(scoredPillars.reduce((a, b) => a + b, 0) / scoredPillars.length)
    : 0;

  return (
    <div className={`fixed inset-y-0 right-0 z-50 bg-white shadow-2xl transition-all duration-300 flex flex-col ${isFullscreen ? 'inset-0' : 'w-full max-w-3xl'}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {applicant.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{applicant.name || 'Applicant Details'}</h2>
            <p className="text-xs text-gray-500 truncate">{applicant.position || 'No position'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Prev / Next navigation */}
          {onNavigate && totalCount !== undefined && currentIndex !== undefined && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => onNavigate('prev')}
                disabled={currentIndex <= 0}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
                title="Previous applicant"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs text-gray-500 px-1">{currentIndex + 1} / {totalCount}</span>
              <button
                onClick={() => onNavigate('next')}
                disabled={currentIndex >= totalCount - 1}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
                title="Next applicant"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-gray-200 bg-gray-50/50">
        <div className="flex gap-1 -mb-px">
          {TABS.map(tab => {
            // Status badge per tab
            let badge: 'done' | 'missing' | null = null;
            if (tab.id === 'resume') badge = parsedResume ? 'done' : 'missing';
            if (tab.id === 'video') badge = (videoData?.video_url || applicant.video_completed) ? 'done' : 'missing';
            if (tab.id === 'work') badge = (workStyleData || applicant.profiling_completed) ? 'done' : 'missing';
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-t-lg'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {badge === 'done' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 absolute top-2 right-1" />
                )}
                {badge === 'missing' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 absolute top-2 right-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 p-6 bg-gray-50/30">
        
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Reason for Review — most important context for HR */}
            {(applicant.reason_for_review || applicant.key_issue) && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-semibold text-amber-800">Why this applicant needs review</span>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {applicant.reason_for_review || applicant.key_issue || 'Borderline score — requires human decision'}
                  </p>
                </div>
              </div>
            )}

            {/* Overall Combined Score */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <span className={`text-3xl font-bold ${getScoreColor(overallCombined)}`}>{overallCombined}%</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Overall Score</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Average across {scoredPillars.length} completed assessment{scoredPillars.length !== 1 ? 's' : ''}
                  </p>
                  {/* Mini bar */}
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                    <div className={`h-1.5 rounded-full ${getScoreBgColor(overallCombined)}`} style={{ width: `${overallCombined}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Cards — 3 pillars */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-500">Resume</p>
                </div>
                <p className={`text-xl font-bold ${getScoreColor(resumeScore)}`}>{resumeScore}%</p>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5">
                  <div className={`h-1 rounded-full ${getScoreBgColor(resumeScore)}`} style={{ width: `${resumeScore}%` }} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                    <Video className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <p className="text-xs text-gray-500">Video</p>
                </div>
                <p className={`text-xl font-bold ${getScoreColor(videoScore)}`}>{videoScore > 0 ? `${videoScore}%` : '—'}</p>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5">
                  <div className={`h-1 rounded-full ${getScoreBgColor(videoScore)}`} style={{ width: `${videoScore}%` }} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                    <ClipboardCheck className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <p className="text-xs text-gray-500">Work Style</p>
                </div>
                <p className={`text-xl font-bold ${getScoreColor(workScore)}`}>{workScore > 0 ? `${workScore}%` : '—'}</p>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5">
                  <div className={`h-1 rounded-full ${getScoreBgColor(workScore)}`} style={{ width: `${workScore}%` }} />
                </div>
              </div>
            </div>

            {/* Resume Sub-scores breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resume Breakdown</p>
              {resumeScores ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {scoreCategories.map(({ label, score, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 w-20">{label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${getScoreBgColor(score)}`} style={{ width: `${score}%` }} />
                      </div>
                      <span className={`text-xs font-semibold w-8 text-right ${getScoreColor(score)}`}>{score}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Sub-scores not available for this applicant.</p>
              )}
            </div>

            {/* Applicant Summary — no duplicate score */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Applicant Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="text-sm font-medium text-gray-900">{applicant.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900">{applicant.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Job Applied</p>
                  <p className="text-sm font-medium text-gray-900">{applicant.position || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date Screened</p>
                  <p className="text-sm font-medium text-gray-900">
                    {applicant.screened_at ? new Date(applicant.screened_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Skills Match — matched and missing skills explicitly listed */}
            {((applicant.matched_skills && applicant.matched_skills.length > 0) || (applicant.missing_skills && applicant.missing_skills.length > 0)) && (
              <div className="grid grid-cols-2 gap-4">
                {applicant.matched_skills && applicant.matched_skills.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">Matched Skills</h3>
                      <span className="ml-auto text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {applicant.matched_skills.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {applicant.matched_skills.map((skill, i) => (
                        <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-100 rounded-lg text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {applicant.missing_skills && applicant.missing_skills.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">Missing Skills</h3>
                      <span className="ml-auto text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {applicant.missing_skills.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {applicant.missing_skills.map((skill, i) => (
                        <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Insights & Suggestions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
                </div>
                {loadingInsights ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  </div>
                ) : aiInsights?.insights ? (
                  <div className="space-y-3">
                    {aiInsights.insights.map((insight, index: number) => (
                      <div key={index} className="flex items-start gap-2">
                        {insight.type === 'strength' && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />}
                        {insight.type === 'weakness' && <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                        {insight.type === 'opportunity' && <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                          <p className="text-xs text-gray-600">{insight.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">Matched {applicant.matched_skills?.length || 0} required skill{(applicant.matched_skills?.length || 0) !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">Missing {applicant.missing_skills?.length || 0} key qualification{(applicant.missing_skills?.length || 0) !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">
                        Resume score: {resumeScore}% —{' '}
                        {resumeScore >= 80 ? 'strong fit' : resumeScore >= 60 ? 'borderline, needs review' : 'below threshold'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">AI Suggestion</h3>
                </div>
                {loadingInsights ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  </div>
                ) : aiInsights?.suggestions ? (
                  <div className="space-y-3">
                    {aiInsights.suggestions.map((suggestion, index: number) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900">{suggestion.action}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            suggestion.priority === 'high' ? 'bg-red-100 text-red-700' :
                            suggestion.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {suggestion.priority}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">{suggestion.reason}</p>
                      </div>
                    ))}
                    {aiInsights.summary && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">Summary</p>
                        <p className="text-sm text-gray-700 mt-1">{aiInsights.summary}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Based on the assessment scores, this candidate shows potential but requires further evaluation. Consider reviewing their video assessment and work profiling results before making a final decision.
                    </p>
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 font-medium">Recommended Action</p>
                      <p className="text-sm text-indigo-600 font-medium mt-1">Schedule interview to validate skills</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== RESUME TAB ===== */}
        {activeTab === 'resume' && !parsedResume && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium text-gray-500">Resume data not available</p>
            <p className="text-xs text-gray-400 mt-1">The resume may not have been parsed yet, or parsing failed.</p>
            {applicant.resume?.resume_url && (
              <a
                href={applicant.resume.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                View Original Resume
              </a>
            )}
          </div>
        )}
        {activeTab === 'resume' && parsedResume && (
          <div className="space-y-6">
            
            {/* Overall Score KPI Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Overall Resume Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(applicant.screening_score || applicant.overall_score || 0)}`}>
                    {applicant.screening_score || applicant.overall_score || 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Resume File Card */}
            {applicant.resume?.resume_url && (
              <div className="bg-gradient-to-r from-indigo-50/50 to-violet-50/50 rounded-2xl border border-indigo-100 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Original Resume</h3>
                      <p className="text-sm text-gray-500">View or download the uploaded document</p>
                    </div>
                  </div>
                  <a
                    href={applicant.resume.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                  >
                    View Resume
                  </a>
                </div>
              </div>
            )}

            {/* Education Card */}
            {parsedResume.education && parsedResume.education.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/50 to-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Education</h3>
                </div>
                <div className="p-5 space-y-4">
                  {parsedResume.education.map((edu, idx: number) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{edu.course_or_strand || edu.degree || edu.field || 'Education'}</p>
                        <p className="text-sm text-gray-600">{edu.school || edu.institution || 'Unknown School'}</p>
                        {(edu.year_range || edu.years) ? (
                          <p className="text-xs text-gray-400 mt-1">{edu.year_range || edu.years}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills Card */}
            {parsedResume.skills && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Award className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Skills</h3>
                  <span className="ml-auto text-xs text-gray-500">
                    {Object.values(parsedResume.skills as Record<string, string | string[]>)
                      .flatMap(v => typeof v === 'string' ? v.split(',') : v).length} detected
                  </span>
                </div>
                <div className="p-5">
                  {/* Handle old format (hard_skills) and new NER format (category-based dict) */}
                  {(parsedResume.skills as { hard_skills?: string[] }).hard_skills ? (
                    <div className="flex flex-wrap gap-2">
                      {(parsedResume.skills as { hard_skills: string[] }).hard_skills.map((skill: string, idx: number) => (
                        <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(parsedResume.skills as Record<string, string | string[]>).map(([category, skills]) => (
                        typeof skills === 'string'
                          ? skills.split(',').map((skill: string, idx: number) => (
                              <span key={`${category}-${idx}`} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                                {skill.trim()}
                              </span>
                            ))
                          : Array.isArray(skills)
                            ? skills.map((skill: string, idx: number) => (
                                <span key={`${category}-${idx}`} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                                  {skill}
                                </span>
                              ))
                            : null
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Experience Card */}
            {parsedResume.experience && parsedResume.experience.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/50 to-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Work Experience</h3>
                </div>
                <div className="p-5 space-y-5">
                  {parsedResume.experience.map((exp, idx: number) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{exp.role || exp.title || 'Professional Experience'}</p>
                        <p className="text-sm text-gray-600">{exp.company || exp.organization || ''}</p>
                        {(exp.years || exp.duration || exp.year_range) ? (
                          <p className="text-xs text-gray-400 mt-1">{exp.years || exp.duration || exp.year_range}</p>
                        ) : null}
                        {(exp.summary || exp.description) ? (
                          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{exp.summary || exp.description}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects Card */}
            {parsedResume.projects && parsedResume.projects.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50/50 to-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Projects</h3>
                </div>
                <div className="p-5 space-y-4">
                  {parsedResume.projects.map((project, idx: number) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{project.name || project.title || 'Untitled Project'}</p>
                        {project.details && (
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                            {typeof project.details === 'string'
                              ? project.details
                              : Array.isArray(project.details)
                                ? project.details.join(' ')
                                : JSON.stringify(project.details)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications Card */}
            {parsedResume.trainings && parsedResume.trainings.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/50 to-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Certifications & Training</h3>
                </div>
                <div className="p-5 space-y-3">
                  {parsedResume.trainings.map((training, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <p className="text-sm text-gray-700 font-medium">
                        {typeof training === 'string'
                          ? training
                          : training.title || JSON.stringify(training)}
                      </p>
                      {typeof training !== 'string' && training.date && (
                        <span className="text-xs text-gray-400 ml-auto">{training.date}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== VIDEO TAB ===== */}
        {activeTab === 'video' && (
          <div className="space-y-6">
            
            

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-4">
              {/* Identity Verification Column */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Identity Verification</h3>
                <p className="text-sm text-gray-500 mb-4">Confirm that the applicant in the video matches the uploaded profile photo.</p>
                
                {/* Photo Comparison */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Profile Photo</p>
                    <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      {loadingPhoto ? (
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      ) : profilePhotoUrl ? (
                        <img 
                          src={profilePhotoUrl} 
                          alt="Profile" 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement!.innerHTML = '<span class="text-gray-400 text-sm">No photo</span>';
                          }}
                        />
                      ) : (
                        <span className="text-gray-400 text-sm">No photo</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Video Snapshot</p>
                    <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      {videoSnapshotUrl ? (
                        <img 
                          src={videoSnapshotUrl} 
                          alt="Video Snapshot" 
                          className="w-full h-full object-cover"
                        />
                      ) : videoData?.video_url ? (
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      ) : (
                        <span className="text-gray-400 text-sm">No snapshot</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                    <CheckCircle className="w-4 h-4 text-gray-400" />
                    Use the Shortlist / Reject buttons below to make a decision
                  </div>
                </div>

                {/* Verification Notes */}
                <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-800">Take Note:</p>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Ensure the applicant’s face is clearly visible in the video, with sufficient lighting and no obstructions such as masks, shadows, or blurring that could affect proper identification.</p>
                  </div>
                </div>
              </div>

              {/* Video Column */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Video</h3>
                {loadingVideo ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                    <p className="text-sm text-gray-500">Loading video...</p>
                  </div>
                ) : videoData?.video_url ? (
                  <div className="space-y-4">
                    <video
                      src={`${videoData.video_url}#t=0.001`}
                      controls
                      className="w-full rounded-lg bg-black"
                      preload="metadata"
                    />
                    <p className="text-xs text-gray-500 text-center">Submitted video assessment</p>
                    
                    {/* Transcription Section */}
                    {videoData.transcription && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Transcribed Answer</h4>
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mb-2">
                          Timestamps are estimated based on speech rate and may not match the video exactly.
                        </p>
                        <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          {(() => {
                            // Split transcription into sentences and estimate timestamps
                            const text = videoData.transcription;
                            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
                            const wordsPerMinute = 150;
                            const wordsPerSecond = wordsPerMinute / 60;
                            let currentTime = 0;
                            
                            return sentences.map((sentence: string, index: number) => {                              const words = sentence.trim().split(/\s+/).length;
                              const duration = Math.max(3, Math.min(6, words / wordsPerSecond));
                              const startTime = currentTime;
                              const endTime = currentTime + duration;
                              currentTime = endTime;
                              
                              const formatTime = (seconds: number) => {
                                const mins = Math.floor(seconds / 60);
                                const secs = Math.floor(seconds % 60);
                                return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                              };
                              
                              return (
                                <div key={index} className="mb-2 last:mb-0">
                                  <span className="text-xs font-mono text-indigo-600 font-semibold">
                                    [{formatTime(startTime)} - {formatTime(endTime)}]
                                  </span>
                                  <p className="text-sm text-gray-700 mt-0.5">{sentence.trim()}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                    

                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <Video className="w-12 h-12 mb-2" />
                    <p className="text-sm">No video submitted</p>
                  </div>
                )}
              </div>
            </div>

            {/* Transcription Scoring Breakdown */}
            {videoData && (videoData.transcript_score !== null || videoData.relevance_score !== null || videoData.experience_score !== null || videoData.skills_score !== null || videoData.completeness_score !== null) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Transcription Scoring Breakdown</h3>
                    <p className="text-sm text-gray-500">How the transcribed answer was evaluated</p>
                  </div>
                </div>

                {/* Normalise: scores stored as 0-10 → multiply by 10; already 0-100 → use as-is */}
                {(() => {
                  const norm = (v: number) => v <= 10 ? Math.round(v * 10) : Math.round(v);
                  return (
                    <div className="space-y-4">
                      {videoData.relevance_score !== null && videoData.relevance_score !== undefined && (
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-semibold text-gray-800">Relevance to Job</span>
                            </div>
                            <span className={`text-lg font-bold ${getScoreColor(norm(videoData.relevance_score))}`}>
                              {norm(videoData.relevance_score)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full ${getScoreBgColor(norm(videoData.relevance_score))}`} style={{ width: `${norm(videoData.relevance_score)}%` }} />
                          </div>
                          <p className="text-xs text-gray-600">Measures how well the response addresses the job requirements and responsibilities.</p>
                        </div>
                      )}

                      {videoData.experience_score !== null && videoData.experience_score !== undefined && (
                        <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-emerald-600" />
                              <span className="text-sm font-semibold text-gray-800">Experience Demonstration</span>
                            </div>
                            <span className={`text-lg font-bold ${getScoreColor(norm(videoData.experience_score))}`}>
                              {norm(videoData.experience_score)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full ${getScoreBgColor(norm(videoData.experience_score))}`} style={{ width: `${norm(videoData.experience_score)}%` }} />
                          </div>
                          <p className="text-xs text-gray-600">Evaluates how effectively the candidate demonstrates relevant work experience and achievements.</p>
                        </div>
                      )}

                      {videoData.skills_score !== null && videoData.skills_score !== undefined && (
                        <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Award className="w-4 h-4 text-amber-600" />
                              <span className="text-sm font-semibold text-gray-800">Skills Alignment</span>
                            </div>
                            <span className={`text-lg font-bold ${getScoreColor(norm(videoData.skills_score))}`}>
                              {norm(videoData.skills_score)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full ${getScoreBgColor(norm(videoData.skills_score))}`} style={{ width: `${norm(videoData.skills_score)}%` }} />
                          </div>
                          <p className="text-xs text-gray-600">Assesses how well the candidate's mentioned skills match the required qualifications.</p>
                        </div>
                      )}

                      {videoData.completeness_score !== null && videoData.completeness_score !== undefined && (
                        <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-violet-600" />
                              <span className="text-sm font-semibold text-gray-800">Response Completeness</span>
                            </div>
                            <span className={`text-lg font-bold ${getScoreColor(norm(videoData.completeness_score))}`}>
                              {norm(videoData.completeness_score)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full ${getScoreBgColor(norm(videoData.completeness_score))}`} style={{ width: `${norm(videoData.completeness_score)}%` }} />
                          </div>
                          <p className="text-xs text-gray-600">Evaluates the thoroughness and depth of the candidate's response to the assessment question.</p>
                        </div>
                      )}

                      {videoData.transcript_score !== null && videoData.transcript_score !== undefined && (
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 mt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-indigo-600" />
                              <span className="text-base font-bold text-gray-900">Overall Transcript Score</span>
                            </div>
                            <span className={`text-2xl font-bold ${getScoreColor(norm(videoData.transcript_score))}`}>
                              {norm(videoData.transcript_score)}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">Combined score based on relevance, experience, skills, and completeness of the transcribed response.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}

        {/* ===== WORK TAB ===== */}
        {activeTab === 'work' && (
          <div className="space-y-6">
            {loadingWorkStyle ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                <p className="text-sm text-gray-500">Loading work profiling data...</p>
              </div>
            ) : workStyleData ? (
              <>
                {/* Overall Score KPI Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
                      <ClipboardCheck className="w-7 h-7 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Overall Work Style Score</p>
                      <p className={`text-3xl font-bold ${getScoreColor(workStyleData.semantic_score || 0)}`}>
                        {workStyleData.semantic_score || 0}%
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {workStyleData.role_family && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Role Family:</span>
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium capitalize">
                            {workStyleData.role_family}
                          </span>
                        </div>
                      )}
                      {workStyleData.scoring_method && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Scoring Method:</span>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            workStyleData.scoring_method === 'hybrid' 
                              ? 'bg-purple-100 text-purple-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {workStyleData.scoring_method === 'hybrid' ? 'Hybrid (AI + Embeddings)' : 'Semantic (Embeddings)'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dimension Scores */}
                {workStyleData.dimension_scores && workStyleData.dimension_scores.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Dimension Scores</h3>
                        <p className="text-sm text-gray-500">Detailed breakdown of work style dimensions</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {workStyleData.dimension_scores.map((dimension, index: number) => {
                        const dimensionKey = dimension.dimension?.toLowerCase().replace(/ /g, '_') || '';
                        const dimensionLabels: Record<string, { high: string; low: string }> = {
                          collaboration: { high: 'Strong team player', low: 'Prefers solo work' },
                          independence: { high: 'Self-directed', low: 'Needs close guidance' },
                          leadership_readiness: { high: 'Ready to lead', low: 'Prefers following' },
                          adaptability: { high: 'Embraces change', low: 'Prefers routine' },
                          attention_to_detail: { high: 'Meticulous', low: 'Misses details' },
                          problem_solving: { high: 'Analytical thinker', low: 'Avoids complexity' },
                          communication: { high: 'Clear communicator', low: 'Struggles to convey ideas' },
                          stress_tolerance: { high: 'Calm under pressure', low: 'Overwhelmed easily' },
                          feedback_receptiveness: { high: 'Open to feedback', low: 'Defensive to criticism' },
                          ambiguity_tolerance: { high: 'Comfortable with uncertainty', low: 'Needs clear instructions' },
                          initiative: { high: 'Proactive self-starter', low: 'Waits for direction' },
                          relationship_building: { high: 'Builds rapport easily', low: 'Struggles with rapport' },
                          learning_orientation: { high: 'Continuous learner', low: 'Resists new learning' },
                          conflict_management: { high: 'Resolves conflict well', low: 'Avoids confrontation' },
                          work_preference_balance: { high: 'Healthy work-life balance', low: 'Poor boundary-setting' },
                        };
                        const label = dimensionLabels[dimensionKey];

                        return (
                          <div key={index} className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-indigo-600" />
                                <span className="text-sm font-semibold text-gray-800 capitalize">
                                  {dimension.dimension?.replace(/_/g, ' ') || 'Unknown'}
                                </span>
                              </div>
                              <span className={`text-lg font-bold ${getScoreColor(dimension.hybrid_score || 0)}`}>
                                {Math.round(dimension.hybrid_score || 0)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div
                                className={`h-2 rounded-full ${getScoreBgColor(dimension.hybrid_score || 0)}`}
                                style={{ width: `${Math.round(dimension.hybrid_score || 0)}%` }}
                              />
                            </div>
                            {label && (
                              <p className="text-xs text-gray-500 mt-1">
                                {(dimension.hybrid_score || 0) >= 60 ? label.high : label.low}
                              </p>
                            )}
                            {dimension.reasoning && (
                              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{dimension.reasoning}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Strong Areas and Essay Insights */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Strong Areas */}
                  {workStyleData.strong_areas && workStyleData.strong_areas.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">Strong Areas</h3>
                      </div>
                      <div className="space-y-2">
                        {workStyleData.strong_areas.map((area: string, index: number) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="text-sm text-gray-700 capitalize">{area.replace(/_/g, ' ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Essay Insights */}
                  {workStyleData.essay_insights && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Essay Insights</h3>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{workStyleData.essay_insights}</p>
                    </div>
                  )}
                </div>

                {/* Moderate and Development Areas */}
                {(workStyleData.moderate_areas && workStyleData.moderate_areas.length > 0) || (workStyleData.development_areas && workStyleData.development_areas.length > 0) ? (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Moderate Areas */}
                    {workStyleData.moderate_areas && workStyleData.moderate_areas.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">Moderate Areas</h3>
                        </div>
                        <div className="space-y-2">
                          {workStyleData.moderate_areas.map((area: string, index: number) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                              <span className="text-sm text-gray-700 capitalize">{area.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Development Areas */}
                    {workStyleData.development_areas && workStyleData.development_areas.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">Development Areas</h3>
                        </div>
                        <div className="space-y-2">
                          {workStyleData.development_areas.map((area: string, index: number) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                              <span className="text-sm text-gray-700 capitalize">{area.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ClipboardCheck className="w-12 h-12 mb-2" />
                <p className="text-sm">No work profiling data available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Decision Footer — always visible regardless of active tab */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-3">
        {/* Collapsible HR Notes */}
        {showNotes && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            <div className="flex gap-2">
              <textarea
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                placeholder="Add notes before making a decision..."
                rows={2}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes || !hrNotes.trim()}
                className={`self-end flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  notesSaved
                    ? 'bg-green-100 text-green-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40'
                }`}
              >
                {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : notesSaved ? <Check className="w-3 h-3" /> : null}
                {notesSaved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">Decision for</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{applicant.name || 'this applicant'}</p>
          </div>
          {/* Notes toggle */}
          <button
            onClick={() => setShowNotes(v => !v)}
            title="HR Notes"
            className={`p-2 rounded-lg border transition-colors ${
              showNotes ? 'bg-slate-100 border-slate-300 text-slate-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
            } ${hrNotes.trim() ? 'text-indigo-600 border-indigo-200 bg-indigo-50' : ''}`}
          >
            <StickyNote className="w-4 h-4" />
          </button>
          <button
            onClick={() => requestDecision('mismatch')}
            disabled={verifyingVideo}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {verifyingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
            Reject
          </button>
          <button
            onClick={() => requestDecision('verified')}
            disabled={verifyingVideo}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {verifyingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            Shortlist
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmDialog.type === 'verified' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {confirmDialog.type === 'verified'
                ? <UserCheck className="w-6 h-6 text-green-600" />
                : <UserX className="w-6 h-6 text-red-600" />}
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">
              {confirmDialog.type === 'verified' ? 'Shortlist this applicant?' : 'Reject this applicant?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              {confirmDialog.type === 'verified'
                ? `${applicant.name || 'This applicant'} will be moved to shortlisted candidates and notified by email.`
                : `${applicant.name || 'This applicant'} will be rejected and notified by email. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecision}
                disabled={verifyingVideo}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                  confirmDialog.type === 'verified' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {verifyingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {confirmDialog.type === 'verified' ? 'Yes, Shortlist' : 'Yes, Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
