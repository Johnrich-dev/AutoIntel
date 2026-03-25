import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  FileText,
  Star,
  Clock,
  User,
  GraduationCap,
  Award,
  Target,
  Shield,
  Check,
  Sparkles,
  Brain,
  TrendingUp,
  Video,
  ClipboardList
} from 'lucide-react';
import { Applicant, Resume, ResumeParsedData, VideoAssessment, PersonalityTest } from '../lib/supabase';

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
  onClose
}: ApplicantDetailModalProps) {
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

  // Fetch data when modal opens or applicantId changes
  useEffect(() => {
    if (isOpen) {
      // If we have an applicantId, fetch fresh data
      if (applicantId) {
        fetchApplicantData();
      } else if (initialApplicant) {
        // Use the pre-loaded applicant data
        setApplicant(initialApplicant);
      }
    }
  }, [isOpen, applicantId]);

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
            setApplicant(prev => prev ? { ...prev, resume: payload.new as any } : null);
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
            setApplicant(prev => prev ? { ...prev, video: payload.new as any } : null);
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
            setApplicant(prev => prev ? { ...prev, test: payload.new as any } : null);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, applicant?.id]);

  const getScoreLabel = (score: number | undefined): { label: string; color: string } => {
    if (score === undefined || score === null) return { label: 'No Data', color: 'text-gray-500' };
    if (score >= 80) return { label: 'Strong Match', color: 'text-emerald-600' };
    if (score >= 60) return { label: 'Moderate Fit', color: 'text-amber-600' };
    if (score >= 40) return { label: 'Needs Review', color: 'text-orange-600' };
    return { label: 'Low Match', color: 'text-red-600' };
  };

  const getScoreBarColor = (score: number | undefined): string => {
    if (score === undefined || score === null) return 'bg-gray-200';
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const parsedResume = applicant ? getParsedResumeData(applicant.resume) : null;
  const isScreeningComplete = !!applicant?.resume;

  // Generate recent activity from available data
  const getRecentActivity = () => {
    const activities: Array<{ date: string; icon: React.ReactNode; text: string }> = [];
    
    // Applicant created (application submitted)
    if (applicant?.created_at) {
      const date = new Date(applicant.created_at);
      activities.push({
        date: date.toLocaleDateString(),
        icon: <User className="w-4 h-4" />,
        text: 'Application submitted'
      });
    }
    
    // Resume uploaded
    if (applicant?.resume?.uploaded_at) {
      const date = new Date(applicant.resume.uploaded_at);
      activities.push({
        date: date.toLocaleDateString(),
        icon: <FileText className="w-4 h-4" />,
        text: 'Resume uploaded'
      });
    }
    
    // Video assessment submitted
    if ((applicant as any)?.video?.submitted_at) {
      const date = new Date((applicant as any).video.submitted_at);
      activities.push({
        date: date.toLocaleDateString(),
        icon: <Video className="w-4 h-4" />,
        text: 'Video assessment completed'
      });
    }
    
    // Personality test submitted
    if ((applicant as any)?.test?.submitted_at) {
      const date = new Date((applicant as any).test.submitted_at);
      activities.push({
        date: date.toLocaleDateString(),
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        
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
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getStatusConfig(applicant.status || 'pending').bgColor} ${getStatusConfig(applicant.status || 'pending').color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusConfig(applicant.status || 'pending').dotColor}`} />
                    {getStatusConfig(applicant.status || 'pending').label}
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

        {/* ===== QUICK ACTION BAR ===== */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
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
          <div className="flex items-center gap-2">
          </div>
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
                    { step: 2, label: 'Screening', icon: Brain, complete: isScreeningComplete },
                    { step: 3, label: 'Video', icon: Video, complete: !!(applicant as any)?.video?.submitted_at },
                    { step: 4, label: 'Assessment', icon: ClipboardList, complete: !!(applicant as any)?.test?.submitted_at },
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
                        if (isScreeningComplete) completed++;
                        if ((applicant as any)?.video?.submitted_at) completed++;
                        if ((applicant as any)?.test?.submitted_at) completed++;
                        return (completed / 4) * 100;
                      })()}%` 
                    }}
                  />
                </div>
              </div>

              {isScreeningComplete ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold text-gray-900">AI Evaluation Summary</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    {/* Key Strengths */}
                    <div className="mb-5">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-600" />
                        Key Strengths
                      </h4>
                      <div className="space-y-2">
                        {parsedResume?.skills && parsedResume.skills.hard_skills && parsedResume.skills.hard_skills.length > 0 && (
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg">
                            <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Technical Skills:</span> Demonstrates {parsedResume.skills.hard_skills.length} relevant technical skills
                            </p>
                          </div>
                        )}
                        {parsedResume?.experience && parsedResume.experience.length > 0 && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                            <Briefcase className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Work Experience:</span> {parsedResume.experience.length} position{parsedResume.experience.length > 1 ? 's' : ''} of relevant experience
                            </p>
                          </div>
                        )}
                        {parsedResume?.education && parsedResume.education.length > 0 && (
                          <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg">
                            <GraduationCap className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Education:</span> {parsedResume.education[0]?.course_or_strand || parsedResume.education[0]?.school || 'Completed'}
                            </p>
                          </div>
                        )}
                        {applicant.resumeScore && applicant.resumeScore >= 70 && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                            <Star className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Resume Quality:</span> Strong resume with {Math.round(applicant.resumeScore)}% score - well-structured and comprehensive
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Why This Candidate */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-600" />
                        Why This Candidate is Good for the Position
                      </h4>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {applicant.name} demonstrates strong qualifications for the {applicant.position} role. 
                          {parsedResume?.experience && parsedResume.experience.length > 0 && 
                            ` With ${parsedResume.experience.length} year${parsedResume.experience.length > 1 ? 's' : ''} of professional experience, `}
                          {parsedResume?.skills && parsedResume.skills.hard_skills && parsedResume.skills.hard_skills.length > 0 &&
                            `they bring ${parsedResume.skills.hard_skills.length} technical skill${parsedResume.skills.hard_skills.length > 1 ? 's' : ''} that align with job requirements. `}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Placeholder when screening not complete */
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">AI Evaluation Summary</h3>
                    </div>
                  </div>
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Scores not yet available</p>
                    <p className="text-xs text-gray-500">AI evaluation is in progress. Check back once screening is complete.</p>
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
                          {new Date(applicant.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
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
                    {getRecentActivity().length > 0 ? (
                      <div className="space-y-3">
                        {getRecentActivity().map((activity, idx) => (
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
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ===== RESUME TAB ===== */}
          {activeTab === 'resume' && parsedResume && (
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

              {/* Match Indicator */}
              {applicant.resumeScore && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        applicant.resumeScore >= 70 ? 'bg-emerald-100' : applicant.resumeScore >= 50 ? 'bg-amber-100' : 'bg-red-100'
                      }`}>
                        <Target className={`w-5 h-5 ${
                          applicant.resumeScore >= 70 ? 'text-emerald-600' : applicant.resumeScore >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Job Match Indicator</p>
                        <p className="text-xs text-gray-500">
                          {applicant.resumeScore >= 70 ? 'Strong alignment with job requirements' :
                           applicant.resumeScore >= 50 ? 'Moderate alignment, review recommended' :
                           'Low alignment with position requirements'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${
                        applicant.resumeScore >= 70 ? 'text-emerald-600' : applicant.resumeScore >= 50 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {Math.round(applicant.resumeScore)}%
                      </span>
                      <p className="text-xs text-gray-500">match score</p>
                    </div>
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
                    {parsedResume.education.map((edu, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{(edu as any).course_or_strand || (edu as any).degree || (edu as any).field || 'Education'}</p>
                          <p className="text-sm text-gray-600">{(edu as any).school || (edu as any).institution || 'Unknown School'}</p>
                          {(edu as any).year_range || (edu as any).years ? (
                            <p className="text-xs text-gray-400 mt-1">{(edu as any).year_range || (edu as any).years}</p>
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
                    {(parsedResume.skills as any).hard_skills ? (
                      <div className="flex flex-wrap gap-2">
                        {(parsedResume.skills as any).hard_skills.map((skill: string, idx: number) => (
                          <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(parsedResume.skills as any).map(([category, skills]) => (
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
                    {parsedResume.experience.map((exp, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{(exp as any).role || (exp as any).title || 'Professional Experience'}</p>
                          <p className="text-sm text-gray-600">{(exp as any).company || (exp as any).organization || ''}</p>
                          {(exp as any).years || (exp as any).duration || (exp as any).year_range ? (
                            <p className="text-xs text-gray-400 mt-1">{(exp as any).years || (exp as any).duration || (exp as any).year_range}</p>
                          ) : null}
                          {(exp as any).summary || (exp as any).description ? (
                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{(exp as any).summary || (exp as any).description}</p>
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
                    {parsedResume.projects.map((project, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{(project as any).name || (project as any).title || 'Untitled Project'}</p>
                          {(project as any).details && (
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                              {typeof (project as any).details === 'string' 
                                ? (project as any).details 
                                : Array.isArray((project as any).details) 
                                  ? (project as any).details.join(' ') 
                                  : JSON.stringify((project as any).details)}
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
                    {parsedResume.trainings.map((training, idx) => (
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

          {/* VIDEO TAB REMOVED */}

          {/* WORK PROFILING TAB REMOVED */}

          {/* NOTES TAB REMOVED */}

          {/* COMMUNICATION TAB REMOVED */}
        </div>
      </div>
    </div>
  );
}
