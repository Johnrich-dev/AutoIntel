import { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  Target,
  User,
  Check,
  AlertTriangle,
  Video,
  ClipboardCheck,
  BookOpen,
  Save,
  ExternalLink,
  Maximize2,
  Minimize2,
  FolderOpen,
  Briefcase,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
  BarChart3,
  Users,
  MessageSquare
} from 'lucide-react';
import { VideoAssessmentTab } from './VideoAssessmentTab';
import { WorkProfilingTab } from './WorkProfilingTab';

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
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'notes', label: 'Notes & Decision', icon: MessageSquare },
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
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [activeAssessmentTab, setActiveAssessmentTab] = useState<'video' | 'work' | null>(null);

  useEffect(() => {
    if (applicant) {
      const saved = localStorage.getItem(`needs_review_notes_${applicant.id}`);
      if (saved) {
        setNotes(saved);
        setSavedNotes(saved);
      } else {
        setNotes('');
        setSavedNotes('');
      }
    }
  }, [applicant]);

  const handleSaveNotes = () => {
    if (applicant) {
      localStorage.setItem(`needs_review_notes_${applicant.id}`, notes);
      setSavedNotes(notes);
    }
  };

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

            {/* Score Breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Breakdown</h3>
              <div className="space-y-4">
                {scoreCategories.map((cat) => (
                  <div key={cat.label} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <cat.icon className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                        <span className={`text-sm font-semibold ${getScoreColor(cat.score)}`}>{cat.score}%</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getScoreBgColor(cat.score)}`}
                          style={{ width: `${cat.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reason for Review */}
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-amber-900">Reason for Review</h3>
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">
                {applicant.reason_for_review || applicant.key_issue || 'Candidate has a borderline score that requires human evaluation to make a final decision.'}
              </p>
            </div>
          </div>
        )}



        {/* ===== ASSESSMENTS TAB ===== */}
        {activeTab === 'assessments' && (
          <div className="space-y-6">
            {/* Assessment Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Assessment Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => applicant.video_assessment_score && setActiveAssessmentTab('video')}
                  disabled={!applicant.video_assessment_score}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    applicant.video_assessment_score
                      ? 'bg-green-50 hover:bg-green-100 cursor-pointer border border-green-200'
                      : 'bg-gray-50 cursor-not-allowed border border-gray-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${applicant.video_assessment_score ? 'bg-green-100' : 'bg-gray-200'}`}>
                    <Video className={`w-5 h-5 ${applicant.video_assessment_score ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-500">Video Assessment</p>
                    <p className={`text-sm font-medium ${applicant.video_assessment_score ? 'text-green-600' : 'text-gray-400'}`}>
                      {applicant.video_assessment_score ? 'Completed - Click to view' : 'Not Submitted'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => applicant.work_style_score && setActiveAssessmentTab('work')}
                  disabled={!applicant.work_style_score}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    applicant.work_style_score
                      ? 'bg-green-50 hover:bg-green-100 cursor-pointer border border-green-200'
                      : 'bg-gray-50 cursor-not-allowed border border-gray-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${applicant.work_style_score ? 'bg-green-100' : 'bg-gray-200'}`}>
                    <ClipboardCheck className={`w-5 h-5 ${applicant.work_style_score ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-500">Work Profiling</p>
                    <p className={`text-sm font-medium ${applicant.work_style_score ? 'text-green-600' : 'text-gray-400'}`}>
                      {applicant.work_style_score ? 'Completed - Click to view' : 'Not Submitted'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Assessment Tab Content */}
            {activeAssessmentTab && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {activeAssessmentTab === 'video' ? (
                  <VideoAssessmentTab
                    applicantId={applicant.id}
                    videoScore={applicant.video_assessment_score}
                    onClose={() => setActiveAssessmentTab(null)}
                  />
                ) : (
                  <WorkProfilingTab
                    applicantId={applicant.id}
                    workStyleScore={applicant.work_style_score}
                    onClose={() => setActiveAssessmentTab(null)}
                  />
                )}
              </div>
            )}


          </div>
        )}

        {/* ===== NOTES & DECISION TAB ===== */}
        {activeTab === 'notes' && (
          <div className="space-y-6">
            {/* Reason for Review */}
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-amber-900">Reason for Review</h3>
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">
                {applicant.reason_for_review || applicant.key_issue || 'Candidate has a borderline score that requires human evaluation to make a final decision.'}
              </p>
            </div>

            {/* Notes Section */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">HR Notes</h3>
                <button
                  onClick={handleSaveNotes}
                  disabled={notes === savedNotes}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    notes === savedNotes
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your evaluation notes here..."
                className="w-full h-32 p-3 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {notes !== savedNotes && notes.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">You have unsaved changes</p>
              )}
            </div>

            {/* Decision Actions */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Decision</h3>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors font-medium">
                  <Check className="w-4 h-4" />
                  Approve
                </button>
                <button className="flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-medium">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

