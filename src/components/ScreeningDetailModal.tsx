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
  Lightbulb,
} from 'lucide-react';
import { Applicant, Resume } from '../lib/supabase';

interface ScreenedApplicant extends Applicant {
  resume?: Resume;
  overall_score?: number;
  skills_score?: number;
  experience_score?: number;
  education_score?: number;
  screening_status?: 'passed' | 'in_review' | 'failed';
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
  in_review: {
    label: 'In Review',
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

// Helper functions for AI insights
function getAlternativeRoles(skills: string[]): string[] {
  const skillLower = skills.map(s => s.toLowerCase());
  
  const roleMappings: Record<string, string[]> = {
    'python': ['Data Scientist', 'ML Engineer', 'Backend Developer'],
    'sql': ['Data Analyst', 'Business Analyst', 'Database Administrator'],
    'tableau': ['Data Analyst', 'BI Developer', 'Analytics Manager'],
    'powerbi': ['BI Analyst', 'Data Analyst', 'Analytics Manager'],
    'excel': ['Data Analyst', 'Financial Analyst', 'Business Analyst'],
    'machine learning': ['ML Engineer', 'Data Scientist', 'AI Developer'],
    'deep learning': ['AI Engineer', 'Data Scientist', 'Research Scientist'],
    'nlp': ['NLP Engineer', 'AI Developer', 'Computational Linguist'],
    'aws': ['Cloud Engineer', 'DevOps Engineer', 'Solutions Architect'],
    'azure': ['Cloud Developer', 'Data Engineer', 'Solutions Architect'],
    'gcp': ['Cloud Engineer', 'Data Engineer', 'ML Engineer'],
    'spark': ['Data Engineer', 'Big Data Developer', 'ML Engineer'],
    'hadoop': ['Big Data Engineer', 'Data Scientist', 'Systems Administrator'],
    'kafka': ['Data Engineer', 'Backend Developer', 'DevOps Engineer'],
    'airflow': ['Data Engineer', 'ML Ops Engineer', 'Analytics Engineer'],
    'docker': ['DevOps Engineer', 'Backend Developer', 'Cloud Engineer'],
    'kubernetes': ['DevOps Engineer', 'Cloud Engineer', 'Platform Engineer'],
    'snowflake': ['Data Engineer', 'Analytics Engineer', 'BI Developer'],
    'postgresql': ['Backend Developer', 'Database Administrator', 'Data Engineer'],
    'mongodb': ['Backend Developer', 'Full Stack Developer', 'Data Engineer'],
  };

  const roles = new Set<string>();
  
  for (const skill of skillLower) {
    for (const [key, value] of Object.entries(roleMappings)) {
      if (skill.includes(key) || key.includes(skill)) {
        value.forEach(role => roles.add(role));
      }
    }
  }

  const defaultRoles = ['Data Analyst', 'Business Analyst', 'Junior Developer', 'Technical Support'];
  
  if (roles.size === 0) {
    return defaultRoles.slice(0, 3);
  }

  return Array.from(roles).slice(0, 3);
}

  // Get strengths insight based on available scores
  const getStrengthsInsight = (applicant: ScreenedApplicant): string => {
    const skills = applicant.skills_score || 0;
    const experience = applicant.experience_score || 0;
    const education = applicant.education_score || 0;
    const overall = applicant.overall_score || 0;
    
    // If no scores at all, provide a generic insight
    if (skills === 0 && experience === 0 && education === 0) {
      return 'No detailed score data available. The overall screening score is ' + Math.round(overall) + '%.';
    }
    
    // Find highest score
    const scores = [
      { name: 'Skills', score: skills },
      { name: 'Experience', score: experience },
      { name: 'Education', score: education },
    ].sort((a, b) => b.score - a.score);

    const topStrength = scores[0];
    const secondStrength = scores[1];

    if (topStrength.score >= 80) {
      return `Strong ${topStrength.name.toLowerCase()} foundation (${Math.round(topStrength.score)}%). ${secondStrength.name.toLowerCase()} is also solid at ${Math.round(secondStrength.score)}%. Overall score: ${Math.round(overall)}%.`;
    } else if (topStrength.score >= 60) {
      return `Good potential in ${topStrength.name.toLowerCase()} (${Math.round(topStrength.score)}%). Consider developing ${secondStrength.name.toLowerCase()} skills further. Overall score: ${Math.round(overall)}%.`;
    } else {
      return `Area for growth across all dimensions. Overall score: ${Math.round(overall)}%. Recommended to focus on foundational skills development.`;
    }
  };

interface ScreeningDetailModalProps {
  applicant: ScreenedApplicant;
  onClose: () => void;
}

export function ScreeningDetailModal({
  applicant,
  onClose,
}: ScreeningDetailModalProps) {
  const hasResumeData = applicant.resume?.parsed_data && typeof applicant.resume?.parsed_data === 'object';
  const parsedData = hasResumeData ? applicant.resume?.parsed_data : null;

  const matchedSkills = applicant.matched_skills || [];
  const missingSkills = applicant.missing_skills || [];
  
  console.log('ScreeningDetailModal - applicant:', applicant.name);
  console.log('ScreeningDetailModal - matched_skills:', matchedSkills);
  console.log('ScreeningDetailModal - skills_score:', applicant.skills_score);

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
                <CheckCircle className="w-4 h-4" />
                Passed Screening
              </h4>
              <p className="text-sm text-green-700">
                This candidate has passed the initial screening with a score of {Math.round(applicant.overall_score || 0)}%. 
                They have been automatically granted access to complete preliminary assessments (video and work style tests).
              </p>
            </div>
          )}

          {applicant.screening_status === 'in_review' && (
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
              <h4 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Requires Manual Review
              </h4>
              <p className="text-sm text-yellow-700">
                This candidate falls below the qualified threshold ({Math.round(applicant.overall_score || 0)}%) and requires manual HR evaluation. 
                HR can decide whether to grant access to assessments or not.
              </p>
            </div>
          )}

          {applicant.screening_status === 'failed' && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Did Not Pass Screening
              </h4>
              <p className="text-sm text-red-700">
                This candidate scored {Math.round(applicant.overall_score || 0)}% which is below the review threshold. 
                They do not proceed further in the pipeline.
              </p>
            </div>
          )}

          {/* AI Insights */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
            <h4 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              AI Career Insights
            </h4>
            <div className="space-y-3">
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-700 mb-1">Alternative Roles</p>
                <p className="text-sm text-gray-700">
                  {matchedSkills.length > 0 
                    ? `Based on the applicant's skills profile (${matchedSkills.slice(0, 5).join(', ')}), they could also excel in:`
                    : 'Based on the applicant\'s experience and background, they could also excel in:'
                  }
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getAlternativeRoles(matchedSkills).map((role, idx) => (
                    <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-700 mb-1">Strengths</p>
                <p className="text-sm text-gray-700">
                  {getStrengthsInsight(applicant)}
                </p>
              </div>
              {matchedSkills.length > 0 && missingSkills.length > 0 && (
                <div className="bg-white/70 rounded-lg p-3">
                  <p className="text-xs font-medium text-purple-700 mb-1">Growth Potential</p>
                  <p className="text-sm text-gray-700">
                    With {matchedSkills.length} matched skills, this candidate shows strong alignment with technical requirements. 
                    Consider upskilling in {missingSkills.slice(0, 2).join(', ')} to unlock more senior opportunities.
                  </p>
                </div>
              )}
            </div>
          </div>
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
            <span className="text-sm text-gray-500">
              Status: <span className="font-medium text-gray-700">
                {applicant.screening_status === 'passed' ? 'Passed' : 
                 applicant.screening_status === 'in_review' ? 'In Review' : 
                 applicant.screening_status === 'failed' ? 'Failed' : 'Unknown'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
