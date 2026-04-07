import { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  FileText, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Users,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';
import { getSupabaseAdminClient } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';
import { ApplicantDetailModal } from './ApplicantDetailModal';

// Interface for position/role option from applicants
interface PositionOption {
  position: string;
  count: number;
}

interface ApplicantWithResume extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest | any;
}

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  pending: { 
    label: 'Pending', 
    bg: 'bg-yellow-50', 
    text: 'text-yellow-700', 
    border: 'border-yellow-200',
    icon: Clock 
  },
  processing: { 
    label: 'Processing', 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    border: 'border-blue-200',
    icon: Loader2 
  },
  parsed: { 
    label: 'Parsed', 
    bg: 'bg-green-50', 
    text: 'text-green-700', 
    border: 'border-green-200',
    icon: CheckCircle 
  },
  error: { 
    label: 'Error', 
    bg: 'bg-red-50', 
    text: 'text-red-700', 
    border: 'border-red-200',
    icon: XCircle 
  },
};

// Loading skeleton component
function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className="px-4 py-5">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
          </td>
          <td className="px-4 py-5">
            <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

// Empty state component
function EmptyState({ selectedJob }: { selectedJob: string | null }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-16 text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {selectedJob ? 'No applications received yet' : 'Select a job position'}
          </h3>
          <p className="text-gray-500 text-sm max-w-sm">
            {selectedJob 
              ? `No applications received yet for this job`
              : 'Choose a job position from the dropdown above to view its applicants'}
          </p>
        </div>
      </td>
    </tr>
  );
}

export function ApplicantsList() {
  // State
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingJobs, setIsFetchingJobs] = useState(true);
  const [applicants, setApplicants] = useState<ApplicantWithResume[]>([]);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantWithResume | null>(null);
  const [selectedApplicantIndex, setSelectedApplicantIndex] = useState<number>(-1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryConfirmApplicant, setRetryConfirmApplicant] = useState<ApplicantWithResume | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  // Fetch distinct positions from applicants for dropdown
  useEffect(() => {
    async function fetchPositions() {
      try {
        setIsFetchingJobs(true);
        // Use admin client to bypass RLS
        const adminClient = getSupabaseAdminClient();
        // Get distinct positions with applicant count
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
        
        // Convert to array and sort alphabetically
        const positionList = Object.entries(positionCounts)
          .map(([position, count]) => ({ position, count }))
          .sort((a, b) => a.position.localeCompare(b.position));
        
        setPositions(positionList);
      } catch (err) {
        console.error('Error fetching positions:', err);
      } finally {
        setIsFetchingJobs(false);
      }
    }
    
    fetchPositions();
  }, []);

  // Fetch applicants function - extracted for reuse
  const fetchApplicantsList = async () => {
    try {
      setIsLoading(true);
      
      // Use admin client to bypass RLS
      const adminClient = getSupabaseAdminClient();
      
      // Fetch applicants - filter by job if a specific job is selected
      let query = adminClient
        .from('applicants')
        .select('*')
        .order('created_at', { ascending: false });
      
      // If a specific job is selected (not 'all'), filter by position
      if (selectedJobId) {
        query = query.eq('position', selectedJobId);
      }

      const { data: applicantsData, error: applicantsError } = await query;

      if (applicantsError) throw applicantsError;
      
      console.log('Applicants query result:', applicantsData, applicantsError);

      // Combine applicants with their resumes

      // Fetch resumes for these applicants
      const applicantIds = (applicantsData || []).map(a => a.id);
      let resumesMap: Record<string, Resume> = {};
      
      if (applicantIds.length > 0) {
        const { data: resumesData, error: resumesError } = await adminClient
          .from('resumes')
          .select('*')
          .in('applicant_id', applicantIds);

        if (!resumesError && resumesData) {
          resumesMap = resumesData.reduce((acc, resume) => {
            acc[resume.applicant_id] = resume;
            return acc;
          }, {} as Record<string, Resume>);
        }
      }

      // Fetch video assessments for these applicants
      let videoMap: Record<string, any> = {};
      if (applicantIds.length > 0) {
        const { data: videoData } = await adminClient
          .from('video_assessments')
          .select('*')
          .in('applicant_id', applicantIds);
        
        if (videoData) {
          videoMap = videoData.reduce((acc, video) => {
            acc[video.applicant_id] = video;
            return acc;
          }, {} as Record<string, any>);
        }
      }
      
      // Fetch work style assessments for these applicants
      let workStyleMap: Record<string, any> = {};
      if (applicantIds.length > 0) {
        const { data: workStyleData } = await adminClient
          .from('work_style_assessments')
          .select('*')
          .in('applicant_id', applicantIds);
        
        if (workStyleData) {
          workStyleMap = workStyleData.reduce((acc, ws) => {
            acc[ws.applicant_id] = ws;
            return acc;
          }, {} as Record<string, any>);
        }
      }
      
      // Also check personality_tests for legacy data
      if (applicantIds.length > 0) {
        const { data: personalityData } = await adminClient
          .from('personality_tests')
          .select('*')
          .in('applicant_id', applicantIds);
        
        if (personalityData) {
          personalityData.forEach(pt => {
            // Only add if work_style_assessments doesn't already have it
            if (!workStyleMap[pt.applicant_id]) {
              workStyleMap[pt.applicant_id] = pt;
            }
          });
        }
      }
      
      // Combine applicants with all their data
      const applicantsWithResumes = (applicantsData || []).map(applicant => ({
        ...applicant,
        resume: resumesMap[applicant.id],
        video: videoMap[applicant.id],
        test: workStyleMap[applicant.id],
      }));

      setApplicants(applicantsWithResumes);
    } catch (err) {
      console.error('Error fetching applicants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch applicants when job is selected
  useEffect(() => {
    fetchApplicantsList();
  }, [selectedJobId]);

  // Get application status from applicant/resume
  const getApplicationStatus = (applicant: ApplicantWithResume): string => {
    // Check if there's an error in the resume parsing
    if (applicant.resume?.status === 'error') {
      return 'error';
    }
    
    // Check resume status for parsing status
    if (applicant.resume?.parsed_data) {
      return 'parsed';
    }
    
    // Check if resume is currently being processed
    if (applicant.resume?.status === 'processing' || applicant.resume?.status === 'uploading') {
      return 'processing';
    }
    
    // Default to pending if resume exists but not parsed
    if (applicant.resume) {
      return 'pending';
    }
    
    return 'pending';
  };

  // Filter applicants
  const filteredApplicants = useMemo(() => {
    let result = applicants;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.email.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [applicants, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJobId]);

  // Handlers
  const handleOpenModal = (applicant: ApplicantWithResume, index: number) => {
    setSelectedApplicant(applicant);
    setSelectedApplicantIndex(index);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedApplicant(null);
    setSelectedApplicantIndex(-1);
  };

  const handlePrevApplicant = () => {
    const prevIndex = selectedApplicantIndex - 1;
    if (prevIndex >= 0) {
      setSelectedApplicant(filteredApplicants[prevIndex]);
      setSelectedApplicantIndex(prevIndex);
    }
  };

  const handleNextApplicant = () => {
    const nextIndex = selectedApplicantIndex + 1;
    if (nextIndex < filteredApplicants.length) {
      setSelectedApplicant(filteredApplicants[nextIndex]);
      setSelectedApplicantIndex(nextIndex);
    }
  };

  const handleViewResume = async (applicant: ApplicantWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    if (applicant.resume?.resume_url) {
      window.open(applicant.resume.resume_url, '_blank');
    }
  };

  const handleRetryParsing = async (applicant: ApplicantWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryConfirmApplicant(applicant);
  };

  const confirmRetryParsing = async () => {
    const applicant = retryConfirmApplicant;
    if (!applicant) return;
    setRetryConfirmApplicant(null);
    try {
      setRetryingId(applicant.id);
      const adminClient = getSupabaseAdminClient();
      const { error } = await adminClient
        .from('resumes')
        .update({ status: 'pending', parsed_data: null })
        .eq('id', applicant.resume?.id);
      if (error) throw error;
      await fetchApplicantsList();
      showToast('Resume re-queued for parsing.', 'success');
    } catch (err) {
      console.error('Error retrying parsing:', err);
      showToast('Failed to retry parsing. Please try again.', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const selectedPosition = positions.find(p => p.position === selectedJobId);

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.pending;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
            <p className="text-gray-500 mt-1">
              {selectedPosition 
                ? `${filteredApplicants.length} applicant${filteredApplicants.length !== 1 ? 's' : ''} for ${selectedPosition.position}`
                : 'New applicants — track resume upload and parse status before AI screening'}
            </p>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search — takes most space */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search applicant name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              <button
                onClick={() => fetchApplicantsList()}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                title="Refresh list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Job Position filter */}
            <FilterDropdown
              value={selectedJobId || ''}
              onChange={(v) => setSelectedJobId(v === '' ? null : v)}
              options={[
                { value: '', label: 'All Positions' },
                ...positions.map(pos => ({ value: pos.position, label: `${pos.position} (${pos.count})` }))
              ]}
              width={`w-full sm:w-56 ${isFetchingJobs ? 'opacity-50 pointer-events-none' : ''}`}
            />
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Job Applied
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Resume
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Resume Status
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Applied Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <TableSkeleton />
                ) : (
                  <>
                    {paginatedApplicants.length > 0 ? (
                      paginatedApplicants.map((applicant, pageIndex) => {
                        const status = getApplicationStatus(applicant);
                        const isError = status === 'error';
                        const globalIndex = (currentPage - 1) * itemsPerPage + pageIndex;
                        
                        return (
                          <tr 
                            key={applicant.id}
                            onClick={() => handleOpenModal(applicant, globalIndex)}
                            className="hover:bg-blue-50/40 transition-colors duration-150 cursor-pointer group"
                          >
                            {/* Name */}
                            <td className="px-4 py-4">
                              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                {applicant.name}
                              </p>
                            </td>

                            {/* Job Applied */}
                            <td className="px-4 py-4">
                              <span className="text-sm text-gray-600">
                                {applicant.position}
                              </span>
                            </td>

                            {/* Email */}
                            <td className="px-4 py-4">
                              <a 
                                href={`mailto:${applicant.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
                              >
                                {applicant.email}
                              </a>
                            </td>

                            {/* Resume */}
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={(e) => handleViewResume(applicant, e)}
                                disabled={!applicant.resume?.resume_url}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100"
                              >
                                <FileText className="w-4 h-4" />
                                View
                                {applicant.resume?.resume_url && (
                                  <ExternalLink className="w-3 h-3" />
                                )}
                              </button>
                            </td>

                            {/* Resume Status */}
                            <td className="px-4 py-4 text-center">
                              {getStatusBadge(status)}
                            </td>

                            {/* Applied Date */}
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-gray-500">
                                  {formatDate(applicant.created_at)}
                                </span>
                                {isError && (
                                  <button
                                    onClick={(e) => handleRetryParsing(applicant, e)}
                                    disabled={retryingId === applicant.id}
                                    className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-all disabled:opacity-50"
                                    title="Retry Parsing"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${retryingId === applicant.id ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyState selectedJob={selectedPosition?.position || null} />
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && filteredApplicants.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
              <p className="text-sm text-gray-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length} results
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Applicant Detail Modal */}
      <ApplicantDetailModal
        applicant={selectedApplicant}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onPrev={selectedApplicantIndex > 0 ? handlePrevApplicant : undefined}
        onNext={selectedApplicantIndex < filteredApplicants.length - 1 ? handleNextApplicant : undefined}
        currentIndex={selectedApplicantIndex}
        totalCount={filteredApplicants.length}
      />

      {/* Retry Parsing Confirmation Modal */}
      {retryConfirmApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Retry Resume Parsing?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              The resume for <span className="font-medium text-gray-700">{retryConfirmApplicant.name}</span> will be re-queued for AI parsing. Any existing parsed data will be cleared.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRetryConfirmApplicant(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRetryParsing}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Retry Parsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          'bg-amber-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> :
           toast.type === 'error' ? <XCircle className="w-4 h-4 flex-shrink-0" /> :
           <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
