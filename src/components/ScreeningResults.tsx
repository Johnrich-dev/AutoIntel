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
import { ScreeningDetailModal } from './ScreeningDetailModal';

// Interfaces
interface ScreenedApplicant extends Applicant {
  resume?: Resume;
  overall_score?: number;
  skills_score?: number;
  experience_score?: number;
  education_score?: number;
  screening_status?: 'for_review' | 'in_progress';
  screening_stage?: 'screened' | 'review' | 'shortlisted';
  screened_at?: string;
  matched_skills?: string[];
  missing_skills?: string[];
  video_submitted?: boolean;
  work_style_completed?: boolean;
}

interface JobOption {
  id: string;
  title: string;
  department: string;
  count: number;
}

type StatusFilter = 'all' | 'for_review' | 'in_progress';
type SortOption = 'score_desc' | 'score_asc' | 'date_desc' | 'date_asc' | 'name_asc';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  for_review: {
    label: 'For Review',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: AlertCircle,
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: Clock,
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
        {Math.round(score)}%
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.in_progress;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
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

      // Load resume scores for component scores
      const { data: resumeScoresData } = await adminClient
        .from('resume_scores')
        .select('*');

      // Load video assessments to check if applicant has submitted video
      const { data: videoAssessmentsData } = await adminClient
        .from('video_assessments')
        .select('*');

      // Load work style assessments to check if applicant has completed assessment
      const { data: workStyleAssessmentsData } = await adminClient
        .from('work_style_assessments')
        .select('*');

      // Combine data - use REAL scores from database
      if (applicantsData) {
        const screenedApplicants: ScreenedApplicant[] = applicantsData.map((applicant) => {
          const resume = resumesData?.find((r) => r.applicant_id === applicant.id);
          
          // Get resume score if available
          const resumeScore = resumeScoresData?.find((rs) => rs.applicant_id === applicant.id);
          
          // Check video and work style assessment status
          const videoAssessment = videoAssessmentsData?.find((va) => va.applicant_id === applicant.id);
          const workStyleAssessment = workStyleAssessmentsData?.find((wsa) => wsa.applicant_id === applicant.id);
          
          // Determine if applicant has completed required assessments
          const hasVideoSubmitted = videoAssessment && videoAssessment.status === 'completed';
          const hasWorkStyleCompleted = workStyleAssessment && workStyleAssessment.status === 'completed';
          
          // Use actual scores from the database
          const overallScore = applicant.screening_score ?? 0;
          
          // Determine status from database or calculate based on score
          // needs_review: applicants who have completed video and work style assessments
          // These require human review of the video
          let status: 'for_review' | 'in_progress' = applicant.screening_status as 'for_review' | 'in_progress' || 'in_progress';
          
          // If not explicitly set, determine based on completion
          if (!applicant.screening_status) {
            if (hasVideoSubmitted && hasWorkStyleCompleted) {
              // Has completed video and work style - needs human review
              status = 'for_review';
            } else {
              // Not yet completed assessments
              status = 'in_progress';
            }
          }
          
          // Extract matched skills from resume if available
          let matchedSkills: string[] = [];
          let missingSkills: string[] = [];
          
          // Common technical skills to look for in resumes
          const commonSkills = ['Python', 'SQL', 'Java', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Spark', 'Hadoop', 'TensorFlow', 'PyTorch', 'Machine Learning', 'Deep Learning', 'NLP', 'PostgreSQL', 'MySQL', 'MongoDB', 'Tableau', 'PowerBI', 'Excel', 'Airflow', 'Snowflake', 'Kafka', 'Git', 'Linux', 'Agile', 'Scrum'];
          
          // Use real component scores from resume_scores if available
          let skillsScore = resumeScore?.skills_score ?? 0;
          let experienceScore = resumeScore?.experience_score ?? 0;
          let educationScore = resumeScore?.education_score ?? 0;
          
          // If no resume scores, calculate from resume parsed data
          if (!resumeScore && resume?.parsed_data && typeof resume.parsed_data === 'object') {
            const parsedData = resume.parsed_data as any;
            
            // Try to extract skills from various possible structures
            if (parsedData.skills?.hard_skills) {
              matchedSkills = parsedData.skills.hard_skills.slice(0, 10);
            } else if (parsedData.skills) {
              // Try different skill structures
              const skillsObj = parsedData.skills;
              if (Array.isArray(skillsObj)) {
                matchedSkills = skillsObj.slice(0, 10);
              } else if (typeof skillsObj === 'object') {
                matchedSkills = Object.values(skillsObj).flat().slice(0, 10) as string[];
              }
            }
            
            // If still no skills, search the entire parsed data for skill keywords
            if (matchedSkills.length === 0) {
              const parsedString = JSON.stringify(parsedData).toLowerCase();
              matchedSkills = commonSkills.filter(skill => 
                parsedString.includes(skill.toLowerCase())
              ).slice(0, 10);
            }
            
            const totalSkills = matchedSkills.length;
            skillsScore = Math.min((totalSkills / 15) * 100, 100);
            
            const expCount = parsedData.experience?.length || 0;
            experienceScore = Math.min((expCount / 5) * 100, 100);
            
            const eduCount = parsedData.education?.length || 0;
            educationScore = Math.min((eduCount / 3) * 100, 100);
            
            // Determine missing skills based on position
            if (applicant.position) {
              const positionLower = applicant.position.toLowerCase();
              let requiredSkills: string[] = [];
              
              if (positionLower.includes('data engineer') || positionLower.includes('data eng')) {
                requiredSkills = ['Python', 'SQL', 'Spark', 'Airflow', 'AWS', 'Kafka'];
              } else if (positionLower.includes('data scientist') || positionLower.includes('data science')) {
                requiredSkills = ['Python', 'Machine Learning', 'TensorFlow', 'SQL', 'Statistics'];
              } else if (positionLower.includes('data analyst')) {
                requiredSkills = ['Excel', 'SQL', 'Tableau', 'PowerBI', 'Python'];
              } else if (positionLower.includes('backend') || positionLower.includes('backend developer')) {
                requiredSkills = ['Python', 'Java', 'Node.js', 'PostgreSQL', 'Docker'];
              } else if (positionLower.includes('frontend') || positionLower.includes('frontend developer')) {
                requiredSkills = ['JavaScript', 'React', 'TypeScript', 'CSS', 'HTML'];
              } else if (positionLower.includes('full stack')) {
                requiredSkills = ['JavaScript', 'React', 'Node.js', 'SQL', 'Docker'];
              } else if (positionLower.includes('devops')) {
                requiredSkills = ['Docker', 'Kubernetes', 'AWS', 'Linux', 'CI/CD'];
              } else if (positionLower.includes('ml') || positionLower.includes('machine learning')) {
                requiredSkills = ['Python', 'TensorFlow', 'PyTorch', 'Machine Learning', 'SQL'];
              } else {
                // Default requirements based on common tech stack
                requiredSkills = ['Python', 'SQL', 'JavaScript', 'Git'];
              }
              
              // Find missing skills (required but not in matched)
              const matchedLower = matchedSkills.map(s => s.toLowerCase());
              missingSkills = requiredSkills.filter(skill => 
                !matchedLower.some(ms => ms.includes(skill.toLowerCase()) || skill.toLowerCase().includes(ms))
              );
            }
          }
          
          return {
            ...applicant,
            resume,
            overall_score: overallScore,
            skills_score: Math.round(skillsScore),
            experience_score: Math.round(experienceScore),
            education_score: Math.round(educationScore),
            screening_status: status,
            screening_stage: status === 'for_review' ? 'review' : 'screened',
            screened_at: applicant.screened_at || new Date().toISOString(),
            matched_skills: matchedSkills,
            missing_skills: missingSkills,
            // Add assessment completion info for display
            video_submitted: hasVideoSubmitted,
            work_style_completed: hasWorkStyleCompleted,
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

    let status: 'for_review' | 'in_progress';
    if (overall >= 75) status = 'for_review';
    else status = 'in_progress';

    const matchedSkills = ['JavaScript', 'React', 'TypeScript', 'Node.js', 'Python'].slice(0, 2 + (hash % 3));
    const missingSkills = ['AWS', 'Docker', 'Kubernetes', 'GraphQL', 'PostgreSQL'].slice(0, 3 - (hash % 2));

    return {
      overall_score: overall,
      skills_score: skills,
      experience_score: experience,
      education_score: education,
      screening_status: status,
      screening_stage: status === 'for_review' ? 'review' : 'screened',
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
        .update({ screening_stage: 'shortlisted', screening_status: 'for_review' })
        .eq('id', id);

      // Update local state
      setApplicants((prev) =>
        prev.map((app) =>
          app.id === id ? { ...app, screening_stage: 'shortlisted', screening_status: 'for_review' } : app
        )
      );
    } catch (error) {
      console.error('Error approving applicant:', error);
    }
  };


  // Stats
  const stats = useMemo(() => {
    const forReview = applicants.filter((a) => a.screening_status === 'for_review').length;
    const inProgress = applicants.filter((a) => a.screening_status === 'in_progress').length;
    const avgScore = applicants.length > 0
      ? Math.round(applicants.reduce((sum, a) => sum + (a.overall_score || 0), 0) / applicants.length)
      : 0;

    return { forReview, inProgress, total: applicants.length, avgScore };
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
            <p className="text-xs text-green-600">For Review</p>
            <p className="text-lg font-bold text-green-700">{stats.forReview}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl px-4 py-2 border border-yellow-200 shadow-sm">
            <p className="text-xs text-yellow-600">In Progress</p>
            <p className="text-lg font-bold text-yellow-700">{stats.inProgress}</p>
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
            {(['all', 'for_review', 'in_progress'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {status === 'all' ? 'All' : status === 'for_review' ? 'For Review' : status === 'in_progress' ? 'In Progress' : status}
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
                      <span className="text-sm text-gray-700">{applicant.position || 'N/A'}</span>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-5">
                      <ScoreBadge score={applicant.overall_score || 0} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-5 text-center">
                      <StatusBadge status={applicant.screening_status || 'in_progress'} />
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
      {/* Detail Modal */}
      {showDetailModal && selectedApplicant && (
        <ScreeningDetailModal
          applicant={selectedApplicant}
          onClose={() => setShowDetailModal(false)}
        />
      )}

    </div>
  );
}
