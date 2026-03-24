import { useState, useMemo } from 'react';
import { Users, FileText, Video, TrendingUp, CheckCircle, AlertCircle, XCircle, Calendar, ChevronDown, Search, UserPlus } from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  screening_status?: 'passed' | 'needs_review' | 'failed';
  screening_stage?: 'screened' | 'review' | 'shortlisted';
}

interface DashboardLandingProps {
  applicants: ApplicantWithDetails[];
  onMenuChange?: (menuId: string) => void;
}

// Loading skeleton component
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Users className="w-12 h-12 mb-3 opacity-50" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function DashboardLanding({ applicants, onMenuChange }: DashboardLandingProps) {
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Get unique jobs for dropdown
  const jobs = useMemo(() => {
    const jobSet = new Set(applicants.map(a => a.position).filter(Boolean));
    return ['all', ...Array.from(jobSet)];
  }, [applicants]);

  // Filter applicants based on selected job and search
  const filteredApplicants = useMemo(() => {
    let filtered = applicants;
    
    if (selectedJob !== 'all') {
      filtered = filtered.filter(a => a.position === selectedJob);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name?.toLowerCase().includes(query) || 
        a.email?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [applicants, selectedJob, searchQuery]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const total = filteredApplicants.length;
    // Use screening_status from ScreeningResults
    const passed = filteredApplicants.filter(a => a.screening_status === 'passed').length;
    const needsReview = filteredApplicants.filter(a => a.screening_status === 'needs_review').length;
    const failed = filteredApplicants.filter(a => a.screening_status === 'failed').length;
    
    return { total, passed, needsReview, failed };
  }, [filteredApplicants]);

  // Funnel stages - Using AdminScoringSettings colors (Blue, Purple, Teal, Orange, Green)
  const funnelStages = useMemo(() => {
    const interviewCount = kpis.passed > 0 ? Math.floor(kpis.passed * 0.6) : 0;
    const hiredCount = interviewCount > 0 ? Math.floor(interviewCount * 0.5) : 0;
    return [
      { name: 'Applicants', count: kpis.total, color: '#BFDBFE', textColor: '#1E40AF' },
      { name: 'Screened', count: kpis.passed + kpis.failed, color: '#E9D5FF', textColor: '#7E22CE' },
      { name: 'Shortlisted', count: kpis.passed, color: '#99F6E4', textColor: '#0F766E' },
      { name: 'Interview', count: interviewCount, color: '#FED7AA', textColor: '#C2410C' },
      { name: 'Hired', count: hiredCount, color: '#BBF7D0', textColor: '#15803D' },
    ];
  }, [kpis]);

  // Applicants needing review
  const needsReviewApplicants = useMemo(() => {
    return filteredApplicants
      .filter(a => a.screening_status === 'needs_review' || !a.resume || a.resume.status === 'pending')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [filteredApplicants]);

  // Recent applicants
  const recentApplicants = useMemo(() => {
    return [...filteredApplicants]
      .filter(a => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'needs_review') return !a.resume || a.resume.status === 'pending';
        if (statusFilter === 'passed') return a.resume?.status === 'suitable';
        if (statusFilter === 'failed') return a.resume?.status === 'not_suitable';
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [filteredApplicants, statusFilter]);

  // Get status info - Using AdminScoringSettings colors (Yellow, Green, Red)
  const getStatusInfo = (applicant: ApplicantWithDetails) => {
    // Use screening_status from ScreeningResults
    if (applicant.screening_status === 'passed') {
      return { label: 'Passed', bgColor: '#D1FAE5', textColor: '#065F46', icon: CheckCircle };
    }
    if (applicant.screening_status === 'failed') {
      return { label: 'Failed', bgColor: '#FEE2E2', textColor: '#991B1B', icon: XCircle };
    }
    if (applicant.screening_status === 'needs_review') {
      return { label: 'Needs Review', bgColor: '#FEF3C7', textColor: '#92400E', icon: AlertCircle };
    }
    // Fallback to resume status
    if (!applicant.resume || applicant.resume.status === 'pending') {
      return { label: 'Needs Review', bgColor: '#FEF3C7', textColor: '#92400E', icon: AlertCircle };
    }
    if (applicant.resume.status === 'suitable') {
      return { label: 'Passed', bgColor: '#D1FAE5', textColor: '#065F46', icon: CheckCircle };
    }
    return { label: 'Failed', bgColor: '#FEE2E2', textColor: '#991B1B', icon: XCircle };
  };

  const getRelativeTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  // Loading state
  if (!applicants.length) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full p-6 space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-40" />
          </div>
          
          {/* KPI Cards skeleton */}
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full p-6 space-y-6">
        
        {/* Header with Job Selector and Date */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Recruitment overview</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Job Selector */}
            <div className="relative">
              <select
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="appearance-none bg-white border border-gray-200 text-gray-700 py-2.5 px-4 pr-10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-300 transition-colors"
              >
                {jobs.map(job => (
                  <option key={job} value={job}>
                    {job === 'all' ? 'All Jobs' : job}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            
            {/* Date Display */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* KPI Cards - Using AdminScoringSettings palette: Blue, Green, Yellow, Red */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Applicants - Blue */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{kpis.total}</p>
                <p className="text-sm text-gray-500 font-medium">Total Applicants</p>
              </div>
            </div>
          </div>

          {/* Passed - Green */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{kpis.passed}</p>
                <p className="text-sm text-gray-500 font-medium">Passed</p>
                {kpis.total > 0 && (
                  <p className="text-xs font-medium text-green-600">{Math.round((kpis.passed / kpis.total) * 100)}%</p>
                )}
              </div>
            </div>
          </div>

          {/* Needs Review - Yellow */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow-100">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{kpis.needsReview}</p>
                <p className="text-sm text-gray-500 font-medium">Needs Review</p>
                {kpis.total > 0 && (
                  <p className="text-xs font-medium text-yellow-600">{Math.round((kpis.needsReview / kpis.total) * 100)}%</p>
                )}
              </div>
            </div>
          </div>

          {/* Failed - Red */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-red-100">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{kpis.failed}</p>
                <p className="text-sm text-gray-500 font-medium">Failed</p>
                {kpis.total > 0 && (
                  <p className="text-xs font-medium text-red-600">{Math.round((kpis.failed / kpis.total) * 100)}%</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">


            {/* Needs Review Panel - High Priority */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-gray-800">Needs Review</h2>
                  <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">
                    {needsReviewApplicants.length}
                  </span>
                </div>
                <button
                  onClick={() => onMenuChange?.('needs-review')}
                  className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors">
                  View All
                </button>
              </div>
              
              {needsReviewApplicants.length > 0 ? (
                <div className="space-y-3">
                  {needsReviewApplicants.map((applicant) => {
                    const StatusIcon = AlertCircle;
                    return (
                      <div 
                        key={applicant.id}
                        className="flex items-center justify-between p-4 rounded-xl hover:opacity-90 transition-opacity bg-yellow-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-yellow-200">
                            <UserPlus className="w-5 h-5 text-yellow-700" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">{applicant.name}</p>
                            <p className="text-xs text-gray-500">{applicant.position}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{getRelativeTime(applicant.created_at)}</span>
                          <button
                            onClick={() => onMenuChange?.('needs-review')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-yellow-500 text-white hover:bg-yellow-600"
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState message="No applicants need review" />
              )}
            </div>

            {/* Recent Applicants */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-800">Recent Applicants</h2>
                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="passed">Passed</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
              
              {recentApplicants.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="pb-3">Name</th>
                        <th className="pb-3">Job Applied</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Date Applied</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentApplicants.map((applicant) => {
                        const status = getStatusInfo(applicant);
                        const StatusIcon = status.icon;
                        return (
                          <tr 
                            key={applicant.id} 
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => onMenuChange?.('shortlisted')}
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-gray-600">
                                    {applicant.name?.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-sm font-medium text-gray-800">{applicant.name}</span>
                              </div>
                            </td>
                            <td className="py-3">
                              <span className="text-sm text-gray-600">{applicant.position}</span>
                            </td>
                            <td className="py-3">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: status.bgColor, color: status.textColor }}>
                                <StatusIcon className="w-3.5 h-3.5" />
                                {status.label}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className="text-sm text-gray-500">{getRelativeTime(applicant.created_at)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No applicants found" />
              )}
            </div>
          </div>

          {/* Right - 1/3 width */}
          <div className="space-y-6">
            {/* Quick Stats - Compact - Custom Colors */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300">
              <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Status</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-purple-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-700">Resume</span>
                  </div>
                  <span className="text-xs font-bold text-purple-600">{kpis.passed + kpis.failed}</span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-indigo-100">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-medium text-indigo-700">Video</span>
                  </div>
                  <span className="text-xs font-bold text-indigo-600">
                    {filteredApplicants.filter(a => a.video?.status === 'completed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-green-100">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Success</span>
                  </div>
                  <span className="text-xs font-bold text-green-600">
                    {kpis.total > 0 ? Math.round((kpis.passed / kpis.total) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Recruitment Funnel - Vertical Graph - Custom Colors */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300">
              <h2 className="text-sm font-bold text-gray-800 mb-3">Recruitment Funnel</h2>
              <div className="space-y-2">
                {funnelStages.map((stage, idx) => (
                  <div key={stage.name} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: stage.color }}>
                      <span className="font-bold text-sm" style={{ color: stage.textColor }}>{stage.count}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">{stage.name}</span>
                        <span className="text-xs text-gray-400">
                          {idx === 0 ? '100%' : 
                           idx === 1 ? `${kpis.total > 0 ? Math.round(((kpis.passed + kpis.failed) / kpis.total) * 100) : 0}%` : 
                           idx === 2 ? `${kpis.passed + kpis.failed > 0 ? Math.round((kpis.passed / (kpis.passed + kpis.failed)) * 100) : 0}%` :
                           idx === 3 ? `${kpis.passed > 0 ? Math.round((Math.floor(kpis.passed * 0.6) / kpis.passed) * 100) : 0}%` : 
                           `${kpis.passed > 0 ? Math.round((Math.floor(Math.floor(kpis.passed * 0.6) * 0.5) / kpis.passed) * 100) : 0}%`}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ 
                            backgroundColor: stage.color,
                            width: idx === 0 ? '100%' : 
                            idx === 1 ? (kpis.total > 0 ? Math.round(((kpis.passed + kpis.failed) / kpis.total) * 100) : 0) + '%' : 
                            idx === 2 ? (kpis.passed + kpis.failed > 0 ? Math.round((kpis.passed / (kpis.passed + kpis.failed)) * 100) : 0) + '%' :
                            idx === 3 ? (kpis.passed > 0 ? Math.round((Math.floor(kpis.passed * 0.6) / kpis.passed) * 100) : 0) + '%' : 
                            (kpis.passed > 0 ? Math.round((Math.floor(Math.floor(kpis.passed * 0.6) * 0.5) / kpis.passed) * 100) : 0) + '%'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
