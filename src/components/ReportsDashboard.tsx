import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Download,
  Calendar,
  Filter,
  ChevronDown,
  FileText,
  Video,
  ClipboardCheck,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Award,
  Briefcase,
  Mail,
  CheckCircle,
  XCircle,
  Printer,
  Share2
} from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
  screening_status?: 'passed' | 'in_review' | 'failed' | 'not_scored';
  screened_at?: string;
}

interface ReportsDashboardProps {
  applicants: ApplicantWithDetails[];
}

// Calculate days between dates
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function ReportsDashboard({ applicants }: ReportsDashboardProps) {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedReport, setSelectedReport] = useState<'overview' | 'pipeline' | 'scores' | 'time'>('overview');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState<boolean>(false);

  // Mock departments (in production, fetch from job_postings table)
  const departments = ['all', 'Engineering', 'MIS', 'Human Resources', 'Finance', 'Marketing', 'Operations'];

  // Filter applicants by date range
  const filteredApplicants = useMemo(() => {
    if (dateRange === 'all') return applicants;
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return applicants.filter(a => new Date(a.created_at) >= cutoff);
  }, [applicants, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = filteredApplicants.length;
    const forReview = filteredApplicants.filter(a => a.screening_status === 'passed').length;
    const inProgress = filteredApplicants.filter(a => a.screening_status === 'in_review').length;
    const videoCompleted = filteredApplicants.filter(a => a.video?.status === 'completed').length;
    const assessmentCompleted = filteredApplicants.filter(a => a.test?.status === 'completed').length;
    
    // Time to hire calculations
    const completedApplicants = filteredApplicants.filter(a => 
      a.test?.status === 'completed' && a.test?.submitted_at
    );
    
    const timeToHire = completedApplicants.length > 0
      ? completedApplicants.reduce((sum, a) => {
          const days = daysBetween(a.created_at, a.test?.submitted_at || a.created_at);
          return sum + days;
        }, 0) / completedApplicants.length
      : 0;

    // Score averages - use screening_score from applicant level (not resume)
    const avgResumeScore = filteredApplicants.length > 0
      ? Math.round(filteredApplicants.reduce((sum, a) => sum + (a.screening_score ?? 0), 0) / total)
      : 0;

    return {
      total,
      suitable: forReview,
      notSuitable: inProgress,
      needsReview: inProgress,
      videoCompleted,
      assessmentCompleted,
      conversionRate: total > 0 ? Math.round((assessmentCompleted / total) * 100) : 0,
      avgTimeToHire: Math.round(timeToHire),
      avgResumeScore,
    };
  }, [filteredApplicants]);

  // Pipeline data
  const pipelineData = useMemo(() => {
    const forReview = filteredApplicants.filter(a => a.screening_status === 'passed').length;
    const inProgress = filteredApplicants.filter(a => a.screening_status === 'in_review').length;
    
    return [
      { stage: 'Applied', count: filteredApplicants.length, color: 'bg-blue-500' },
      { stage: 'Resume Review', count: forReview + inProgress, color: 'bg-emerald-500' },
      { stage: 'Video Assessment', count: filteredApplicants.filter(a => a.video?.status === 'completed').length, color: 'bg-purple-500' },
      { stage: 'Work Style Assessment', count: filteredApplicants.filter(a => a.test?.status === 'completed').length, color: 'bg-orange-500' },
      { stage: 'Hired', count: Math.floor(filteredApplicants.filter(a => a.test?.status === 'completed').length * 0.3), color: 'bg-green-500' },
    ];
  }, [filteredApplicants]);

  // Score distribution
  const scoreDistribution = useMemo(() => {
    const ranges = [
      { range: '90-100', count: 0, label: 'Excellent' },
      { range: '80-89', count: 0, label: 'Good' },
      { range: '70-79', count: 0, label: 'Average' },
      { range: '60-69', count: 0, label: 'Below Average' },
      { range: 'Below 60', count: 0, label: 'Poor' },
    ];

    filteredApplicants.forEach(a => {
      // Use actual scores from database, fall back to screening_status
      const testScore = a.test?.semantic_score;
      // transcript_score is 0-10, convert to 0-100 for comparison
      const videoScore = a.video?.transcript_score != null ? Math.round(a.video.transcript_score * 10) : null;
      const resumeScore = a.screening_score;
      
      // Calculate composite score: prioritize test > video > resume
      let score: number;
      if (testScore != null && testScore > 0) {
        score = testScore;
      } else if (videoScore != null && videoScore > 0) {
        score = videoScore;
      } else if (resumeScore != null && resumeScore > 0) {
        score = resumeScore;
      } else {
        // Fallback: derive from screening status
        score = a.screening_status === 'passed' ? 80 : a.screening_status === 'in_review' ? 60 : 40;
      }
      
      if (score >= 90) ranges[0].count++;
      else if (score >= 80) ranges[1].count++;
      else if (score >= 70) ranges[2].count++;
      else if (score >= 60) ranges[3].count++;
      else ranges[4].count++;
    });

    return ranges;
  }, [filteredApplicants]);

  // Position breakdown
  const positionBreakdown = useMemo(() => {
    const positions: Record<string, number> = {};
    filteredApplicants.forEach(a => {
      positions[a.position] = (positions[a.position] || 0) + 1;
    });
    return Object.entries(positions)
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredApplicants]);

  // Calculate average days for each stage
  const timelineAverages = useMemo(() => {
    // Resume review: applicants who have been screened (screened_at timestamp)
    const forReviewApplicants = filteredApplicants.filter(a => a.screening_status === 'passed' && a.screened_at);
    
    // Video complete: video assessments with submitted_at timestamp
    const videoCompleted = filteredApplicants.filter(a => a.video?.status === 'completed' && a.video?.submitted_at);
    
    // Assessment complete: work_style_assessments with submitted_at timestamp
    const assessmentCompleted = filteredApplicants.filter(a => a.test?.status === 'completed' && a.test?.submitted_at);
    
    const avgForReviewDays = forReviewApplicants.length > 0
      ? Math.round(forReviewApplicants.reduce((sum, a) => sum + daysBetween(a.created_at, a.screened_at || a.created_at), 0) / forReviewApplicants.length)
      : 1;
    
    const avgVideoDays = videoCompleted.length > 0
      ? Math.round(videoCompleted.reduce((sum, a) => sum + daysBetween(a.created_at, a.video?.submitted_at || a.created_at), 0) / videoCompleted.length)
      : 2;
    
    // Use work_style_assessments.submitted_at for assessment completion timing
    const avgAssessmentDays = assessmentCompleted.length > 0
      ? Math.round(assessmentCompleted.reduce((sum, a) => sum + daysBetween(a.created_at, a.test?.submitted_at || a.created_at), 0) / assessmentCompleted.length)
      : 2;
    
    return {
      resume: avgForReviewDays,
      videoInvite: Math.max(1, avgForReviewDays),
      videoComplete: avgVideoDays,
      assessmentComplete: avgAssessmentDays,
    };
  }, [filteredApplicants]);

  const handleExport = (format: 'csv' | 'pdf') => {
    alert(`Exporting report as ${format.toUpperCase()}...`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-8 lg:p-10 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Track recruitment metrics and performance</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {[
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '90d', label: '90 Days' },
              { id: 'all', label: 'All Time' },
            ].map((range) => (
              <button
                key={range.id}
                onClick={() => setDateRange(range.id as typeof dateRange)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  dateRange === range.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          
          {/* Export Actions */}
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handlePrint}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
            { id: 'scores', label: 'Scores', icon: Award },
            { id: 'time', label: 'Time Analytics', icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedReport(tab.id as typeof selectedReport)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                selectedReport === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Report */}
      {selectedReport === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { 
                label: 'Total Applicants', 
                value: metrics.total, 
                icon: Users, 
                color: 'bg-blue-500',
                change: '+12%',
                changeUp: true 
              },
              { 
                label: 'Resume Suitable', 
                value: metrics.suitable, 
                icon: FileText, 
                color: 'bg-emerald-500',
                change: '+8%',
                changeUp: true 
              },
              { 
                label: 'Completed Assessments', 
                value: metrics.assessmentCompleted, 
                icon: CheckCircle, 
                color: 'bg-purple-500',
                change: '+15%',
                changeUp: true 
              },
              { 
                label: 'Avg. Time to Hire', 
                value: `${metrics.avgTimeToHire} days`, 
                icon: Clock, 
                color: 'bg-orange-500',
                change: '-2 days',
                changeUp: false 
              },
            ].map((metric, idx) => (
              <div key={idx} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg ${metric.color} bg-opacity-10`}>
                    <metric.icon className={`w-6 h-6 ${metric.color.replace('bg-', 'text-')}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${
                    metric.changeUp ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {metric.changeUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {metric.change}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold text-gray-900">{metric.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{metric.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Position Breakdown */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Position</h3>
              <div className="space-y-4">
                {positionBreakdown.map((pos, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{pos.position}</span>
                      <span className="text-sm text-gray-500">{pos.count} applicants</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${metrics.total > 0 ? (pos.count / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                {positionBreakdown.length === 0 && (
                  <p className="text-gray-400 text-center py-8">No data available</p>
                )}
              </div>
            </div>

            {/* Conversion Funnel */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
              <div className="space-y-3">
                {pipelineData.map((stage, idx) => {
                  const prevCount = idx > 0 ? pipelineData[idx - 1].count : stage.count;
                  const conversion = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 100;
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-medium text-gray-700">{stage.stage}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                            <div
                              className={`h-full ${stage.color} rounded-lg transition-all duration-500 flex items-center justify-end px-2`}
                              style={{ width: `${Math.max((stage.count / metrics.total) * 100, 5)}%` }}
                            >
                              <span className="text-white text-sm font-semibold">{stage.count}</span>
                            </div>
                          </div>
                          {idx > 0 && (
                            <span className="text-xs text-gray-500 w-12">{conversion}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Overall Conversion</span>
                  <span className="font-semibold text-blue-600">{metrics.conversionRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Report */}
      {selectedReport === 'pipeline' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Recruitment Pipeline Analysis</h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Stage Breakdown */}
              <div className="lg:col-span-2">
                <div className="space-y-4">
                  {[
                    { 
                      stage: 'New Applications', 
                      count: filteredApplicants.filter(a => !a.screening_status).length,
                      desc: 'Awaiting screening',
                      color: 'bg-yellow-500',
                      icon: Mail
                    },
                    { 
                      stage: 'For Review', 
                      count: filteredApplicants.filter(a => a.screening_status === 'passed').length,
                      desc: 'Ready for review',
                      color: 'bg-emerald-500',
                      icon: FileText
                    },
                    { 
                      stage: 'Video Assessment', 
                      count: filteredApplicants.filter(a => a.video?.status === 'submitted' || a.video?.status === 'completed').length,
                      desc: 'Video submitted or completed',
                      color: 'bg-purple-500',
                      icon: Video
                    },
                    { 
                      stage: 'Work Style Assessment', 
                      count: filteredApplicants.filter(a => a.test?.status === 'completed').length,
                      desc: 'Assessment completed',
                      color: 'bg-orange-500',
                      icon: ClipboardCheck
                    },
                    { 
                      stage: 'In Progress', 
                      count: filteredApplicants.filter(a => a.screening_status === 'in_review').length,
                      desc: 'Screening in progress',
                      color: 'bg-blue-500',
                      icon: Clock
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center`}>
                        <item.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-gray-900">{item.stage}</h4>
                          <span className="text-2xl font-bold text-gray-900">{item.count}</span>
                        </div>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Stats */}
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-blue-900">Pass Rate</h4>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">
                    {metrics.total > 0 ? Math.round((metrics.suitable / metrics.total) * 100) : 0}%
                  </p>
                  <p className="text-sm text-blue-600">Resume to Suitable</p>
                </div>

                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">Video Completion</h4>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">
                    {metrics.suitable > 0 ? Math.round((metrics.videoCompleted / metrics.suitable) * 100) : 0}%
                  </p>
                  <p className="text-sm text-purple-600">Of suitable candidates</p>
                </div>

                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck className="w-5 h-5 text-orange-600" />
                    <h4 className="font-semibold text-orange-900">Work Style Completion</h4>
                  </div>
                  <p className="text-3xl font-bold text-orange-700">
                    {metrics.videoCompleted > 0 ? Math.round((metrics.assessmentCompleted / metrics.videoCompleted) * 100) : 0}%
                  </p>
                  <p className="text-sm text-orange-600">Of video completed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scores Report */}
      {selectedReport === 'scores' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Distribution</h3>
              <div className="space-y-4">
                {scoreDistribution.map((range, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{range.label}</span>
                      <span className="text-sm text-gray-500">{range.range} ({range.count})</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          idx === 0 ? 'bg-green-500' :
                          idx === 1 ? 'bg-blue-500' :
                          idx === 2 ? 'bg-yellow-500' :
                          idx === 3 ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${metrics.total > 0 ? (range.count / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
                {/* Custom Department Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
                    className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 py-2 px-4 rounded-xl text-sm font-medium hover:border-gray-300 transition-colors min-w-[160px] justify-between"
                  >
                    <span>{selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDepartmentDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showDepartmentDropdown && (
                    <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto z-10 min-w-[160px] max-h-60">
                      {departments.map((dept) => (
                        <button
                          key={dept}
                          onClick={() => {
                            setSelectedDepartment(dept);
                            setShowDepartmentDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                            selectedDepartment === dept
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {dept === 'all' ? 'All Departments' : dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {filteredApplicants
                  .filter(a => {
                    // Filter by completion status
                    const hasCompletedAssessment = a.test?.status === 'completed' || a.video?.status === 'completed' || a.screening_status === 'passed';
                    if (!hasCompletedAssessment) return false;
                    
                    // Filter by department (mock logic - in production, join with job_postings)
                    if (selectedDepartment === 'all') return true;
                    
                    // Mock department assignment based on position keywords
                    const positionLower = (a.position || '').toLowerCase();
                    const dept = selectedDepartment.toLowerCase();
                    
                    if (dept === 'engineering') return positionLower.includes('engineer') || positionLower.includes('developer') || positionLower.includes('software');
                    if (dept === 'mis') return positionLower.includes('it') || positionLower.includes('mis') || positionLower.includes('systems');
                    if (dept === 'human resources') return positionLower.includes('hr') || positionLower.includes('human resources') || positionLower.includes('recruit');
                    if (dept === 'finance') return positionLower.includes('finance') || positionLower.includes('accountant') || positionLower.includes('financial');
                    if (dept === 'marketing') return positionLower.includes('marketing') || positionLower.includes('digital') || positionLower.includes('brand');
                    if (dept === 'operations') return positionLower.includes('operations') || positionLower.includes('logistics') || positionLower.includes('coordinator');
                    
                    return true;
                  })
                  .slice(0, 5)
                  .map((applicant, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                        {applicant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{applicant.name}</p>
                        <p className="text-sm text-gray-500">{applicant.position}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">
                          {applicant.test?.semantic_score ?? (applicant.video?.transcript_score != null ? Math.round(applicant.video.transcript_score * 10) : null) ?? applicant.screening_score ?? (applicant.screening_status === 'passed' ? 80 : applicant.screening_status === 'in_review' ? 60 : 0)}
                        </p>
                        <p className="text-xs text-gray-400">score</p>
                      </div>
                    </div>
                  ))}
                {filteredApplicants.filter(a => a.test?.status === 'completed').length === 0 && (
                  <p className="text-gray-400 text-center py-8">No completed assessments yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Analytics Report */}
      {selectedReport === 'time' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Time-to-Hire Analytics</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-4xl font-bold text-blue-700">{metrics.avgTimeToHire}</p>
                <p className="text-sm text-blue-600">Average Days to Hire</p>
              </div>
              <div className="text-center p-6 bg-emerald-50 rounded-xl">
                <Calendar className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-4xl font-bold text-emerald-700">
                  {filteredApplicants.length > 0 
                    ? Math.round(
                        filteredApplicants
                          .filter(a => a.resume?.reviewed_at)
                          .reduce((sum, a) => {
                            const days = daysBetween(a.created_at, a.resume?.reviewed_at || a.created_at);
                            return sum + days;
                          }, 0) / filteredApplicants.filter(a => a.resume?.reviewed_at).length || 0)
                    : 0}
                </p>
                <p className="text-sm text-emerald-600">Avg. Resume Review (days)</p>
              </div>
              <div className="text-center p-6 bg-purple-50 rounded-xl">
                <Video className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-4xl font-bold text-purple-700">
                  {filteredApplicants.filter(a => a.video?.status === 'completed').length > 0
                    ? Math.round(filteredApplicants.filter(a => a.video?.status === 'completed').reduce((sum, a) => {
                        const days = daysBetween(a.created_at, a.video?.submitted_at || a.created_at);
                        return sum + days;
                      }, 0) / filteredApplicants.filter(a => a.video?.status === 'completed').length)
                    : 0}
                </p>
                <p className="text-sm text-purple-600">Avg. Video Completion (days)</p>
              </div>
            </div>

            {/* Timeline Visualization */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="font-medium text-gray-900 mb-4">Typical Candidate Journey</h4>
              <div className="relative">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2" />
                <div className="relative flex justify-between">
                  {[
                    { label: 'Applied', day: 'Day 0', icon: Mail },
                    { label: 'Resume Review', day: `Day ${timelineAverages.resume}`, icon: FileText },
                    { label: 'Video Invite', day: `Day ${timelineAverages.videoInvite}`, icon: Video },
                    { label: 'Video Complete', day: `Day ${timelineAverages.videoComplete}`, icon: CheckCircle },
                    { label: 'Assessment Complete', day: `Day ${timelineAverages.assessmentComplete}`, icon: Award },
                  ].map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center bg-white px-2">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white mb-2">
                        <step.icon className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">{step.label}</p>
                      <p className="text-xs text-gray-500">{step.day}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
