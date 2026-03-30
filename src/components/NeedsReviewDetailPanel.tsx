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
  FileText
} from 'lucide-react';

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
  const [activeComparisonTab, setActiveComparisonTab] = useState<'skills' | 'experience' | 'education'>('skills');

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

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100vh-180px)] p-6 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <div>
            <span className="text-sm font-medium text-amber-800">Status: Needs Review</span>
            <p className="text-xs text-amber-600 mt-0.5">Borderline score - requires human decision</p>
          </div>
        </div>

        {/* Applicant Summary */}
        <div className="bg-gray-50 rounded-2xl p-5">
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
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
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
                      className={`h-full rounded-full transition-all ${
                        cat.score >= 80 ? 'bg-green-500' : cat.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Match Insights */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Match Insights</h3>
          
          {/* Matched Skills */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Matched Skills</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {applicant.matched_skills && applicant.matched_skills.length > 0 ? (
                applicant.matched_skills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-400 italic">No matching skills found</span>
              )}
            </div>
          </div>

          {/* Missing Skills */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-gray-700">Missing Skills</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {applicant.missing_skills && applicant.missing_skills.length > 0 ? (
                applicant.missing_skills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-400 italic">No critical missing skills</span>
              )}
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Qualifications vs Requirements</h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['skills', 'experience', 'education'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveComparisonTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeComparisonTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Applicant Qualifications */}
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Applicant</span>
              </div>
              <ul className="space-y-2 text-sm">
                {applicant.matched_skills?.slice(0, 5).map((skill, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-green-700">
                    <Check className="w-3 h-3" />
                    {skill}
                  </li>
                ))}
                {applicant.missing_skills?.slice(0, 3).map((skill, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-red-600">
                    <X className="w-3 h-3" />
                    {skill}
                  </li>
                ))}
              </ul>
            </div>

            {/* Job Requirements */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Requirements</span>
              </div>
              <ul className="space-y-2 text-sm">
                {applicant.job_requirements?.slice(0, 5).map((req, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-blue-700">
                    <Target className="w-3 h-3" />
                    {req}
                  </li>
                ))}
                {(!applicant.job_requirements || applicant.job_requirements.length === 0) && (
                  <li className="text-blue-400 italic text-xs">No specific requirements defined</li>
                )}
              </ul>
            </div>
          </div>

          {/* Comparison Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-gray-500">Strong match</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-500">Partial match</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-500">Gap</span>
            </div>
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

        {/* Assessment Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assessment Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${applicant.video_assessment_score ? 'bg-green-100' : 'bg-gray-200'}`}>
                <Video className={`w-5 h-5 ${applicant.video_assessment_score ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Video Assessment</p>
                <p className={`text-sm font-medium ${applicant.video_assessment_score ? 'text-green-600' : 'text-gray-400'}`}>
                  {applicant.video_assessment_score ? 'Completed' : 'Not Submitted'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${applicant.work_style_score ? 'bg-green-100' : 'bg-gray-200'}`}>
                <ClipboardCheck className={`w-5 h-5 ${applicant.work_style_score ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Work Profiling</p>
                <p className={`text-sm font-medium ${applicant.work_style_score ? 'text-green-600' : 'text-gray-400'}`}>
                  {applicant.work_style_score ? 'Completed' : 'Not Submitted'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resume Access */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume</h3>
          <button className="flex items-center justify-center gap-2 w-full py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">
            <FileText className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">View Full Resume</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
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
