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
  Loader2
} from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';

// Interfaces - separate from Applicant to avoid requiring all base fields
interface NeedsReviewApplicant {
  id: string;
  name?: string;
  email?: string;
  position?: string;
  resume?: any;
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
  onClose
}: {
  applicant: NeedsReviewApplicant | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [videoData, setVideoData] = useState<any>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

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
  }, [isOpen, applicant?.id]);

  if (!isOpen || !applicant) return null;

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
    { label: 'Skills', score: applicant.skills_score || 0, icon: Target },
    { label: 'Experience', score: applicant.experience_score || 0, icon: Briefcase },
    { label: 'Education', score: applicant.education_score || 0, icon: BookOpen },
    { label: 'Projects', score: applicant.projects_score || 0, icon: FolderOpen },
  ];

  return (
    <div className={`fixed inset-y-0 right-0 z-50 bg-white shadow-2xl transition-all duration-300 ${isFullscreen ? 'inset-0' : 'w-full max-w-2xl'}`}>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Applicant Details</h2>
          <p className="text-sm text-gray-500">Review and make decision</p>
        </div>
        <div className="flex items-center gap-2">
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
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100vh-180px)] p-6 bg-gray-50/30">
        
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <div>
                <span className="text-sm font-medium text-amber-800">Status: Needs Review</span>
                <p className="text-xs text-amber-600 mt-0.5">Borderline score - requires human decision</p>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Resume Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(applicant.screening_score || applicant.overall_score || 0)}`}>
                      {applicant.screening_score || applicant.overall_score || 0}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Video className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Video Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(applicant.video_assessment_score || 0)}`}>
                      {applicant.video_assessment_score || 0}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Work Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(applicant.work_style_score || 0)}`}>
                      {applicant.work_style_score || 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Applicant Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Applicant Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium text-gray-900">{applicant.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Job Applied</p>
                  <p className="font-medium text-gray-900">{applicant.position || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Overall Score</p>
                  <p className={`font-bold text-2xl ${getScoreColor(applicant.overall_score || 0)}`}>
                    {applicant.overall_score || 0}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date Screened</p>
                  <p className="font-medium text-gray-900">
                    {applicant.screened_at ? new Date(applicant.screened_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Insights & Suggestions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">Strong match in {applicant.matched_skills?.length || 0} required skills</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">Missing {applicant.missing_skills?.length || 0} key qualifications</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">Score falls in borderline range (60-79%)</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">AI Suggestion</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Based on the assessment scores, this candidate shows potential but requires further evaluation. Consider reviewing their video assessment and work profiling results before making a final decision.
                  </p>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">Recommended Action</p>
                    <p className="text-sm text-indigo-600 font-medium mt-1">Schedule interview to validate skills</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== RESUME TAB ===== */}
        {activeTab === 'resume' && (
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
                <button className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm">
                  View Resume
                </button>
              </div>
            </div>

            {/* Education Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/50 to-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Education</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">Education details will be displayed here.</p>
              </div>
            </div>

            {/* Skills Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Award className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Skills</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">Skills will be displayed here.</p>
              </div>
            </div>

            {/* Experience Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/50 to-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-violet-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Work Experience</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">Work experience details will be displayed here.</p>
              </div>
            </div>

            {/* Projects Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50/50 to-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Projects</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">Project details will be displayed here.</p>
              </div>
            </div>

            {/* Certifications Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/50 to-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Certifications & Training</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">Certifications and training will be displayed here.</p>
              </div>
            </div>
          </div>
        )}

        {/* ===== VIDEO TAB ===== */}
        {activeTab === 'video' && (
          <div className="space-y-6">
            
            {/* Overall Score KPI Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Overall Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(applicant.overall_score || 0)}`}>
                    {applicant.overall_score || 0}%
                  </p>
                </div>
                <div className="text-right">
                </div>
              </div>
            </div>

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
                    <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">No photo</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Video Snapshot</p>
                    <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">No snapshot</span>
                    </div>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="flex gap-2 mb-4">
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Verified – Same person
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    Mismatch – Possible issue
                  </button>
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
                      src={videoData.video_url}
                      controls
                      className="w-full rounded-lg bg-black"
                      preload="metadata"
                    />
                    <p className="text-xs text-gray-500 text-center">Submitted video assessment</p>
                    
                    {/* Transcription Section */}
                    {videoData.transcription && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Transcribed Answer</h4>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{videoData.transcription}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Video Score */}
                    {videoData.transcript_score !== null && videoData.transcript_score !== undefined && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">Video Assessment Score</span>
                          <span className={`text-lg font-bold ${getScoreColor(Math.round(videoData.transcript_score * 10))}`}>
                            {Math.round(videoData.transcript_score * 10)}%
                          </span>
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

          </div>
        )}

        {/* ===== WORK TAB ===== */}
        {activeTab === 'work' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Profiling</h3>
              <p className="text-sm text-gray-500">Work profiling content will be displayed here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
