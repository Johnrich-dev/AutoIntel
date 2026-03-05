import { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  MoreHorizontal, 
  CheckSquare, 
  Square,
  Download,
  Mail,
  Trash2,
  FileText,
  Video,
  ClipboardCheck,
  Star,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  User,
  ArrowUpDown,
  CalendarDays,
  Briefcase,
  Award,
  Tag
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest, ResumeParsedData } from '../lib/supabase';
import { ApplicantDetailModal } from './ApplicantDetailModal';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
}

interface ApplicantsListProps {
  applicants: ApplicantWithDetails[];
  onViewApplicant?: (applicant: ApplicantWithDetails) => void;
}

// Helper to parse resume data
function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

// Calculate resume score (mock algorithm - can be replaced with actual scoring)
function calculateResumeScore(resume?: Resume): number {
  if (!resume || !resume.parsed_data) return 0;
  const parsed = getParsedResumeData(resume);
  if (!parsed) return 0;
  
  let score = 0;
  // Skills diversity
  if (parsed.skills?.hard_skills?.length) score += Math.min(parsed.skills.hard_skills.length * 5, 30);
  if (parsed.skills?.soft_skills?.length) score += Math.min(parsed.skills.soft_skills.length * 3, 15);
  // Experience
  if (parsed.experience?.length) score += Math.min(parsed.experience.length * 5, 20);
  // Education
  if (parsed.education?.length) score += Math.min(parsed.education.length * 5, 15);
  // Projects
  if (parsed.projects?.length) score += Math.min(parsed.projects.length * 4, 12);
  // Trainings
  if (parsed.trainings?.length) score += Math.min(parsed.trainings.length * 3, 8);
  
  return Math.min(Math.round(score), 100);
}

// Calculate video assessment score
function calculateVideoScore(video?: VideoAssessment): number {
  if (!video) return 0;
  if (video.status === 'completed') return Math.floor(Math.random() * 15) + 80; // 80-95 for completed
  if (video.status === 'submitted') return Math.floor(Math.random() * 20) + 60; // 60-80 for submitted
  return 0;
}

// Calculate profile fit score from personality test
function calculateProfileFit(test?: PersonalityTest): number {
  if (!test || test.status !== 'completed') return 0;
  // Mock calculation based on answers
  const avgAnswer = test.answers.reduce((sum, a) => sum + a.answer, 0) / (test.answers.length || 1);
  return Math.min(Math.round((avgAnswer / 5) * 100), 100);
}

// Calculate overall score
function calculateOverallScore(resumeScore: number, videoScore: number, profileFit: number): number {
  const weights = { resume: 0.4, video: 0.35, profile: 0.25 };
  const score = (resumeScore * weights.resume) + (videoScore * weights.video) + (profileFit * weights.profile);
  return Math.round(score);
}

// Get status badge
function getStatusBadge(status: string) {
  const configs: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    suitable: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
    not_suitable: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
    completed: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', icon: FileText },
    reviewed: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );
}

// Score badge component
function ScoreBadge({ score }: { score: number }) {
  let colorClass = 'text-gray-600 bg-gray-100';
  if (score >= 80) colorClass = 'text-green-700 bg-green-100';
  else if (score >= 60) colorClass = 'text-blue-700 bg-blue-100';
  else if (score >= 40) colorClass = 'text-yellow-700 bg-yellow-100';
  else if (score > 0) colorClass = 'text-red-700 bg-red-100';
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-sm font-semibold ${colorClass}`}>
      {score > 0 ? score : '-'}
    </span>
  );
}

export function ApplicantsList({ applicants, onViewApplicant }: ApplicantsListProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplicants, setSelectedApplicants] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'name' | 'overall' | 'resume' | 'video' | 'profile' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantWithDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [applicantTags, setApplicantTags] = useState<Record<string, string[]>>({});
  const itemsPerPage = 10;

  // Load tags from localStorage
  useState(() => {
    const saved = localStorage.getItem('applicant_tags');
    if (saved) {
      setApplicantTags(JSON.parse(saved));
    }
  });

  // Process applicants with scores
  const processedApplicants = useMemo(() => {
    return applicants.map(applicant => {
      const resumeScore = calculateResumeScore(applicant.resume);
      const videoScore = calculateVideoScore(applicant.video);
      const profileFit = calculateProfileFit(applicant.test);
      const overall = calculateOverallScore(resumeScore, videoScore, profileFit);
      
      // Determine current status
      let status = 'pending';
      if (applicant.test?.status === 'completed') status = 'completed';
      else if (applicant.video?.status === 'completed') status = 'submitted';
      else if (applicant.resume?.status === 'suitable') status = 'reviewed';
      else if (applicant.resume?.status === 'not_suitable') status = 'not_suitable';
      
      return {
        ...applicant,
        resumeScore,
        videoScore,
        profileFit,
        overall,
        status,
      };
    });
  }, [applicants]);

  // Filter and sort
  const filteredApplicants = useMemo(() => {
    let result = processedApplicants;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.email.toLowerCase().includes(query) ||
        a.position.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'overall':
          comparison = a.overall - b.overall;
          break;
        case 'resume':
          comparison = a.resumeScore - b.resumeScore;
          break;
        case 'video':
          comparison = a.videoScore - b.videoScore;
          break;
        case 'profile':
          comparison = a.profileFit - b.profileFit;
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [processedApplicants, searchQuery, statusFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredApplicants.length / itemsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const toggleSelectAll = () => {
    if (selectedApplicants.size === paginatedApplicants.length) {
      setSelectedApplicants(new Set());
    } else {
      setSelectedApplicants(new Set(paginatedApplicants.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedApplicants);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedApplicants(newSet);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleBulkAction = (action: string) => {
    // TODO: Implement bulk actions
    console.log(`Bulk action: ${action} on`, Array.from(selectedApplicants));
    alert(`${action} for ${selectedApplicants.size} applicants`);
  };

  const handleOpenModal = (applicant: ApplicantWithDetails) => {
    const applicantWithScores = processedApplicants.find(a => a.id === applicant.id);
    if (applicantWithScores) {
      setSelectedApplicant(applicantWithScores);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedApplicant(null);
  };

  const getTagsForApplicant = (id: string) => {
    const saved = localStorage.getItem(`applicant_tags_${id}`);
    return saved ? JSON.parse(saved) : [];
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
          <p className="text-gray-600 mt-1">
            {filteredApplicants.length} total applicants • {selectedApplicants.size} selected
          </p>
        </div>
        
        {/* Bulk Actions */}
        {selectedApplicants.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedApplicants.size} selected:</span>
            <button 
              onClick={() => handleBulkAction('email')}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button 
              onClick={() => handleBulkAction('export')}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button 
              onClick={() => handleBulkAction('delete')}
              className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or position..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {statusFilter !== 'all' && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">1</span>
            )}
          </button>
          
          {/* Refresh */}
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        
        {/* Filter Options */}
        {showFilters && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending Review</option>
                  <option value="reviewed">Resume Suitable</option>
                  <option value="submitted">Video Submitted</option>
                  <option value="completed">Assessment Completed</option>
                  <option value="not_suitable">Not Suitable</option>
                </select>
              </div>
              
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Applicants Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-12">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    {selectedApplicants.size === paginatedApplicants.length && paginatedApplicants.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    Applicant
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('resume')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="p-1.5 bg-emerald-100 rounded-md">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="hidden lg:inline">Resume</span>
                    {sortField === 'resume' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('video')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="p-1.5 bg-purple-100 rounded-md">
                      <Video className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <span className="hidden lg:inline">Video</span>
                    {sortField === 'video' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('profile')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="p-1.5 bg-orange-100 rounded-md">
                      <ClipboardCheck className="w-3.5 h-3.5 text-orange-600" />
                    </div>
                    <span className="hidden lg:inline">Profile</span>
                    {sortField === 'profile' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('overall')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="p-1.5 bg-yellow-100 rounded-md">
                      <Award className="w-3.5 h-3.5 text-yellow-600" />
                    </div>
                    <span className="hidden lg:inline">Overall</span>
                    {sortField === 'overall' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-bold text-gray-700">
                  Status
                </th>
                <th
                  className="px-4 py-3 text-center text-sm font-bold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center justify-center gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400" />
                    <span className="hidden lg:inline">Applied</span>
                    {sortField === 'date' && (
                      sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedApplicants.length > 0 ? (
                paginatedApplicants.map((applicant) => (
                  <tr 
                    key={applicant.id} 
                    className="group hover:bg-blue-50/50 transition-all duration-200 cursor-pointer"
                    onClick={() => handleOpenModal(applicant)}
                  >
                    <td className="px-4 py-4">
                      <button 
                        onClick={() => toggleSelect(applicant.id)}
                        className="flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                      >
                        {selectedApplicants.has(applicant.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm">
                            {applicant.name.charAt(0).toUpperCase()}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                            applicant.status === 'completed' ? 'bg-green-500' :
                            applicant.status === 'submitted' ? 'bg-blue-500' :
                            applicant.status === 'reviewed' ? 'bg-emerald-500' :
                            applicant.status === 'not_suitable' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{applicant.name}</p>
                          <div className="flex items-center gap-2 text-sm">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-600">{applicant.position}</span>
                          </div>
                          {/* Tags */}
                          {getTagsForApplicant(applicant.id).length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {getTagsForApplicant(applicant.id).slice(0, 2).map((tag: string) => (
                                <span 
                                  key={tag} 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium"
                                >
                                  <Tag className="w-3 h-3" />
                                  {tag}
                                </span>
                              ))}
                              {getTagsForApplicant(applicant.id).length > 2 && (
                                <span className="text-[10px] text-gray-400">
                                  +{getTagsForApplicant(applicant.id).length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ScoreBadge score={applicant.resumeScore} />
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              applicant.resumeScore >= 80 ? 'bg-green-500' :
                              applicant.resumeScore >= 60 ? 'bg-blue-500' :
                              applicant.resumeScore >= 40 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${applicant.resumeScore}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ScoreBadge score={applicant.videoScore} />
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              applicant.videoScore >= 80 ? 'bg-green-500' :
                              applicant.videoScore >= 60 ? 'bg-blue-500' :
                              applicant.videoScore >= 40 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${applicant.videoScore}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ScoreBadge score={applicant.profileFit} />
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              applicant.profileFit >= 80 ? 'bg-green-500' :
                              applicant.profileFit >= 60 ? 'bg-blue-500' :
                              applicant.profileFit >= 40 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${applicant.profileFit}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-xl font-bold ${
                          applicant.overall >= 80 ? 'text-green-700 bg-green-100 ring-2 ring-green-200' :
                          applicant.overall >= 60 ? 'text-blue-700 bg-blue-100 ring-2 ring-blue-200' :
                          applicant.overall >= 40 ? 'text-yellow-700 bg-yellow-100 ring-2 ring-yellow-200' :
                          'text-gray-600 bg-gray-100'
                        }`}>
                          {applicant.overall > 0 ? applicant.overall : '-'}
                        </span>
                        <span className="text-xs text-gray-400">overall</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {getStatusBadge(applicant.status)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium text-gray-700">
                          {new Date(applicant.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(applicant.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(applicant);
                          }}
                          className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No applicants found</p>
                    <p className="text-sm text-gray-400">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of {filteredApplicants.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
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
