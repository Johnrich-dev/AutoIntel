import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Briefcase,
  Filter,
  X,
  TrendingUp,
  CheckSquare,
  Square,
  Loader2,
  AlertTriangle,
  Video,
  ClipboardCheck,
  FolderOpen
} from 'lucide-react';
import { Resume, JobPosting, getSupabaseAdminClient } from '../lib/supabase';
import { NeedsReviewDetailPanel } from './NeedsReviewDetailPanel';

// Interfaces - separate from Applicant to avoid requiring all base fields
interface NeedsReviewApplicant {
  id: string;
  name?: string;
  email?: string;
  position?: string;
  resume?: Resume;
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

interface JobOption {
  id: string;
  title: string;
  department: string;
  count: number;
}

type SortOption = 'score_desc' | 'score_asc' | 'date_desc' | 'date_asc' | 'name_asc';

// Score bar component
function ScoreBar({ score, className = '' }: { score: number; className?: string }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getScoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-12 text-right">{score}%</span>
    </div>
  );
}

// Loading skeleton
function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 hover:bg-amber-50/30 transition-colors">
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
            <div className="h-6 w-32 bg-gray-200 rounded-full animate-pulse mx-auto" />
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
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No applicants require review at this time</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            All applicants have been processed. Borderline cases will appear here for manual evaluation.
          </p>
        </div>
      </td>
    </tr>
  );
}

// Assessment status badge
function AssessmentStatusBadge({ video, profiling }: { video: boolean; profiling: boolean }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-1">
        <Video className="w-3 h-3" />
        <span className={video ? 'text-green-600' : 'text-gray-400'}>
          {video ? 'Completed' : 'Missing'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <ClipboardCheck className="w-3 h-3" />
        <span className={profiling ? 'text-green-600' : 'text-gray-400'}>
          {profiling ? 'Completed' : 'Missing'}
        </span>
      </div>
    </div>
  );
}

// Key issue badge
function KeyIssueBadge({ issue }: { issue: string }) {
  const issueStyles: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    'Low experience match': { bg: 'bg-orange-50', text: 'text-orange-700', icon: Briefcase },
    'Missing required skills': { bg: 'bg-red-50', text: 'text-red-700', icon: AlertTriangle },
    'Weak project relevance': { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: FolderOpen },
    'Borderline score': { bg: 'bg-amber-50', text: 'text-amber-700', icon: TrendingUp },
  };

  const style = issueStyles[issue] || issueStyles['Borderline score'];
  const Icon = style.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <Icon className="w-3 h-3" />
      {issue}
    </span>
  );
}



export function NeedsReview() {
  const [applicants, setApplicants] = useState<NeedsReviewApplicant[]>([]);
  const [filteredApplicants, setFilteredApplicants] = useState<NeedsReviewApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<NeedsReviewApplicant | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [sortBy, setSortBy] = useState<SortOption>('score_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplicants, setSelectedApplicants] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 10;

  // Fetch distinct positions from applicants for dropdown (separate from main data)
  useEffect(() => {
    async function fetchPositions() {
      try {
        const adminClient = getSupabaseAdminClient();
        // Get distinct positions from ALL applicants
        const { data, error } = await adminClient
          .from('applicants')
          .select('position')
          .order('position', { ascending: true });

        if (error) throw error;

        // Count applicants per position
        const positionCounts = (data || []).reduce((acc, applicant) => {
          if (applicant.position) {
            acc[applicant.position] = (acc[applicant.position] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);

        // Convert to JobOption array and sort alphabetically
        const jobOptionsArray: JobOption[] = [
          { id: 'all', title: 'All Jobs', department: '', count: Object.values(positionCounts).reduce((a, b) => a + b, 0) },
          ...(Object.entries(positionCounts) as [string, number][])
            .map(([position, count]) => ({
              id: position,
              title: position,
              department: 'General',
              count,
            }))
            .sort((a, b) => a.title.localeCompare(b.title))
        ];

        setJobs(jobOptionsArray);
      } catch (err) {
        console.error('Error fetching positions:', err);
      }
    }

    fetchPositions();
  }, []);

  // Fetch data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const adminClient = getSupabaseAdminClient();

        // Fetch applicants that need review (not shortlisted, rejected, or hired)
        const { data: applicantsData, error: applicantsError } = await adminClient
          .from('applicants')
          .select('*')
          .not('status', 'eq', 'shortlisted')
          .not('status', 'eq', 'rejected')
          .not('status', 'eq', 'hired')
          .order('screening_score', { ascending: false });

        if (applicantsError) throw applicantsError;

        // Fetch resumes for these applicants
        const applicantIds = (applicantsData || []).map(a => a.id);
        let resumesMap: Record<string, Resume> = {};
        let videoAssessmentsMap: Record<string, boolean> = {};
        let personalityTestsMap: Record<string, boolean> = {};
        let videoScoresMap: Record<string, number> = {};
        let workStyleScoresMap: Record<string, number> = {};
        
        if (applicantIds.length > 0) {
          const { data: resumesData } = await adminClient
            .from('resumes')
            .select('*')
            .in('applicant_id', applicantIds);
          
          if (resumesData) {
            resumesData.forEach(resume => {
              resumesMap[resume.applicant_id] = resume;
            });
          }

          // Fetch video assessments to check completion status and scores
          const { data: videoAssessmentsData } = await adminClient
            .from('video_assessments')
            .select('applicant_id, status, submitted_at, transcript_score')
            .in('applicant_id', applicantIds);
          
          if (videoAssessmentsData) {
            videoAssessmentsData.forEach(assessment => {
              // Consider completed if status is 'submitted' or 'completed' or if submitted_at exists
              videoAssessmentsMap[assessment.applicant_id] = 
                assessment.status === 'submitted' || 
                assessment.status === 'completed' || 
                !!assessment.submitted_at;
              // Store the score
              if (assessment.transcript_score !== null && assessment.transcript_score !== undefined) {
                videoScoresMap[assessment.applicant_id] = assessment.transcript_score;
              }
            });
          }

          // Fetch work style assessments (personality tests) to check completion status and scores
          const { data: workStyleAssessmentsData } = await adminClient
            .from('work_style_assessments')
            .select('applicant_id, status, submitted_at, semantic_score')
            .in('applicant_id', applicantIds);
          
          if (workStyleAssessmentsData) {
            workStyleAssessmentsData.forEach(test => {
              // Consider completed if status is 'submitted' or 'completed' or if submitted_at exists
              personalityTestsMap[test.applicant_id] = 
                test.status === 'submitted' || 
                test.status === 'completed' || 
                !!test.submitted_at;
              // Store the score
              if (test.semantic_score !== null && test.semantic_score !== undefined) {
                workStyleScoresMap[test.applicant_id] = test.semantic_score;
              }
            });
          }
        }

        // Map applicants with their data and filter to only those who completed both assessments
        if (applicantsData) {
          const mappedApplicants: NeedsReviewApplicant[] = applicantsData
            .map(applicant => ({
              ...applicant,
              resume: resumesMap[applicant.id],
              overall_score: applicant.screening_score || 0,
              screened_at: applicant.screened_at || applicant.updated_at || applicant.created_at,
              video_completed: videoAssessmentsMap[applicant.id] || false,
              profiling_completed: personalityTestsMap[applicant.id] || false,
              video_assessment_score: videoScoresMap[applicant.id],
              work_style_score: workStyleScoresMap[applicant.id],
              // Determine key issue based on screening_fit_category or score
              key_issue: applicant.screening_fit_category || determineKeyIssue(applicant.screening_score || 0),
            }))
            .filter(applicant => applicant.video_completed && applicant.profiling_completed);

          setApplicants(mappedApplicants);
        }
      } catch (err) {
        console.error('Error loading needs review data:', err);
        setError('Failed to load applicants. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Helper function to determine key issue based on score
  const determineKeyIssue = (score: number): string => {
    if (score >= 75) return 'Borderline score';
    if (score >= 65) return 'Low experience match';
    return 'Missing required skills';
  };

  // Filter and sort applicants
  useEffect(() => {
    let result = [...applicants];

    // Filter by job
    if (selectedJob !== 'all') {
      result = result.filter(a => a.position === selectedJob);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name?.toLowerCase().includes(query) || 
        a.email?.toLowerCase().includes(query) ||
        a.position?.toLowerCase().includes(query)
      );
    }

    // Filter by score range
    result = result.filter(a => {
      const score = a.overall_score || 0;
      return score >= scoreRange[0] && score <= scoreRange[1];
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':
          return (b.overall_score || 0) - (a.overall_score || 0);
        case 'score_asc':
          return (a.overall_score || 0) - (b.overall_score || 0);
        case 'date_desc':
          return new Date(b.screened_at || 0).getTime() - new Date(a.screened_at || 0).getTime();
        case 'date_asc':
          return new Date(a.screened_at || 0).getTime() - new Date(b.screened_at || 0).getTime();
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

    setFilteredApplicants(result);
    setCurrentPage(1);
  }, [applicants, searchQuery, selectedJob, scoreRange, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers


  const toggleApplicantSelection = (id: string) => {
    const newSelected = new Set(selectedApplicants);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedApplicants(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedApplicants.size === paginatedApplicants.length) {
      setSelectedApplicants(new Set());
    } else {
      setSelectedApplicants(new Set(paginatedApplicants.map(a => a.id)));
    }
  };

  const openDetailPanel = (applicant: NeedsReviewApplicant) => {
    setSelectedApplicant(applicant);
    setShowDetailPanel(true);
  };

  const handleRefresh = () => {
    // Trigger reload by calling loadData
    setLoading(true);
    const loadData = async () => {
      try {
        setError(null);
        const adminClient = getSupabaseAdminClient();

        const { data: applicantsData, error: applicantsError } = await adminClient
          .from('applicants')
          .select('*')
          .not('status', 'eq', 'shortlisted')
          .not('status', 'eq', 'rejected')
          .not('status', 'eq', 'hired')
          .order('created_at', { ascending: false });

        if (applicantsError) throw applicantsError;

        const applicantIds = (applicantsData || []).map(a => a.id);
        let resumesMap: Record<string, Resume> = {};
        let videoAssessmentsMap: Record<string, boolean> = {};
        let personalityTestsMap: Record<string, boolean> = {};
        let videoScoresMap: Record<string, number> = {};
        let workStyleScoresMap: Record<string, number> = {};
        
        if (applicantIds.length > 0) {
          const { data: resumesData } = await adminClient
            .from('resumes')
            .select('*')
            .in('applicant_id', applicantIds);
          
          if (resumesData) {
            resumesData.forEach(resume => {
              resumesMap[resume.applicant_id] = resume;
            });
          }

          // Fetch video assessments to check completion status and scores
          const { data: videoAssessmentsData } = await adminClient
            .from('video_assessments')
            .select('applicant_id, status, submitted_at, transcript_score')
            .in('applicant_id', applicantIds);
          
          if (videoAssessmentsData) {
            videoAssessmentsData.forEach(assessment => {
              // Consider completed if status is 'submitted' or 'completed' or if submitted_at exists
              videoAssessmentsMap[assessment.applicant_id] = 
                assessment.status === 'submitted' || 
                assessment.status === 'completed' || 
                !!assessment.submitted_at;
              // Store the score
              if (assessment.transcript_score !== null && assessment.transcript_score !== undefined) {
                videoScoresMap[assessment.applicant_id] = assessment.transcript_score;
              }
            });
          }

          // Fetch work style assessments (personality tests) to check completion status and scores
          const { data: workStyleAssessmentsData } = await adminClient
            .from('work_style_assessments')
            .select('applicant_id, status, submitted_at, semantic_score')
            .in('applicant_id', applicantIds);
          
          if (workStyleAssessmentsData) {
            workStyleAssessmentsData.forEach(test => {
              // Consider completed if status is 'submitted' or 'completed' or if submitted_at exists
              personalityTestsMap[test.applicant_id] = 
                test.status === 'submitted' || 
                test.status === 'completed' || 
                !!test.submitted_at;
              // Store the score
              if (test.semantic_score !== null && test.semantic_score !== undefined) {
                workStyleScoresMap[test.applicant_id] = test.semantic_score;
              }
            });
          }
        }

        if (applicantsData) {
          const mappedApplicants: NeedsReviewApplicant[] = applicantsData
            .map(applicant => ({
              ...applicant,
              resume: resumesMap[applicant.id],
              overall_score: applicant.screening_score || 0,
              screened_at: applicant.updated_at || applicant.created_at,
              video_completed: videoAssessmentsMap[applicant.id] || false,
              profiling_completed: personalityTestsMap[applicant.id] || false,
              video_assessment_score: videoScoresMap[applicant.id],
              work_style_score: workStyleScoresMap[applicant.id],
              key_issue: applicant.screening_fit_category || determineKeyIssue(applicant.screening_score || 0),
            }))
            .filter(applicant => applicant.video_completed && applicant.profiling_completed);

          setApplicants(mappedApplicants);
        }
      } catch (err) {
        console.error('Error refreshing data:', err);
        setError('Failed to refresh. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Needs Review</h1>
            <p className="text-sm text-gray-500 mt-1">Applicants requiring manual review</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          {/* Top Row */}
          <div className="p-4 flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Job Selector */}
            <div className="relative min-w-[200px]">
              <select
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="w-full appearance-none pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-white cursor-pointer focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.title} {job.count > 0 && `(${job.count})`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
                showFilters ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>

            {/* Bulk Actions */}
            {selectedApplicants.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-500">{selectedApplicants.size} selected</span>
              </div>
            )}
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-6">
                {/* Score Range */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">Score Range:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={scoreRange[0]}
                      onChange={(e) => setScoreRange([parseInt(e.target.value) || 0, scoreRange[1]])}
                      min={0}
                      max={100}
                      className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center"
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="number"
                      value={scoreRange[1]}
                      onChange={(e) => setScoreRange([scoreRange[0], parseInt(e.target.value) || 100])}
                      min={0}
                      max={100}
                      className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="appearance-none px-3 py-1 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="score_desc">Score (High to Low)</option>
                    <option value="score_asc">Score (Low to High)</option>
                    <option value="date_desc">Date (Newest First)</option>
                    <option value="date_asc">Date (Oldest First)</option>
                    <option value="name_asc">Name (A-Z)</option>
                  </select>
                </div>

                {/* Clear Filters */}
                {(searchQuery || selectedJob !== 'all' || scoreRange[0] !== 0 || scoreRange[1] !== 100) && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedJob('all');
                      setScoreRange([60, 80]);
                    }}
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={toggleSelectAll}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      disabled={loading || paginatedApplicants.length === 0}
                    >
                      {selectedApplicants.size === paginatedApplicants.length && paginatedApplicants.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Job Applied</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Key Issue</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Assessment</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Date Screened</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8">
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-2" />
                        <span className="text-sm text-gray-500">Loading applicants...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedApplicants.length === 0 ? (
                  <EmptyState />
                ) : (
                  paginatedApplicants.map((applicant) => (
                    <tr 
                      key={applicant.id} 
                      className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
                        selectedApplicants.has(applicant.id) ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleApplicantSelection(applicant.id)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          {selectedApplicants.has(applicant.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <button 
                          onClick={() => openDetailPanel(applicant)}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
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
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-700">{applicant.position || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-sm font-bold ${
                          (applicant.overall_score || 0) >= 80 ? 'text-green-600' :
                          (applicant.overall_score || 0) >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {applicant.overall_score || 0}%
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <KeyIssueBadge issue={applicant.key_issue || 'Borderline score'} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center">
                          <AssessmentStatusBadge 
                            video={applicant.video_completed || false}
                            profiling={applicant.profiling_completed || false}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-gray-600">
                          {applicant.screened_at ? new Date(applicant.screened_at).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openDetailPanel(applicant)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
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
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} applicants
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                {[...Array(totalPages)].map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(idx + 1)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === idx + 1
                        ? 'bg-amber-600 text-white'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel Overlay */}
      {showDetailPanel && (
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setShowDetailPanel(false)}
        />
      )}

      {/* Detail Panel */}
      <NeedsReviewDetailPanel
        applicant={selectedApplicant}
        isOpen={showDetailPanel}
        onClose={() => {
          setShowDetailPanel(false);
          setSelectedApplicant(null);
        }}

      />
    </div>
  );
}
