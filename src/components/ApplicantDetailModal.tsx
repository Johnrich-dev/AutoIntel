import { useState, useEffect } from 'react';
import { useFormatDate } from '../hooks/useFormatDate';
import { supabase } from '../lib/supabase';
import {
  X,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  FileText,
  Clock,
  User,
  GraduationCap,
  Award,
  Shield,
  Check,
  Sparkles,
  Brain,
  TrendingUp,
  Video,
  ClipboardList,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Applicant, Resume, ResumeParsedData, VideoAssessment, PersonalityTest } from '../lib/supabase';

// ---- Local resume shape types ----
interface ResumeEducation {
  course_or_strand?: string;
  degree?: string;
  field?: string;
  school?: string;
  institution?: string;
  year_range?: string;
  years?: string;
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

// Extend ResumeParsedData locally to cover both old and new skill formats
type SkillsMap = { hard_skills?: string[] } & Record<string, string | string[]>;

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  resumeScore?: number;
  overall?: number;
  status?: string;
}

interface ApplicantDetailModalProps {
  applicantId?: string;
  applicant?: ApplicantWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

// Helper to parse resume data
function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

// Status configurations
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  passed: { label: 'Passed', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  in_review: { label: 'In Review', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200', dotColor: 'bg-yellow-500' },
  needs_review: { label: 'Needs Review', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500' },
  failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
  shortlisted: { label: 'Shortlisted', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', dotColor: 'bg-purple-500' },
  pending: { label: 'Pending', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200', dotColor: 'bg-gray-500' },
  completed: { label: 'Completed', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', dotColor: 'bg-blue-500' },
  submitted: { label: 'Submitted', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200', dotColor: 'bg-indigo-500' },
  reviewed: { label: 'Reviewed', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  not_suitable: { label: 'Not Suitable', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
};

const getStatusConfig = (status: string) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
};

export function ApplicantDetailModal({
  applicantId,
  applicant: initialApplicant,
  isOpen,
  onClose,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: ApplicantDetailModalProps) {
  const formatDate = useFormatDate();
  const [activeTab, setActiveTab] = useState<'summary' | 'resume'>('summary');
  
  // Data fetching state
  const [applicant, setApplicant] = useState<ApplicantWithDetails | null>(initialApplicant || null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch applicant data from Supabase
  const fetchApplicantData = async () => {
    // Use applicantId if provided, otherwise use applicant.id
    const id = applicantId || applicant?.id;
    if (!id) {
      setFetchError('No applicant ID provided');
      return;
    }
    
    setIsLoading(true);
    setFetchError(null);
    
    try {
      // Fetch applicant with related data
      const { data: applicantData, error: applicantError } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (applicantError) {
        console.error('Error fetching applicant:', applicantError);
        throw new Error(`Failed to fetch applicant: ${applicantError.message}`);
      }
      if (!applicantData) throw new Error('Applicant not found');
      
      // Fetch resume data
      const { data: resumeData } = await supabase
        .from('resumes')
        .select('*')
        .eq('applicant_id', id)
        .maybeSingle();
      
      // Fetch video assessment data
      const { data: videoData } = await supabase
        .from('video_assessments')
        .select('*')
        .eq('applicant_id', id)
        .maybeSingle();
      
      // Fetch personality test (work style assessment) data
      const { data: testData } = await supabase
        .from('work_style_assessments')
        .select('*')
        .eq('applicant_id', id)
        .maybeSingle();
      
      // Combine all data
      const fullApplicant: ApplicantWithDetails = {
        ...applicantData,
        resume: resumeData || undefined,
        video: videoData || undefined,
        test: testData || undefined,
      };
      
      setApplicant(fullApplicant);
       
    } catch (err) {
      console.error('Error fetching applicant data:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to load applicant data');
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onPrev, onNext, onClose]);

  // Reset tab when applicant changes
  useEffect(() => {
    setActiveTab('summary');
  }, [initialApplicant?.id]);

  // Sync internal state whenever the passed-in applicant changes (prev/next navigation)
  useEffect(() => {
    if (initialApplicant) {
      setApplicant(initialApplicant as ApplicantWithDetails);
      setFetchError(null);
    }
  }, [initialApplicant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data when modal opens or applicantId changes
  useEffect(() => {
    if (isOpen) {
      if (applicantId) {
        fetchApplicantData();
      } else if (initialApplicant) {
        setApplicant(initialApplicant as ApplicantWithDetails);
      }
    }
  }, [isOpen, applicantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription to applicant changes
  useEffect(() => {
    if (!isOpen || !applicant?.id) return;
    
    const channel = supabase
      .channel(`applicant-${applicant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applicants',
          filter: `id=eq.${applicant.id}`
        },
        (payload) => {
          // Update applicant with new data
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, ...payload.new } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'resumes',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, resume: payload.new as Resume } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_assessments',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, video: payload.new as VideoAssessment } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_style_assessments',
          filter: `applicant_id=eq.${applicant.id}`
        },
        (payload) => {
          if (payload.new) {
            setApplicant(prev => prev ? { ...prev, test: payload.new as PersonalityTest } : null);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, applicant?.id]);


  const parsedResume = applicant ? getParsedResumeData(applicant.resume) : null;
  // Screening is complete only when the applicant has an actual score, not just a resume file
  const isScreeningComplete = !!(applicant?.screening_score && applicant.screening_score > 0);
  const hasResume = !!applicant?.resume;
  const screeningScore = applicant?.screening_score ?? null;
  const screeningStatus = applicant?.screening_status ?? null;

  // Generate recent activity from available data
  const getRecentActivity = () => {
    const activities: Array<{ date: string; icon: React.ReactNode; text: string }> = [];
    
    // Applicant created (application submitted)
    if (applicant?.created_at) {
      activities.push({
        date: formatDate(applicant.created_at),
        icon: <User className="w-4 h-4" />,
        text: 'Application submitted'
      });
    }
    
    // Resume uploaded
    if (applicant?.resume?.uploaded_at) {
      activities.push({
        date: formatDate(applicant.resume.uploaded_at),
        icon: <FileText className="w-4 h-4" />,
        text: 'Resume uploaded'
      });
    }
    
    // Video assessment submitted
    if (applicant?.video?.submitted_at) {
      activities.push({
        date: formatDate(applicant.video.submitted_at),
        icon: <Video className="w-4 h-4" />,
        text: 'Video assessment completed'
      });
    }
    
    // Personality test submitted
    if (applicant?.test?.submitted_at) {
      activities.push({
        date: formatDate(applicant.test.submitted_at),
        icon: <Brain className="w-4 h-4" />,
        text: 'Personality test completed'
      });
    }
    
    return activities;
  };

  if (!isOpen) return null;
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Loading applicant data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (fetchError || !applicant) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-gray-900 font-semibold mb-2">Failed to load applicant</p>
              <p className="text-gray-500 text-sm mb-4">{fetchError || 'Applicant not found'}</p>
              <button
                onClick={fetchApplicantData}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* ===== HEADER SECTION ===== */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-start justify-between gap-6">
            {/* Left: Identity */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {applicant.photo_url ? (
                <img 
                  src={applicant.photo_url} 
                  alt={applicant.name}
                  className="w-16 h-16 rounded-2xl object-cover shadow-lg ring-2 ring-white"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-2 ring-white">
                  {applicant.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900">{applicant.name}</h2>
                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getStatusConfig(screeningStatus || applicant.status || 'pending').bgColor} ${getStatusConfig(screeningStatus || applicant.status || 'pending').color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusConfig(screeningStatus || applicant.status || 'pending').dotColor}`} />
                    {getStatusConfig(screeningStatus || applicant.status || 'pending').label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-gray-500">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm">{applicant.position}</span>
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ===== PREV / NEXT NAV ===== */}
        {totalCount != null && totalCount > 1 && (
          <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {currentIndex != null ? currentIndex + 1 : '—'} of {totalCount} applicants
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous applicant (←)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                onClick={onNext}
                disabled={!onNext}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next applicant (→)"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ===== QUICK ACTION BAR ===== */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-2 text-sm text-gray-500">
          <Mail className="w-4 h-4" />
          <a
            href={`mailto:${applicant.email}`}
            className="truncate max-w-[200px] text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {applicant.email}
          </a>
          {parsedResume?.phone && (
            <>
              <span className="text-gray-300">•</span>
              <Phone className="w-4 h-4" />
              <span>{parsedResume.phone}</span>
            </>
          )}
        </div>

        {/* ===== NAVIGATION TABS ===== */}
        <div className="px-6 border-b border-gray-200 bg-gray-50/50">
          <div className="flex gap-1 -mb-px">
            {[
              { id: 'summary', label: 'Summary', icon: Sparkles },
              { id: 'resume', label: 'Resume Details', icon: FileText },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-t-lg'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50/30">
          
          {/* ===== SUMMARY TAB ===== */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              
              {/* Section 1: AI Evaluation Summary */}
              {/* Pipeline Progress Bar */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Application Progress</h3>
                <div className="flex items-center justify-between">
                  {[
                    { step: 1, label: 'Applied', icon: User, complete: !!applicant?.created_at },
                    { step: 2, label: 'Resume', icon: FileText, complete: hasResume },
                    { step: 3, label: 'Screened', icon: Brain, complete: isScreeningComplete },
                    { step: 4, label: 'Video', icon: Video, complete: !!applicant?.video?.submitted_at },
                    { step: 5, label: 'Assessment', icon: ClipboardList, complete: !!applicant?.test?.submitted_at },
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        item.complete 
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-600' 
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <p className={`text-xs mt-2 font-medium ${item.complete ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
                {/* Progress Line */}
                <div className="relative mt-2">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2" />
                  <div 
                    className="absolute top-1/2 left-0 h-0.5 bg-emerald-500 -translate-y-1/2 transition-all duration-500"
                    style={{ 
                      width: `${(() => {
                        let completed = 0;
                        if (applicant?.created_at) completed++;
                        if (hasResume) completed++;
                        if (isScreeningComplete) completed++;
                        if (applicant?.video?.submitted_at) completed++;
                        if (applicant?.test?.submitted_at) completed++;
                        return (completed / 5) * 100;
                      })()}%` 
                    }}
                  />
                </div>
              </div>

              {isScreeningComplete ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-semibold text-gray-900">Screening Result</h3>
                      </div>
                      {screeningStatus && (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                          screeningStatus === 'passed' ? 'bg-green-50 text-green-700 border-green-200' :
                          screeningStatus === 'in_review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {screeningStatus === 'passed' ? 'Passed' : screeningStatus === 'in_review' ? 'In Review' : 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Score display */}
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className={`text-4xl font-bold ${
                        screeningScore! >= 78 ? 'text-green-600' :
                        screeningScore! >= 65 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {screeningScore}%
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">AI Screening Score</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {screeningScore! >= 78
                            ? 'Above qualified threshold — automatically granted assessment access'
                            : screeningScore! >= 65
                            ? 'Borderline — requires HR manual review before proceeding'
                            : 'Below review threshold — does not proceed further'}
                        </p>
                      </div>
                    </div>
                    {/* Skills summary if available */}
                    {parsedResume?.skills && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detected Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {((parsedResume.skills as SkillsMap).hard_skills || Object.values(parsedResume.skills as SkillsMap).flat()).slice(0, 12).map((skill: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium border border-indigo-100">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : hasResume ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">Screening Result</h3>
                    </div>
                  </div>
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-50 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-yellow-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Resume uploaded — awaiting AI scoring</p>
                    <p className="text-xs text-gray-500">The AI screening pipeline will process this resume shortly.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">Screening Result</h3>
                    </div>
                  </div>
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">No resume uploaded yet</p>
                    <p className="text-xs text-gray-500">Screening will begin once the applicant uploads their resume.</p>
                  </div>
                </div>
              )}

              {/* Two Column Layout: Candidate Snapshot + Key Insights */}
              <div className="grid grid-cols-2 gap-6">
                
                {/* Section 2: Candidate Snapshot */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-slate-600" />
                      <h3 className="font-semibold text-gray-900">Candidate Snapshot</h3>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm font-medium text-gray-900">{applicant.email}</p>
                      </div>
                    </div>
                    {parsedResume?.phone && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                          <Phone className="w-4 h-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-sm font-medium text-gray-900">{parsedResume.phone}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Applied Position</p>
                        <p className="text-sm font-medium text-gray-900">{applicant.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Applied Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {formatDate(applicant.created_at)}
                        </p>
                      </div>
                    </div>
                    {parsedResume?.experience && parsedResume.experience.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-cyan-500" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Experience</p>
                          <p className="text-sm font-medium text-gray-900">
                            {parsedResume.experience.length} position{parsedResume.experience.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Recent Activity */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-gray-900">Recent Activity</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    {(() => {
                      const activities = getRecentActivity();
                      return activities.length > 0 ? (
                        <div className="space-y-3">
                          {activities.map((activity, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                              <div className="flex-shrink-0 mt-0.5 text-blue-600">
                                {activity.icon}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-gray-700">{activity.text}</p>
                                <p className="text-xs text-gray-400 mt-1">{activity.date}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-400">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No activity recorded yet</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ===== RESUME TAB ===== */}
          {activeTab === 'resume' && (
            parsedResume ? (
            <div className="space-y-6">
              
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
                    {(parsedResume.education as ResumeEducation[]).map((edu, idx) => (
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
                      {Object.values(parsedResume.skills as Record<string, string | string[]>).flat().length} detected
                    </span>
                  </div>
                  <div className="p-5">
                    {/* Handle old format (hard_skills) and new NER format (category-based dict) */}
                    {(parsedResume.skills as SkillsMap).hard_skills ? (
                      <div className="flex flex-wrap gap-2">
                        {(parsedResume.skills as SkillsMap).hard_skills!.map((skill: string, idx: number) => (
                          <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(parsedResume.skills as SkillsMap).map(([category, skills]) => (
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
                    {(parsedResume.experience as ResumeExperience[]).map((exp, idx) => (
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
                    {(parsedResume.projects as ResumeProject[]).map((project, idx) => (
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
                    {(parsedResume.trainings as (ResumeTraining | string)[]).map((training, idx) => (
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
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">No resume data available</p>
                <p className="text-xs text-gray-500">
                  {applicant.resume?.resume_url
                    ? 'Resume was uploaded but has not been parsed yet.'
                    : 'No resume has been uploaded for this applicant.'}
                </p>
                {applicant.resume?.resume_url && (
                  <a
                    href={applicant.resume.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    View Raw Resume
                  </a>
                )}
              </div>
            )
          )}

        </div>
      </div>
    </div>
  );
}
