import { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  ChevronDown, 
  Eye, 
  FileText, 
  Trash2, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Briefcase,
  Users,
  Loader2
} from 'lucide-react';
import { Applicant, Resume, JobPosting } from '../lib/supabase';
import { supabase, getSupabaseAdminClient } from '../lib/supabase';
import { ApplicantDetailModal } from './ApplicantDetailModal';

// Interface for position/role option from applicants
interface PositionOption {
  position: string;
  count: number;
}

interface ApplicantWithResume extends Applicant {
  resume?: Resume;
}

type ApplicationStatus = 'all' | 'pending' | 'processing' | 'parsed' | 'error';

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
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mx-auto" />
          </td>
          <td className="px-4 py-5">
            <div className="flex items-center justify-center gap-2">
              <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
            </div>
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
      <td colSpan={7} className="px-4 py-16 text-center">
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
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingJobs, setIsFetchingJobs] = useState(true);
  const [applicants, setApplicants] = useState<ApplicantWithResume[]>([]);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantWithResume | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  
  const itemsPerPage = 10;

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

  // Fetch applicants when job is selected
  useEffect(() => {
    async function fetchApplicants() {
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

        // Combine applicants with their resumes
        const applicantsWithResumes = (applicantsData || []).map(applicant => ({
          ...applicant,
          resume: resumesMap[applicant.id],
        }));

        setApplicants(applicantsWithResumes);
      } catch (err) {
        console.error('Error fetching applicants:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchApplicants();
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
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(a => getApplicationStatus(a) === statusFilter);
    }
    
    return result;
  }, [applicants, searchQuery, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, selectedJobId]);

  // Handlers
  const handleOpenModal = (applicant: ApplicantWithResume, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedApplicant(applicant);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedApplicant(null);
  };

  const handleViewResume = async (applicant: ApplicantWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    if (applicant.resume?.resume_url) {
      window.open(applicant.resume.resume_url, '_blank');
    }
  };

  const handleRetryParsing = async (applicant: ApplicantWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Retry parsing this resume?')) return;
    
    try {
      setRetryingId(applicant.id);
      
      // Call the retry endpoint or function
      const { error } = await supabase
        .from('resumes')
        .update({ status: 'pending', parsed_data: null })
        .eq('id', applicant.resume?.id);

      if (error) throw error;
      
      // Refresh applicants list
      const { data: updatedData } = await supabase
        .from('applicants')
        .select('*')
        .eq('position', selectedJobId)
        .order('created_at', { ascending: false });
        
      if (updatedData) {
        const applicantIds = updatedData.map(a => a.id);
        let resumesMap: Record<string, Resume> = {};
        
        if (applicantIds.length > 0) {
          const { data: resumesData } = await supabase
            .from('resumes')
            .select('*')
            .in('applicant_id', applicantIds);

          if (resumesData) {
            resumesMap = resumesData.reduce((acc, resume) => {
              acc[resume.applicant_id] = resume;
              return acc;
            }, {} as Record<string, Resume>);
          }
        }

        const applicantsWithResumes = updatedData.map(a => ({
          ...a,
          resume: resumesMap[a.id],
        }));
        setApplicants(applicantsWithResumes);
      }
    } catch (err) {
      console.error('Error retrying parsing:', err);
      alert('Failed to retry parsing. Please try again.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (applicant: ApplicantWithResume, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${applicant.name}?`)) return;
    
    try {
      // Delete resume first
      if (applicant.resume?.id) {
        await supabase.from('resumes').delete().eq('id', applicant.resume.id);
      }
      
      // Delete applicant
      const { error } = await supabase.from('applicants').delete().eq('id', applicant.id);
      if (error) throw error;
      
      // Update local state
      setApplicants(prev => prev.filter(a => a.id !== applicant.id));
    } catch (err) {
      console.error('Error deleting applicant:', err);
      alert('Failed to delete applicant. Please try again.');
    }
  };

  const handleJobChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedJobId(value === '' ? null : value);
  };

  const selectedPosition = positions.find(p => p.position === selectedJobId);

  // Helper to get job title from job_id
  const getJobTitle = (jobId: string) => {
    return jobId;
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
            <p className="text-gray-500 mt-1">
              {selectedPosition 
                ? `${filteredApplicants.length} applicant${filteredApplicants.length !== 1 ? 's' : ''} for ${selectedPosition.position}`
                : 'Select a job position to view applicants'}
            </p>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Job Selector */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Briefcase className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Job Position
              </label>
              <div className="relative">
                <select
                  value={selectedJobId || ''}
                  onChange={handleJobChange}
                  disabled={isFetchingJobs}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">All Jobs</option>
                  {positions.map(pos => (
                    <option key={pos.position} value={pos.position}>
                      {pos.position} ({pos.count})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Search */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 hover:bg-gray-100 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Status Filter Tabs */}
          {selectedJobId && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {(['all', 'pending', 'processing', 'parsed', 'error'] as ApplicationStatus[]).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      statusFilter === status
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {status === 'all' ? 'All' : STATUS_CONFIGS[status].label}
                    {status !== 'all' && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                        statusFilter === status ? 'bg-blue-500' : 'bg-gray-200'
                      }`}>
                        {applicants.filter(a => getApplicationStatus(a) === status).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
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
                    Status
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Applied Date
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <TableSkeleton />
                ) : (
                  <>
                    {paginatedApplicants.length > 0 ? (
                      paginatedApplicants.map((applicant) => {
                        const status = getApplicationStatus(applicant);
                        const isError = status === 'error';
                        
                        return (
                          <tr 
                            key={applicant.id} 
                            className="hover:bg-gray-50/80 transition-colors duration-150 group"
                          >
                            {/* Name */}
                            <td className="px-4 py-4">
                              <button
                                onClick={(e) => handleOpenModal(applicant, e)}
                                className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                              >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                  {applicant.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                    {applicant.name}
                                  </p>
                                </div>
                              </button>
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

                            {/* Status */}
                            <td className="px-4 py-4 text-center">
                              {getStatusBadge(status)}
                            </td>

                            {/* Applied Date */}
                            <td className="px-4 py-4">
                              <span className="text-sm text-gray-500">
                                {formatDate(applicant.created_at)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* View Details */}
                                <button
                                  onClick={(e) => handleOpenModal(applicant, e)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {/* Retry Parsing (only for error state) */}
                                {isError && (
                                  <button
                                    onClick={(e) => handleRetryParsing(applicant, e)}
                                    disabled={retryingId === applicant.id}
                                    className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-all disabled:opacity-50"
                                    title="Retry Parsing"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${retryingId === applicant.id ? 'animate-spin' : ''}`} />
                                  </button>
                                )}

                                {/* Delete */}
                                <button
                                  onClick={(e) => handleDelete(applicant, e)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
          {!isLoading && totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
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
        onStatusChange={(id, status) => console.log('Status change:', id, status)}
        onAddNote={(id, note) => console.log('Note added:', id, note)}
        onAddTag={(id, tag) => console.log('Tag added:', id, tag)}
        onRemoveTag={(id, tag) => console.log('Tag removed:', id, tag)}
        onSendEmail={(id, template) => console.log('Email sent:', id, template)}
      />
    </div>
  );
}
