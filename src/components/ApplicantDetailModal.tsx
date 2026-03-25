import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  FileText,
  Star,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Trash2,
  Plus,
  Download,
  ExternalLink,
  User,
  GraduationCap,
  Award,
  Target,
  Zap,
  Shield,
  AlertTriangle,
  Check,
  MoreHorizontal,
  ChevronDown,
  Sparkles,
  Brain,
  ListChecks,
  TrendingUp,
  Clock3,
  MessageSquare,
  Video,
  ClipboardCheck
} from 'lucide-react';
import { Applicant, Resume, ResumeParsedData } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
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

// Available tags
const AVAILABLE_TAGS = ['Priority', 'Referral', 'Follow-up', 'Top Pick', 'Fast Track', 'Interview Scheduled', 'Background Check', 'Offer Sent'];

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

const getTagColor = (tag: string) => {
  const colors: Record<string, string> = {
    'Priority': 'bg-red-100 text-red-700 border-red-200',
    'Referral': 'bg-blue-100 text-blue-700 border-blue-200',
    'Follow-up': 'bg-amber-100 text-amber-700 border-amber-200',
    'Top Pick': 'bg-purple-100 text-purple-700 border-purple-200',
    'Fast Track': 'bg-green-100 text-green-700 border-green-200',
    'Interview Scheduled': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Background Check': 'bg-orange-100 text-orange-700 border-orange-200',
    'Offer Sent': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return colors[tag] || 'bg-gray-100 text-gray-700 border-gray-200';
};

export function ApplicantDetailModal({
  applicantId,
  applicant: initialApplicant,
  isOpen,
  onClose
}: ApplicantDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'resume'>('summary');
  const [tags, setTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  
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
        .single();
      
      // Combine all data
      const fullApplicant: ApplicantWithDetails = {
        ...applicantData,
        resume: resumeData || undefined,
      };
      
      setApplicant(fullApplicant);
      
      // Load local storage data
      const savedTags = localStorage.getItem(`applicant_tags_${id}`);
      
      if (savedTags) setTags(JSON.parse(savedTags));
      
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
        const savedTags = localStorage.getItem(`applicant_tags_${initialApplicant.id}`);
        
        if (savedTags) setTags(JSON.parse(savedTags));
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
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, applicant?.id]);

  // Save tags to localStorage
  const saveTags = (newTags: string[]) => {
    if (applicant) {
      localStorage.setItem(`applicant_tags_${applicant.id}`, JSON.stringify(newTags));
      setTags(newTags);
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter(t => t !== tag);
    saveTags(newTags);
  };

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

  // Generate key insights from available data
  const getKeyInsights = () => {
    const insights: Array<{ type: 'strength' | 'concern' | 'info'; icon: React.ReactNode; text: string }> = [];
    
    if (applicant?.resumeScore && applicant.resumeScore >= 70) {
      insights.push({
        type: 'strength',
        icon: <CheckCircle className="w-4 h-4" />,
        text: `Strong resume with ${Math.round(applicant.resumeScore)}% score`
      });
    }
    
    if (parsedResume?.experience && parsedResume.experience.length > 0) {
      insights.push({
        type: 'info',
        icon: <Briefcase className="w-4 h-4" />,
        text: `${parsedResume.experience.length} professional experience${parsedResume.experience.length > 1 ? 's' : ''} detected`
      });
    }
    
    if (parsedResume?.skills) {
      const skillCount = Object.values(parsedResume.skills as Record<string, string | string[]>).flat().length;
      insights.push({
        type: 'info',
        icon: <Award className="w-4 h-4" />,
        text: `${skillCount} skills identified`
      });
    }
    
    if (applicant?.overall && applicant.overall < 50) {
      insights.push({
        type: 'concern',
        icon: <AlertTriangle className="w-4 h-4" />,
        text: 'Overall score below threshold'
      });
    }
    
    return insights;
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
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
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
                {/* Tags */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {tags.map(tag => (
                    <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}>
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <div className="relative">
                    <button
                      onClick={() => setShowTagDropdown(!showTagDropdown)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Tag
                    </button>
                    {showTagDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1">
                        {AVAILABLE_TAGS.filter(t => !tags.includes(t)).map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                              if (!tags.includes(tag)) {
                                const newTags = [...tags, tag];
                                saveTags(newTags);
                              }
                              setShowTagDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Overall Score - Only show when screening complete */}
            {isScreeningComplete ? (
              <div className="flex-shrink-0 text-center px-6 border-l border-gray-100">
                <div className="text-4xl font-bold text-gray-900">{applicant.overall ? Math.round(applicant.overall) : '-'}</div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-1">Overall Score</div>
                {applicant.overall && (
                  <div className={`text-sm font-medium mt-1 ${getScoreLabel(applicant.overall).color}`}>
                    {getScoreLabel(applicant.overall).label}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-shrink-0 text-center px-6 border-l border-gray-100">
                <div className="text-2xl font-bold text-gray-400">-</div>
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mt-1">Awaiting</div>
              </div>
            )}

            {/* Close Button */}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ===== QUICK ACTION BAR ===== */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Mail className="w-4 h-4" />
            <span className="truncate max-w-[200px]">{applicant.email}</span>
            {parsedResume?.phone && (
              <>
                <span className="text-gray-300">•</span>
                <Phone className="w-4 h-4" />
                <span>{parsedResume.phone}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Decision Actions - Only enabled when screening is complete */}
            {isScreeningComplete ? (
              <>
                <button className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium shadow-sm">
                  <AlertCircle className="w-4 h-4" />
                  Needs Review
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm">
                  <CheckCircle className="w-4 h-4" />
                  Shortlist
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium border border-red-200">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </>
            ) : (
              <>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <AlertCircle className="w-4 h-4" />
                  Needs Review
                </button>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <CheckCircle className="w-4 h-4" />
                  Shortlist
                </button>
                <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed opacity-60">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
            
            {/* Secondary Actions Dropdown - Always available but some disabled */}
            <div className="relative">
              <button
                onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                <MoreHorizontal className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showActionsDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1">
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4 text-gray-400" />
                    Export Report
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                    Open in New Tab
                  </button>
                </div>
              )}
            </div>
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
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          
          {/* ===== SUMMARY TAB ===== */}
          {activeTab === 'summary' && (
            <div className="space-y-6 max-w-5xl">
              
              {/* Section 1: AI Evaluation Summary - Only show when screening complete */}
              {isScreeningComplete ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold text-gray-900">AI Evaluation Summary</h3>
                    </div>
                  </div>
                  <div className="p-5">
                  {/* Score Cards Grid */}
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    {[
                      { label: 'Resume Score', score: applicant.resumeScore, icon: FileText, color: 'emerald' },
                      { label: 'Overall Score', score: applicant.overall, icon: Star, color: 'indigo', highlight: true },
                    ].map((item, idx) => (
                      <div key={idx} className={`rounded-xl p-4 ${item.highlight ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50/50 border border-gray-100'}`}>
                        <div className={`w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center ${item.highlight ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                          <item.icon className={`w-5 h-5 ${item.highlight ? 'text-indigo-600' : 'text-gray-500'}`} />
                        </div>
                        <div className="text-center">
                          <p className={`text-2xl font-bold ${item.highlight ? 'text-indigo-700' : 'text-gray-900'}`}>
                            {item.score ? Math.round(item.score) : '-'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                          {item.score && (
                            <p className={`text-xs font-medium mt-1 ${getScoreLabel(item.score).color}`}>
                              {getScoreLabel(item.score).label}
                            </p>
                          )}
                        </div>
                        {/* Progress Bar */}
                        {item.score !== undefined && item.score !== null && (
                          <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${getScoreBarColor(item.score)} transition-all`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Score Breakdown Legend */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 justify-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Strong (80+)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Moderate (60-79)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>Review (40-59)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span>Low (&lt;40)</span>
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

                {/* Section 3: Key Insights */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/50 to-white">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-gray-900">Key Insights</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    {getKeyInsights().length > 0 ? (
                      <div className="space-y-3">
                        {getKeyInsights().map((insight, idx) => (
                          <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
                            insight.type === 'strength' ? 'bg-emerald-50/50' : 
                            insight.type === 'concern' ? 'bg-red-50/50' : 'bg-blue-50/50'
                          }`}>
                            <div className={`flex-shrink-0 mt-0.5 ${
                              insight.type === 'strength' ? 'text-emerald-600' : 
                              insight.type === 'concern' ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {insight.icon}
                            </div>
                            <p className={`text-sm ${
                              insight.type === 'strength' ? 'text-emerald-800' : 
                              insight.type === 'concern' ? 'text-red-800' : 'text-gray-700'
                            }`}>
                              {insight.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400">
                        <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No insights available yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ===== RESUME TAB ===== */}
          {activeTab === 'resume' && parsedResume && (
            <div className="space-y-6 max-w-5xl">
              
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
                      <Download className="w-4 h-4" />
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
