import {
  X,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Star,
  Briefcase,
  Award,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Applicant, Resume } from '../lib/supabase';

interface ScreenedApplicant extends Applicant {
  resume?: Resume;
  overall_score?: number;
  skills_score?: number;
  experience_score?: number;
  education_score?: number;
  screening_status?: 'passed' | 'needs_review' | 'failed';
  screening_stage?: 'screened' | 'review' | 'shortlisted';
  screened_at?: string;
  matched_skills?: string[];
  missing_skills?: string[];
}

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  passed: {
    label: 'Passed',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: CheckCircle,
  },
  needs_review: {
    label: 'Needs Review',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: AlertCircle,
  },
  failed: {
    label: 'Failed',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.failed;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

interface ScreeningDetailModalProps {
  applicant: ScreenedApplicant;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ScreeningDetailModal({
  applicant,
  onClose,
  onApprove,
  onReject,
}: ScreeningDetailModalProps) {
  const hasResumeData = applicant.resume?.parsed_data && typeof applicant.resume?.parsed_data === 'object';
  const parsedData = hasResumeData ? applicant.resume?.parsed_data : null;

  const matchedSkills = applicant.matched_skills || [];
  const missingSkills = applicant.missing_skills || [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      
      {/* Side Panel */}
      <div className="fixed inset-y-0 right-0 z-50 bg-white shadow-2xl w-full max-w-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Applicant Details</h2>
            <p className="text-sm text-gray-500 mt-1">{applicant.name} - {applicant.position}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6">
          {/* Overall Score */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-blue-600 font-medium">Overall Score</p>
                  <p className="text-3xl font-bold text-blue-900">{Math.round(applicant.overall_score || 0)}%</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-600 font-medium">Status</p>
                <StatusBadge status={applicant.screening_status || 'failed'} />
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              Score Breakdown
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium text-gray-500">Skills</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{Math.round(applicant.skills_score || 0)}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-gray-500">Experience</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{Math.round(applicant.experience_score || 0)}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-gray-500">Education</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{Math.round(applicant.education_score || 0)}%</p>
              </div>
            </div>
          </div>

          {/* Skills Match */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Matched Skills ({matchedSkills.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {matchedSkills.length > 0 ? (
                  matchedSkills.map((skill, i) => (
                    <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-green-600">No matched skills data</span>
                )}
              </div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Missing Skills ({missingSkills.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {missingSkills.length > 0 ? (
                  missingSkills.map((skill, i) => (
                    <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-red-600">No missing skills data</span>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          {applicant.screening_status === 'passed' && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Why This Candidate Passed
              </h4>
              <p className="text-sm text-green-700">
                Strong overall profile with {Math.round(applicant.overall_score || 0)}% score. Candidate demonstrates adequate qualifications 
                and meets the minimum requirements for the {applicant.position} position.
              </p>
            </div>
          )}

          {applicant.screening_status === 'failed' && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Why This Candidate Did Not Pass
              </h4>
              <p className="text-sm text-red-700">
                Overall score of {Math.round(applicant.overall_score || 0)}% is below the minimum threshold. Key areas for improvement include 
                {missingSkills.length > 0 ? ` missing skills: ${missingSkills.slice(0, 3).join(', ')}` : ' overall qualification alignment'}.
              </p>
            </div>
          )}

          {applicant.screening_status === 'needs_review' && (
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
              <h4 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Requires Human Review
              </h4>
              <p className="text-sm text-yellow-700">
                This candidate has an ambiguous profile with {Math.round(applicant.overall_score || 0)}% score. 
                Manual review is recommended to make a final determination.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50">
          <div className="text-sm text-gray-500">
            Screened on {new Date(applicant.screened_at || applicant.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onReject(applicant.id)}
              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => onApprove(applicant.id)}
              className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Approve
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
