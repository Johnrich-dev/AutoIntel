import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Eye,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Briefcase,
  Download,
  Filter,
  ArrowUpDown,
  X,
  TrendingUp,
  Target,
  Award,
  User,
  Calendar,
  Star,
  Check,
  Minus,
  MoreHorizontal,
} from 'lucide-react';
import { Applicant, Resume, JobPosting, getSupabaseAdminClient } from '../lib/supabase';
import { ApplicantDetailModal } from './ApplicantDetailModal';

// Interfaces
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

interface JobOption {
  id: string;
  title: string;
  department: string;
  count: number;
}

type StatusFilter = 'all' | 'passed' | 'needs_review' | 'failed';
type SortOption = 'score_desc' | 'score_asc' | 'date_desc' | 'date_asc' | 'name_asc';

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

// Loading skeleton
function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
          <td className="px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="flex items-center justify-center gap-2">
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// Empty state component
function EmptyState() {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No screened applicants yet</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Applicants who have been processed through the AI screening system will appear here with their evaluation results.
          </p>
        </div>
      </td>
    </tr>
  );
}

// Score badge component
function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`px-3 py-1.5 rounded-lg font-semibold text-sm ${getScoreColor(score)}`}>
        {score}%
      </div>
    </div>
  );
}

// Status badge component
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

// Detail modal component
function DetailModal({
  applicant,
  onClose,
  onApprove,
  onReject,
}: {
  applicant: ScreenedApplicant;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const hasResumeData = applicant.resume?.parsed_data && typeof applicant.resume?.parsed_data === 'object';
  const parsedData = hasResumeData ? applicant.resume?.parsed_data : null;

  const matchedSkills = applicant.matched_skills || [];
  const missingSkills = applicant.missing_skills || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
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
                  <p className="text-3xl font-bold text-blue-900">{applicant.overall_score || 0}%</p>
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
                <p className="text-2xl font-bold text-gray-900">{applicant.skills_score || 0}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-gray-500">Experience</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{applicant.experience_score || 0}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-gray-500">Education</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{applicant.education_score || 0}%</p>
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
                Strong overall profile with {applicant.overall_score}% score. Candidate demonstrates adequate qualifications 
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
                Overall score of {applicant.overall_score}% is below the minimum threshold. Key areas for improvement include 
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
                This candidate has an ambiguous profile with {applicant.overall_score}% score. 
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
    </div>
  );
}

export function ScreeningResults() {
  const [applicants, setApplicants] = useState<ScreenedApplicant[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplicant, setSelectedApplicant] = useState<ScreenedApplicant | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const itemsPerPage = 10;

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowSortMenu(false);
      setShowExportMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const adminClient = getSupabaseAdminClient();

      // Load applicants with screening data
      const { data: applicantsData, error: applicantsError } = await adminClient
        .from('applicants')
        .select('*')
        .order('created_at', { ascending: false });

      if (applicantsError) throw applicantsError;

      // Load resumes
      const { data: resumesData } = await adminClient
        .from('resumes')
        .select('*');

      // Combine data - use REAL scores from database
      if (applicantsData) {
        const screenedApplicants: ScreenedApplicant[] = applicantsData.map((applicant) => {
          const resume = resumesData?.find((r) => r.applicant_id === applicant.id);
          
          // Use actual scores from the database
          // Priority: applicant.screening_score > 0
          // The screening_score is stored on the applicants table
          const overallScore = applicant.screening_score ?? 0;
          
          // Determine status from database or calculate based on score
          let status: 'passed' | 'needs_review' | 'failed' = applicant.screening_status || 'needs_review';
          if (!applicant.screening_status && overallScore > 0) {
            // Calculate status based on score if not set in DB
            if (overallScore >= 78) status = 'passed';
            else if (overallScore >= 65) status = 'needs_review';
            else status = 'failed';
          }
          
          // Extract matched skills from resume if available
          let matchedSkills: string[] = [];
          let missingSkills: string[] = [];
          let skillsScore = 0;
          let experienceScore = 0;
          let educationScore = 0;
          
          if (resume?.parsed_data && typeof resume.parsed_data === 'object') {
            const parsedData = resume.parsed_data as any;
            // Extract skills from parsed data
            if (parsedData.skills?.hard_skills) {
              matchedSkills = parsedData.skills.hard_skills.slice(0, 5);
            }
            // Calculate skills score based on skill count
            const totalSkills = matchedSkills.length;
            skillsScore = Math.min((totalSkills / 20) * 100, 100);
            
            // Experience score based on number of experiences
            const expCount = parsedData.experience?.length || 0;
            experienceScore = Math.min((expCount / 5) * 100, 100);
            
            // Education score based on education entries
            const eduCount = parsedData.education?.length || 0;
            educationScore = Math.min((eduCount / 3) * 100, 100);
          }
          
          return {
            ...applicant,
            resume,
            overall_score: overallScore,
            skills_score: Math.round(skillsScore),
            experience_score: Math.round(experienceScore),
            education_score: Math.round(educationScore),
            screening_status: status,
            screening_stage: status === 'passed' ? 'shortlisted' : status === 'needs_review' ? 'review' : 'screened',
            screened_at: applicant.screened_at || new Date().toISOString(),
            matched_skills: matchedSkills,
            missing_skills: missingSkills,
          };
        });

        setApplicants(screenedApplicants);

        // Extract distinct positions from applicants for the job dropdown
        const positionCounts = (applicantsData || []).reduce((acc, applicant) => {
          if (applicant.position) {
            acc[applicant.position] = (acc[applicant.position] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);

        // Convert to JobOption array and sort alphabetically
        const jobOptions: JobOption[] = (Object.entries(positionCounts) as [string, number][])
          .map(([position, count]) => ({
            id: position,
            title: position,
            department: 'General',
            count,
          }))
          .sort((a, b) => a.title.localeCompare(b.title));

        setJobs(jobOptions);
      }
    } catch (error) {
      console.error('Error loading screening results:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate mock scores for demonstration
  const generateMockScores = (id: string) => {
    // Use id hash for consistent demo data
    const hash = id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const overall = 50 + (hash % 45);
    const skills = 40 + (hash % 50);
    const experience = 45 + (hash % 45);
    const education = 50 + (hash % 40);

    let status: 'passed' | 'needs_review' | 'failed';
    if (overall >= 75) status = 'passed';
    else if (overall >= 55) status = 'needs_review';
    else status = 'failed';

    const matchedSkills = ['JavaScript', 'React', 'TypeScript', 'Node.js', 'Python'].slice(0, 2 + (hash % 3));
    const missingSkills = ['AWS', 'Docker', 'Kubernetes', 'GraphQL', 'PostgreSQL'].slice(0, 3 - (hash % 2));

    return {
      overall_score: overall,
      skills_score: skills,
      experience_score: experience,
      education_score: education,
      screening_status: status,
      screening_stage: status === 'passed' ? 'shortlisted' : status === 'needs_review' ? 'review' : 'screened',
      screened_at: new Date(Date.now() - (hash % 30) * 24 * 60 * 60 * 1000).toISOString(),
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
    };
  };

  // Filter and sort applicants
  const filteredApplicants = useMemo(() => {
    let filtered = [...applicants];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.name?.toLowerCase().includes(query) ||
          app.position?.toLowerCase().includes(query) ||
          app.email?.toLowerCase().includes(query)
      );
    }

    // Job filter
    if (selectedJob !== 'all') {
      filtered = filtered.filter((app) => app.position === selectedJob);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((app) => app.screening_status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':
          return (b.overall_score || 0) - (a.overall_score || 0);
        case 'score_asc':
          return (a.overall_score || 0) - (b.overall_score || 0);
        case 'date_desc':
          return new Date(b.screened_at || b.created_at).getTime() - new Date(a.screened_at || a.created_at).getTime();
        case 'date_asc':
          return new Date(a.screened_at || a.created_at).getTime() - new Date(b.screened_at || b.created_at).getTime();
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [applicants, searchQuery, selectedJob, statusFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleViewDetails = (applicant: ScreenedApplicant) => {
    setSelectedApplicant(applicant);
    setShowDetailModal(true);
  };

  const handleApprove = async (id: string) => {
    try {
      const adminClient = getSupabaseAdminClient();
      await adminClient
        .from('applicants')
        .update({ screening_stage: 'shortlisted', screening_status: 'passed' })
        .eq('id', id);

      // Update local state
      setApplicants((prev) =>
        prev.map((app) =>
          app.id === id ? { ...app, screening_stage: 'shortlisted', screening_status: 'passed' } : app
        )
      );

      setShowDetailModal(false);
    } catch (error) {
      console.error('Error approving applicant:', error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const adminClient = getSupabaseAdminClient();
      await adminClient
        .from('applicants')
        .update({ screening_status: 'failed', screening_stage: 'screened' })
        .eq('id', id);

      // Update local state
      setApplicants((prev) =>
        prev.map((app) =>
          app.id === id ? { ...app, screening_status: 'failed', screening_stage: 'screened' } : app
        )
      );

      setShowDetailModal(false);
    } catch (error) {
      console.error('Error rejecting applicant:', error);
    }
  };

  const handleExport = (applicantId: string, format: string) => {
    const applicant = applicants.find((a) => a.id === applicantId);
    if (!applicant) return;

    if (format === 'pdf') {
      // In production, generate PDF report
      alert(`Exporting ${applicant.name}'s report as PDF...`);
    } else if (format === 'csv') {
      // In production, generate CSV
      alert(`Exporting ${applicant.name}'s data as CSV...`);
    }

    setShowExportMenu(null);
  };

  // Stats
  const stats = useMemo(() => {
    const passed = applicants.filter((a) => a.screening_status === 'passed').length;
    const needsReview = applicants.filter((a) => a.screening_status === 'needs_review').length;
    const failed = applicants.filter((a) => a.screening_status === 'failed').length;
    const avgScore = applicants.length > 0
      ? Math.round(applicants.reduce((sum, a) => sum + (a.overall_score || 0), 0) / applicants.length)
      : 0;

    return { passed, needsReview, failed, total: applicants.length, avgScore };
  }, [applicants]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Screening Results</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered evaluation results for processed applicants
          </p>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4">
          <div className="bg-white rounded-xl px-4 py-2 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Total Screened</p>
            <p className="text-lg font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-green-50 rounded-xl px-4 py-2 border border-green-200 shadow-sm">
            <p className="text-xs text-green-600">Passed</p>
            <p className="text-lg font-bold text-green-700">{stats.passed}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl px-4 py-2 border border-yellow-200 shadow-sm">
            <p className="text-xs text-yellow-600">Needs Review</p>
            <p className="text-lg font-bold text-yellow-700">{stats.needsReview}</p>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-2 border border-red-200 shadow-sm">
            <p className="text-xs text-red-600">Failed</p>
            <p className="text-lg font-bold text-red-700">{stats.failed}</p>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or job..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Job Selector */}
          <div className="relative">
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="all">All Jobs</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.title}>
                  {job.title} ({job.count})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            {(['all', 'passed', 'needs_review', 'failed'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {status === 'all' ? 'All' : status === 'passed' ? 'Passed' : status === 'needs_review' ? 'Needs Review' : 'Failed'}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSortMenu(!showSortMenu);
              }}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortBy === 'date_desc' ? 'Newest First' : sortBy === 'date_asc' ? 'Oldest First' : sortBy === 'score_desc' ? 'Highest Score' : sortBy === 'score_asc' ? 'Lowest Score' : 'Name A-Z'}
              <ChevronDown className={`w-4 h-4 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('date_desc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 ${sortBy === 'date_desc' ? 'bg-blue-50' : ''}`}
                >
                  <Clock className="w-4 h-4" />
                  Newest First
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('date_asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 ${sortBy === 'date_asc' ? 'bg-blue-50' : ''}`}
                >
                  <Clock className="w-4 h-4" />
                  Oldest First
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('score_desc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 ${sortBy === 'score_desc' ? 'bg-blue-50' : ''}`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Highest Score
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('score_asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 ${sortBy === 'score_asc' ? 'bg-blue-50' : ''}`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Lowest Score
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('name_asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 ${sortBy === 'name_asc' ? 'bg-blue-50' : ''}`}
                >
                  <User className="w-4 h-4" />
                  Name A-Z
                </button>
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Applicant
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Job Applied
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Stage
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date Screened
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <TableSkeleton />
              ) : paginatedApplicants.length === 0 ? (
                <EmptyState />
              ) : (
                paginatedApplicants.map((applicant) => (
                  <tr
                    key={applicant.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Name */}
                    <td className="px-4 py-5">
                      <button
                        onClick={() => handleViewDetails(applicant)}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                          {applicant.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {applicant.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">{applicant.email}</p>
                        </div>
                      </button>
                    </td>

                    {/* Job Applied */}
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">{applicant.position || 'N/A'}</span>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-5">
                      <ScoreBadge score={applicant.overall_score || 0} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-5 text-center">
                      <StatusBadge status={applicant.screening_status || 'failed'} />
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-5 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
                        {applicant.screening_stage === 'shortlisted'
                          ? 'Shortlisted'
                          : applicant.screening_stage === 'review'
                          ? 'Under Review'
                          : 'Screened'}
                      </span>
                    </td>

                    {/* Date Screened */}
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {applicant.screened_at
                          ? new Date(applicant.screened_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : new Date(applicant.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(applicant)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {applicant.screening_status === 'needs_review' && (
                          <button
                            onClick={() => handleApprove(applicant.id)}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => handleReject(applicant.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>

                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setShowExportMenu(showExportMenu === applicant.id ? null : applicant.id)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            title="Export"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {showExportMenu === applicant.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-10 min-w-[140px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExport(applicant.id, 'pdf');
                                  setShowExportMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <FileText className="w-4 h-4" />
                                Export PDF
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExport(applicant.id, 'csv');
                                  setShowExportMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Download className="w-4 h-4" />
                                Export CSV
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filteredApplicants.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
            <p className="text-sm text-gray-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} results
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === i + 1
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedApplicant && (
        <DetailModal
          applicant={selectedApplicant}
          onClose={() => setShowDetailModal(false)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
