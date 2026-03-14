import { useMemo } from 'react';
import { Users, FileText, Video, ClipboardCheck, TrendingUp, CheckCircle, Clock, AlertCircle, Zap, Eye, Mail, Filter, ArrowRight, Briefcase, BarChart3, UserPlus, FileCheck } from 'lucide-react';
import { Applicant, Resume, VideoAssessment, PersonalityTest } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
}

interface DashboardLandingProps {
  applicants: ApplicantWithDetails[];
  onMenuChange?: (menuId: string) => void;
}

export function DashboardLanding({ applicants, onMenuChange }: DashboardLandingProps) {
  // Calculate statistics
  const totalApplicants = applicants.length;

  // Resume stage breakdown
  const resumeStages = {
    pending: applicants.filter(a => !a.resume || a.resume.status === 'pending').length,
    suitable: applicants.filter(a => a.resume?.status === 'suitable').length,
    notSuitable: applicants.filter(a => a.resume?.status === 'not_suitable').length,
  };

  // Video assessment breakdown
  const videoStages = {
    notStarted: applicants.filter(a => a.resume?.status === 'suitable' && (!a.video || a.video.status === 'pending')).length,
    submitted: applicants.filter(a => a.video?.status === 'submitted').length,
    completed: applicants.filter(a => a.video?.status === 'completed').length,
  };

  // Personality test breakdown
  const testStages = {
    notStarted: applicants.filter(a => a.video?.status === 'completed' && (!a.test || a.test.status === 'pending')).length,
    completed: applicants.filter(a => a.test?.status === 'completed').length,
  };

  // Overall progress calculation
  const fullyCompleted = applicants.filter(a => 
    a.resume?.status === 'suitable' && 
    a.video?.status === 'completed' && 
    a.test?.status === 'completed'
  ).length;

  const completionRate = totalApplicants > 0 ? Math.round((fullyCompleted / totalApplicants) * 100) : 0;

  // Stats cards data
  const statsCards = [
    {
      title: 'Total Applicants',
      value: totalApplicants,
      icon: Users,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-100',
      textColor: 'text-blue-600',
    },
    {
      title: 'Resume Review',
      value: resumeStages.suitable + resumeStages.notSuitable,
      subValue: `${resumeStages.suitable} suitable`,
      icon: FileText,
      color: 'bg-emerald-500',
      lightColor: 'bg-emerald-100',
      textColor: 'text-emerald-600',
    },
    {
      title: 'Video Assessment',
      value: videoStages.submitted + videoStages.completed,
      subValue: `${videoStages.completed} completed`,
      icon: Video,
      color: 'bg-purple-500',
      lightColor: 'bg-purple-100',
      textColor: 'text-purple-600',
    },
    {
      title: 'Personality Test',
      value: testStages.completed,
      subValue: `${testStages.notStarted} pending`,
      icon: ClipboardCheck,
      color: 'bg-orange-500',
      lightColor: 'bg-orange-100',
      textColor: 'text-orange-600',
    },
  ];

  // Hiring funnel stages
  const funnelStages = [
    {
      name: 'Resume Submitted',
      count: applicants.filter(a => a.resume?.status).length,
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
    },
    {
      name: 'Resume Suitable',
      count: resumeStages.suitable,
      icon: CheckCircle,
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      name: 'Video Submitted',
      count: videoStages.submitted + videoStages.completed,
      icon: Video,
      color: 'from-purple-500 to-purple-600',
    },
    {
      name: 'Video Completed',
      count: videoStages.completed,
      icon: CheckCircle,
      color: 'from-violet-500 to-violet-600',
    },
    {
      name: 'Test Completed',
      count: testStages.completed,
      icon: ClipboardCheck,
      color: 'from-orange-500 to-orange-600',
    },
  ];

  const maxFunnelCount = Math.max(...funnelStages.map(s => s.count), 1);

  // Job performance - calculate applicants per position
  const jobPerformance = useMemo(() => {
    const jobCounts: Record<string, { count: number; suitable: number }> = {};
    applicants.forEach(app => {
      const position = app.position || 'Unknown';
      if (!jobCounts[position]) {
        jobCounts[position] = { count: 0, suitable: 0 };
      }
      jobCounts[position].count++;
      if (app.resume?.status === 'suitable') {
        jobCounts[position].suitable++;
      }
    });
    
    return Object.entries(jobCounts)
      .map(([position, data]) => ({
        position,
        applicants: data.count,
        suitable: data.suitable,
        conversionRate: data.count > 0 ? Math.round((data.suitable / data.count) * 100) : 0,
      }))
      .sort((a, b) => b.applicants - a.applicants)
      .slice(0, 5);
  }, [applicants]);

  const totalJobs = jobPerformance.length;
  const totalApplications = applicants.length;

  // Generate recent activity from applicants data
  const generateRecentActivity = () => {
    const activities: Array<{
      type: 'new_applicant' | 'resume_reviewed' | 'video_submitted' | 'test_completed';
      message: string;
      time: string;
      applicantName: string;
    }> = [];

    // Sort applicants by created_at (newest first) - take last 5
    const recentApplicants = [...applicants]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    recentApplicants.forEach(applicant => {
      activities.push({
        type: 'new_applicant',
        message: `New applicant applied for ${applicant.position}`,
        time: applicant.created_at,
        applicantName: applicant.name,
      });

      if (applicant.resume?.status === 'suitable' || applicant.resume?.status === 'not_suitable') {
        activities.push({
          type: 'resume_reviewed',
          message: `Resume marked as ${applicant.resume.status.replace('_', ' ')}`,
          time: applicant.resume.uploaded_at,
          applicantName: applicant.name,
        });
      }

      if (applicant.video?.status === 'submitted' || applicant.video?.status === 'completed') {
        activities.push({
          type: 'video_submitted',
          message: `Video assessment ${applicant.video.status}`,
          time: applicant.video.submitted_at || applicant.video.created_at,
          applicantName: applicant.name,
        });
      }

      if (applicant.test?.status === 'completed') {
        activities.push({
          type: 'test_completed',
          message: 'Completed personality test',
          time: applicant.test.submitted_at || applicant.test.created_at,
          applicantName: applicant.name,
        });
      }
    });

    // Sort by time and take top 8
    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 8);
  };

  const recentActivity = generateRecentActivity();

  // Format relative time
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  // Quick actions data
  const quickActions = [
    {
      label: 'Review Pending Resumes',
      count: resumeStages.pending,
      icon: FileText,
      color: 'bg-emerald-500',
      action: () => onMenuChange?.('applicants'),
    },
    {
      label: 'View Shortlisted',
      count: resumeStages.suitable,
      icon: CheckCircle,
      color: 'bg-blue-500',
      action: () => onMenuChange?.('shortlisted'),
    },
    {
      label: 'Pending Videos',
      count: videoStages.notStarted,
      icon: Video,
      color: 'bg-purple-500',
      action: () => onMenuChange?.('assessments'),
    },
    {
      label: 'Pending Tests',
      count: testStages.notStarted,
      icon: ClipboardCheck,
      color: 'bg-orange-500',
      action: () => onMenuChange?.('assessments'),
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600 mt-1">Track your recruitment pipeline and hiring progress</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
          <TrendingUp className="w-5 h-5 text-green-500" />
          <span className="text-sm font-medium text-gray-700">Completion Rate:</span>
          <span className="text-lg font-bold text-green-600">{completionRate}%</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${stat.lightColor}`}>
                  <Icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
                {stat.subValue && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {stat.subValue}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-900">{stat.value}</h3>
                <p className="text-sm text-gray-500 mt-1">{stat.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Job Performance Section */}
      <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Job Performance</h2>
              <p className="text-sm text-gray-500">Applicant stats by position</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{totalJobs}</p>
              <p className="text-gray-500">Active Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{totalApplications}</p>
              <p className="text-gray-500">Total Applications</p>
            </div>
          </div>
        </div>

        {jobPerformance.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobPerformance.map((job, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{job.position}</p>
                      <p className="text-xs text-gray-500">{job.applicants} applicants</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-600">{job.suitable} suitable</span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    job.conversionRate >= 50 ? 'bg-green-100 text-green-700' :
                    job.conversionRate >= 25 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {job.conversionRate}% rate
                  </span>
                </div>
                <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${job.conversionRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No job data available yet</p>
            <p className="text-sm text-gray-400">Job performance will appear here</p>
          </div>
        )}
      </div>

      {/* Hiring Progress Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Hiring Funnel & Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hiring Funnel */}
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Hiring Funnel</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <TrendingUp className="w-4 h-4" />
                <span>Progress tracking</span>
              </div>
            </div>

            <div className="space-y-4">
              {funnelStages.map((stage, index) => {
                const Icon = stage.icon;
                const percentage = maxFunnelCount > 0 ? (stage.count / maxFunnelCount) * 100 : 0;
                const prevCount = index > 0 ? funnelStages[index - 1].count : stage.count;
                const conversionRate = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 100;

                return (
                  <div key={index} className="relative">
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stage.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>

                      {/* Progress Bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{stage.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{stage.count}</span>
                            {index > 0 && (
                              <span className={`text-xs font-medium ${conversionRate >= 70 ? 'text-green-600' : conversionRate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {conversionRate}% conversion
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${stage.color} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Quick Actions</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={index}
                    onClick={action.action}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate">{action.label}</p>
                      <p className="text-xs text-gray-500">{action.count} pending</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Stage Breakdown & Recent Activity */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Stage Breakdown</h2>

          <div className="space-y-6">
            {/* Resume Stage */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                Resume Review
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Suitable</span>
                  <span className="font-medium text-emerald-600">{resumeStages.suitable}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Not Suitable</span>
                  <span className="font-medium text-red-600">{resumeStages.notSuitable}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-medium text-yellow-600">{resumeStages.pending}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Video Stage */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-500" />
                Video Assessment
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Completed</span>
                  <span className="font-medium text-purple-600">{videoStages.completed}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Submitted</span>
                  <span className="font-medium text-blue-600">{videoStages.submitted}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Not Started</span>
                  <span className="font-medium text-gray-500">{videoStages.notStarted}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Test Stage */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-orange-500" />
                Personality Test
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Completed</span>
                  <span className="font-medium text-orange-600">{testStages.completed}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-medium text-gray-500">{testStages.notStarted}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Summary */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900">{fullyCompleted} Fully Qualified</p>
                <p className="text-xs text-green-700">Completed all stages</p>
              </div>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Recent Activity</h3>
              </div>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                Last 24h
              </span>
            </div>

            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => {
                  const activityIcons = {
                    new_applicant: UserPlus,
                    resume_reviewed: FileCheck,
                    video_submitted: Video,
                    test_completed: ClipboardCheck,
                  };
                  const activityColors = {
                    new_applicant: 'bg-blue-100 text-blue-600',
                    resume_reviewed: 'bg-emerald-100 text-emerald-600',
                    video_submitted: 'bg-purple-100 text-purple-600',
                    test_completed: 'bg-orange-100 text-orange-600',
                  };
                  const Icon = activityIcons[activity.type];

                  return (
                    <div key={index} className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${activityColors[activity.type]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{activity.applicantName}</span>{' '}
                          <span className="text-gray-600">{activity.message}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{getRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6">
                  <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No recent activity</p>
                  <p className="text-xs text-gray-400">Check back later for updates</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Status Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <AlertCircle className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Recruitment Status</h3>
            <p className="text-gray-600 mt-1">
              You have <span className="font-semibold text-blue-600">{resumeStages.pending}</span> resumes pending review and{' '}
              <span className="font-semibold text-orange-600">{testStages.notStarted}</span> candidates waiting to complete their assessments.
            </p>
          </div>
          {resumeStages.pending > 0 && (
            <button
              onClick={() => onMenuChange?.('applicants')}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Review Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
