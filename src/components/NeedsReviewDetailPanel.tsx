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
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [videoSnapshotUrl, setVideoSnapshotUrl] = useState<string | null>(null);
  const [videoReviewed, setVideoReviewed] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [verifyingVideo, setVerifyingVideo] = useState(false);

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
        headers: {
          'Content-Type': 'application/json',
        },
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
        if (verificationStatus === 'verified') {
          alert('Applicant verified and moved to shortlisted!');
        } else {
          alert('Rejection email sent successfully!');
        }
        // Close the panel after successful verification
        onClose();
      } else {
        alert(`Error: ${result.error || 'Failed to process verification'}`);
      }
    } catch (error) {
      console.error('Error during video verification:', error);
      alert('Failed to process video verification. Please try again.');
    } finally {
      setVerifyingVideo(false);
    }
  };

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
  }, [isOpen, applicant?.id]);

  // Capture video frame when video data is loaded
  useEffect(() => {
    if (!videoData?.video_url) {
      setVideoSnapshotUrl(null);
      return;
    }

    const video = document.createElement('video');
    video.src = videoData.video_url;
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
            skills_score: applicant.skills_score || 0,
            experience_score: applicant.experience_score || 0,
            education_score: applicant.education_score || 0,
            projects_score: applicant.projects_score || 0,
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

    if (isOpen && applicant) {
      fetchAiInsights();
    }
  }, [isOpen, applicant?.id]);

  // Mark video as reviewed
  const handleMarkVideoReviewed = async () => {
    if (!applicant?.id) return;
    
    setMarkingReviewed(true);
    try {
      const adminClient = getSupabaseAdminClient();
      const { error } = await adminClient
        .from('video_assessments')
        .update({ 
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'HR Reviewer'
        })
        .eq('applicant_id', applicant.id);
      
      if (error) throw error;
      setVideoReviewed(true);
    } catch (err) {
      console.error('Error marking video as reviewed:', err);
    } finally {
      setMarkingReviewed(false);
    }
  };

  if (!isOpen || !applicant) return null;

  // Helper function to parse resume data
  const getParsedResumeData = (resume: any) => {
    if (!resume?.parsed_data) return null;
    if (typeof resume.parsed_data === 'object') return resume.parsed_data;
    try {
      return JSON.parse(resume.parsed_data);
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
                {loadingInsights ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  </div>
                ) : aiInsights?.insights ? (
                  <div className="space-y-3">
                    {aiInsights.insights.map((insight: any, index: number) => (
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
                    {aiInsights.suggestions.map((suggestion: any, index: number) => (
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
                  <button 
                    onClick={() => handleVideoVerification('verified')}
                    disabled={verifyingVideo}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyingVideo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Verified 
                  </button>
                  <button 
                    onClick={() => handleVideoVerification('mismatch')}
                    disabled={verifyingVideo}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyingVideo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    Mismatch 
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
                    
                    {/* Mark as Reviewed Button */}
                    <button
                      onClick={handleMarkVideoReviewed}
                      disabled={videoReviewed || markingReviewed}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        videoReviewed 
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {markingReviewed ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : videoReviewed ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {videoReviewed ? 'Video Reviewed' : 'Mark Video as Reviewed'}
                    </button>
                    
                    {/* Transcription Section */}
                    {videoData.transcription && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Transcribed Answer</h4>
                        <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          {(() => {
                            // Split transcription into sentences and estimate timestamps
                            const text = videoData.transcription;
                            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
                            const wordsPerMinute = 150;
                            const wordsPerSecond = wordsPerMinute / 60;
                            let currentTime = 0;
                            
                            return sentences.map((sentence: string, index: number) => {
                              const words = sentence.trim().split(/\s+/).length;
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

                <div className="space-y-4">
                  {/* Relevance Score */}
                  {videoData.relevance_score !== null && videoData.relevance_score !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-800">Relevance to Job</span>
                        </div>
                        <span className={`text-lg font-bold ${getScoreColor(Math.round(videoData.relevance_score * 10))}`}>
                          {Math.round(videoData.relevance_score * 10)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full ${getScoreBgColor(Math.round(videoData.relevance_score * 10))}`}
                          style={{ width: `${Math.round(videoData.relevance_score * 10)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">Measures how well the response addresses the job requirements and responsibilities.</p>
                    </div>
                  )}

                  {/* Experience Score */}
                  {videoData.experience_score !== null && videoData.experience_score !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-gray-800">Experience Demonstration</span>
                        </div>
                        <span className={`text-lg font-bold ${getScoreColor(Math.round(videoData.experience_score * 10))}`}>
                          {Math.round(videoData.experience_score * 10)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full ${getScoreBgColor(Math.round(videoData.experience_score * 10))}`}
                          style={{ width: `${Math.round(videoData.experience_score * 10)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">Evaluates how effectively the candidate demonstrates relevant work experience and achievements.</p>
                    </div>
                  )}

                  {/* Skills Score */}
                  {videoData.skills_score !== null && videoData.skills_score !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-gray-800">Skills Alignment</span>
                        </div>
                        <span className={`text-lg font-bold ${getScoreColor(Math.round(videoData.skills_score * 10))}`}>
                          {Math.round(videoData.skills_score * 10)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full ${getScoreBgColor(Math.round(videoData.skills_score * 10))}`}
                          style={{ width: `${Math.round(videoData.skills_score * 10)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">Assesses how well the candidate's mentioned skills match the required qualifications.</p>
                    </div>
                  )}

                  {/* Completeness Score */}
                  {videoData.completeness_score !== null && videoData.completeness_score !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-violet-600" />
                          <span className="text-sm font-semibold text-gray-800">Response Completeness</span>
                        </div>
                        <span className={`text-lg font-bold ${getScoreColor(Math.round(videoData.completeness_score * 10))}`}>
                          {Math.round(videoData.completeness_score * 10)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full ${getScoreBgColor(Math.round(videoData.completeness_score * 10))}`}
                          style={{ width: `${Math.round(videoData.completeness_score * 10)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">Evaluates the thoroughness and depth of the candidate's response to the assessment question.</p>
                    </div>
                  )}

                  {/* Overall Transcript Score */}
                  {videoData.transcript_score !== null && videoData.transcript_score !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-600" />
                          <span className="text-base font-bold text-gray-900">Overall Transcript Score</span>
                        </div>
                        <span className={`text-2xl font-bold ${getScoreColor(Math.round(videoData.transcript_score * 10))}`}>
                          {Math.round(videoData.transcript_score * 10)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">Combined score based on relevance, experience, skills, and completeness of the transcribed response.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

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
