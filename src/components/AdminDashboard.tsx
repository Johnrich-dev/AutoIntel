import { Calendar, CheckCircle, FileText, LayoutDashboard, LogOut, Menu, Send, Settings, Shield, Users, Video, X, XCircle, Briefcase, BarChart3, Sliders, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { AdminJobManagement } from './AdminJobManagement';
import { AdminScoringSettings } from './AdminScoringSettings';
import { DashboardLanding } from './DashboardLanding';
import { ApplicantsList } from './ApplicantsList';
import { ReportsDashboard } from './ReportsDashboard';
import { AdminSettings } from './AdminSettings';
import { ShortlistedCandidates } from './ShortlistedCandidates';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Applicant, PersonalityTest, Resume, ResumeParsedData, getSupabaseAdminClient, VideoAssessment } from '../lib/supabase';

interface ApplicantWithDetails extends Applicant {
  resume?: Resume;
  video?: VideoAssessment;
  test?: PersonalityTest;
}

// Helper function to parse resume data from string or object
function getParsedResumeData(resume: Resume | undefined): ResumeParsedData | null {
  if (!resume?.parsed_data) return null;
  if (typeof resume.parsed_data === 'object') return resume.parsed_data;
  try {
    return JSON.parse(resume.parsed_data);
  } catch {
    return null;
  }
}

// Navigation menu items organized by category
const menuItems = [
  // RECRUITMENT Section
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'RECRUITMENT' },
  { id: 'applicants', label: 'Applicants', icon: Users, category: 'RECRUITMENT' },
  { id: 'shortlisted', label: 'Shortlisted', icon: CheckCircle, category: 'RECRUITMENT' },
  { id: 'job-management', label: 'Job Management', icon: Briefcase, category: 'RECRUITMENT' },
  // ANALYTICS Section
  { id: 'reports', label: 'Reports', icon: BarChart3, category: 'ANALYTICS' },
  { id: 'scoring-settings', label: 'Scoring Settings', icon: Sliders, category: 'ANALYTICS' },
  // SYSTEM Section
  { id: 'settings', label: 'Settings', icon: Settings, category: 'SYSTEM' },
];

type MenuId = typeof menuItems[number]['id'];

// Group menu items by category
const groupedMenuItems = menuItems.reduce((acc, item) => {
  if (!acc[item.category]) {
    acc[item.category] = [];
  }
  acc[item.category].push(item);
  return acc;
}, {} as Record<string, typeof menuItems>);

export function AdminDashboard() {
  const { adminLogout, isAdminAuthenticated } = useAuth();
  const [applicants, setApplicants] = useState<ApplicantWithDetails[]>([]);
  const [filteredApplicants, setFilteredApplicants] = useState<ApplicantWithDetails[]>([]);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'filtered' | 'unfiltered'>('all');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuId>('dashboard');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [schedulePlatform, setSchedulePlatform] = useState('Google Meet');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    loadApplicants();
  }, []);

  useEffect(() => {
    let filtered = applicants;
    if (filter === 'filtered') {
      filtered = applicants.filter(app => app.resume?.status === 'suitable');
    } else if (filter === 'unfiltered') {
      filtered = applicants.filter(app => !app.resume || app.resume.status !== 'suitable');
    }
    // 'all' shows all
    setFilteredApplicants(filtered);
  }, [applicants, filter]);

  const loadApplicants = async () => {
    try {
      setError(null);
      const adminClient = getSupabaseAdminClient();
      const { data: applicantsData, error: applicantsError } = await adminClient
        .from('applicants')
        .select('*')
        .order('created_at', { ascending: false });

      if (applicantsError) throw applicantsError;

      if (applicantsData) {
        const applicantsWithDetails = await Promise.all(
          applicantsData.map(async (applicant) => {
            const [resumeResult, videoResult, testResult] = await Promise.all([
              adminClient.from('resumes').select('*').eq('applicant_id', applicant.id).maybeSingle(),
              adminClient.from('video_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
              adminClient.from('work_style_assessments').select('*').eq('applicant_id', applicant.id).maybeSingle(),
            ]);

            return {
              ...applicant,
              resume: resumeResult.data || undefined,
              video: videoResult.data || undefined,
              test: testResult.data || undefined,
            };
          })
        );

        setApplicants(applicantsWithDetails);
      }
    } catch (error) {
      console.error('Error loading applicants:', error);
      setError(error instanceof Error ? error.message : 'Failed to load applicants.');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (applicantId: string, action: string, actionDescription: string) => {
    try {
      const adminClient = getSupabaseAdminClient();
      await adminClient.from('admin_actions').insert({
        applicant_id: applicantId,
        action_type: action,
        notes: actionDescription,
      });

      alert(`Action completed: ${actionDescription}`);
      loadApplicants();
    } catch (error) {
      console.error('Error performing action:', error);
      alert('Failed to complete action. Please try again.');
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status || status === 'pending') {
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">Pending</span>;
    }
    if (status === 'submitted' || status === 'reviewed') {
      return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">Submitted</span>;
    }
    if (status === 'suitable') {
      return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Suitable</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{status}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white text-gray-700 flex flex-col border-r border-gray-100 ${sidebarCollapsed ? 'w-20' : 'w-64'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} transition-all duration-300 ease-in-out shadow-sm`}
      >
        {/* Sidebar Header - Branding */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:justify-center lg:w-full' : ''}`}>
            <div className="w-10 h-10 bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-blue-500" />
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-lg font-semibold text-gray-900">AutoIntel</h1>
                <p className="text-xs text-gray-500">Admin Dashboard</p>
              </div>
            )}
          </div>
          {/* Collapse/Expand Button - Desktop Only */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {!sidebarCollapsed && Object.entries(groupedMenuItems).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h3 className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-gray-400">{category}</h3>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeMenu === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setActiveMenu(item.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                          isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        {/* Active indicator - 3px blue vertical accent line */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-blue-500 rounded-r-full" />
                        )}
                        <Icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-blue-500' : 'text-gray-500 group-hover:translate-x-0.5'}`} />
                        {!sidebarCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          
          {/* Collapsed view - show icons only */}
          {sidebarCollapsed && (
            <ul className="space-y-0.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeMenu === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        setActiveMenu(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                      title={item.label}
                    >
                      {/* Active indicator - 3px blue vertical accent line */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-blue-500 rounded-r-full" />
                      )}
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-blue-500' : 'text-gray-500 group-hover:translate-x-0.5'}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* Logout Section - Bottom of Sidebar */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => {
              adminLogout();
              window.location.href = '/?loggedout=true';
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-200 group ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 text-gray-500" />
            {!sidebarCollapsed && <span className="whitespace-nowrap overflow-hidden">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} pt-16 lg:pt-0`}>
        {/* Mobile Header with Hamburger */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-blue-500" />
            </div>
            <span className="font-bold text-gray-800">AutoIntel</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {activeMenu === 'dashboard' && <DashboardLanding applicants={applicants} onMenuChange={setActiveMenu} />}
          {activeMenu === 'applicants' && <ApplicantsList applicants={applicants} />}
          {activeMenu === 'reports' && <ReportsDashboard applicants={applicants} />}
          {activeMenu === 'settings' && <AdminSettings />}
          {activeMenu === 'job-management' && <AdminJobManagement />}
          {activeMenu === 'scoring-settings' && <AdminScoringSettings />}
          {activeMenu === 'shortlisted' && <ShortlistedCandidates applicants={applicants} />}
        </div>
      </main>

      {/* Applicant Detail Modal */}
      {selectedApplicant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{selectedApplicant.name}</h2>
                <p className="text-blue-100">{selectedApplicant.position}</p>
              </div>
              <button
                onClick={() => setSelectedApplicant(null)}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Email</h3>
                  <p className="text-gray-900">{selectedApplicant.email}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Applied Date</h3>
                  <p className="text-gray-900">
                    {new Date(selectedApplicant.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Resume</h3>
                    {getStatusBadge(selectedApplicant.resume?.status)}
                    {selectedApplicant.resume?.ner_status && (
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        selectedApplicant.resume.ner_status === 'completed' 
                          ? 'bg-green-100 text-green-700' 
                          : selectedApplicant.resume.ner_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {selectedApplicant.resume.ner_status === 'completed' ? 'Parsed' : selectedApplicant.resume.ner_status}
                      </span>
                    )}
                  </div>

                  {/* Parsed Resume Data */}
                  {(() => {
                    const parsedData = getParsedResumeData(selectedApplicant.resume);
                    return parsedData ? (
                      <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
                        {/* Contact Info */}
                        {(parsedData.email || parsedData.phone) && (
                          <div className="grid grid-cols-2 gap-4">
                            {parsedData.email && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-500 uppercase">Email</h4>
                                <p className="text-sm text-gray-900">{parsedData.email}</p>
                              </div>
                            )}
                            {parsedData.phone && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-500 uppercase">Phone</h4>
                                <p className="text-sm text-gray-900">{parsedData.phone}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Skills */}
                        {parsedData.skills && parsedData.skills.hard_skills?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Skills</h4>
                            
                            {/* Hard Skills */}
                            <div className="mb-2">
                              <h5 className="text-xs font-medium text-gray-400 uppercase mb-1">Technical</h5>
                              <div className="flex flex-wrap gap-1">
                                {parsedData.skills.hard_skills.map((skill: string, idx: number) => (
                                  <span key={`hard-${idx}`} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Education - College and Senior High only (with deduplication safety net) */}
                        {parsedData.education && parsedData.education.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Education</h4>
                            <div className="space-y-2">
                              {/* Deduplicate education entries in UI as safety net */}
                              {(() => {
                                const seen = new Set<string>();
                                const uniqueEducation = parsedData.education
                                  .filter((edu: any) => edu.education_type === 'College' || edu.education_type === 'Senior High School')
                                  .filter((edu: any) => {
                                    const key = `${(edu.school || '').toLowerCase().trim()}-${(edu.course_or_strand || '').toLowerCase().trim()}-${(edu.year_range || '').toLowerCase().trim()}`;
                                    if (seen.has(key)) return false;
                                    seen.add(key);
                                    return true;
                                  });
                                return uniqueEducation.map((edu: any, idx: number) => (
                                  <div key={idx} className="text-sm bg-white p-2 rounded border border-gray-200">
                                    <p className="font-medium text-gray-900">
                                      {edu.education_type === 'College' ? 'College' : 'Senior High School'}
                                    </p>
                                    {edu.school && (
                                      <p className="text-gray-700">{edu.school}</p>
                                    )}
                                    {edu.course_or_strand && (
                                      <p className="text-blue-600 text-xs">{edu.course_or_strand}</p>
                                    )}
                                    {edu.year_range && (
                                      <p className="text-gray-500 text-xs">{edu.year_range}</p>
                                    )}
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Work Experience - Only if section exists */}
                        {parsedData.experience && parsedData.experience.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Work Experience</h4>
                            <div className="space-y-2">
                              {parsedData.experience.slice(0, 3).map((exp: any, idx: number) => (
                                <div key={idx} className="text-sm bg-white p-2 rounded border border-gray-200">
                                  <p className="font-medium text-gray-900">
                                    {exp.role || 'Professional Experience'}
                                    {exp.company && <span className="text-gray-600"> at {exp.company}</span>}
                                  </p>
                                  {exp.years && (
                                    <p className="text-gray-500 text-xs">{exp.years}</p>
                                  )}
                                  {exp.summary && (
                                    <p className="text-gray-600 text-xs mt-1">{exp.summary}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Projects - Only if section exists */}
                        {parsedData.projects && parsedData.projects.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Projects</h4>
                            <div className="space-y-2">
                              {parsedData.projects.slice(0, 5).map((proj: any, idx: number) => (
                                <div key={idx} className="text-sm bg-white p-2 rounded border border-gray-200">
                                  <p className="font-medium text-gray-900">{proj.name}</p>
                                  {proj.details && (
                                    <p className="text-gray-600 text-xs mt-1">
                                      {Array.isArray(proj.details) 
                                        ? proj.details.join(' ') 
                                        : proj.details}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Certificates / Trainings / Seminars - Only if section exists */}
                        {parsedData.trainings && parsedData.trainings.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Certificates / Trainings</h4>
                            <div className="space-y-2">
                              {parsedData.trainings.slice(0, 5).map((training: any, idx: number) => (
                                <div key={idx} className="text-sm bg-white p-2 rounded border border-gray-200">
                                  <p className="font-medium text-gray-900">
                                    {typeof training === 'string' 
                                      ? training 
                                      : training.title || JSON.stringify(training)}
                                  </p>
                                  {training.date && (
                                    <p className="text-xs text-gray-500">{training.date}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Raw Resume Link */}
                  {selectedApplicant.resume?.resume_url && (
                    <div className="mb-3">
                      <a
                        href={selectedApplicant.resume.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View Original Resume →
                      </a>
                    </div>
                  )}
                  {selectedApplicant.resume?.status !== 'suitable' && (
                    <button
                      onClick={() =>
                        handleAction(
                          selectedApplicant.id,
                          'marked_suitable',
                          'Marked resume as suitable'
                        )
                      }
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Suitable
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Video className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Video Assessment</h3>
                    {getStatusBadge(selectedApplicant.video?.status)}
                  </div>
                  <div className="bg-gray-50 rounded p-4 mb-3 aspect-video flex items-center justify-center">
                    <div className="text-center">
                      <Video className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        {selectedApplicant.video?.video_url
                          ? 'Video player would appear here'
                          : 'No video submitted'}
                      </p>
                    </div>
                  </div>

                  {/* Transcription Section */}
                  {selectedApplicant.video?.status === 'submitted' && (
                    <div className="mb-3 border-t border-gray-200 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Video Assessment
                        </h4>
                        {selectedApplicant.video?.transcription_status && (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            selectedApplicant.video.transcription_status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : selectedApplicant.video.transcription_status === 'processing'
                              ? 'bg-yellow-100 text-yellow-800'
                              : selectedApplicant.video.transcription_status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedApplicant.video.transcription_status === 'completed' && '✓ Transcribed'}
                            {selectedApplicant.video.transcription_status === 'processing' && '⏳ Processing...'}
                            {selectedApplicant.video.transcription_status === 'failed' && '✗ Failed'}
                            {selectedApplicant.video.transcription_status === 'pending' && '⏸ Pending'}
                          </span>
                        )}
                      </div>

                      {/* Video Player */}
                      {selectedApplicant.video?.video_url && (
                        <div className="mb-3">
                          <video
                            controls
                            className="w-full max-h-48 rounded-lg bg-black"
                            src={selectedApplicant.video.video_url}
                          />
                        </div>
                      )}

                      {/* Transcript Score Display */}
                      {selectedApplicant.video?.transcript_score !== null && selectedApplicant.video?.transcript_score !== undefined && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-sm font-semibold text-blue-900">AI Transcript Score</h5>
                            <span className="text-lg font-bold text-blue-700">
                              {selectedApplicant.video.transcript_score}/10
                            </span>
                          </div>
                          
                          {/* Score Breakdown */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-white/60 rounded p-2">
                              <span className="text-gray-600">Relevance:</span>
                              <span className="ml-1 font-medium text-gray-900">{selectedApplicant.video.relevance_score}/10</span>
                            </div>
                            <div className="bg-white/60 rounded p-2">
                              <span className="text-gray-600">Experience:</span>
                              <span className="ml-1 font-medium text-gray-900">{selectedApplicant.video.experience_score}/10</span>
                            </div>
                            <div className="bg-white/60 rounded p-2">
                              <span className="text-gray-600">Skills:</span>
                              <span className="ml-1 font-medium text-gray-900">{selectedApplicant.video.skills_score}/10</span>
                            </div>
                            <div className="bg-white/60 rounded p-2">
                              <span className="text-gray-600">Completeness:</span>
                              <span className="ml-1 font-medium text-gray-900">{selectedApplicant.video.completeness_score}/10</span>
                            </div>
                          </div>
                          
                          {/* Validation Status */}
                          {selectedApplicant.video?.validation_status && selectedApplicant.video.validation_status !== 'validated' && (
                            <div className={`mt-2 text-xs px-2 py-1 rounded ${
                              selectedApplicant.video.validation_status === 'insufficient_response' 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {selectedApplicant.video.validation_message}
                            </div>
                          )}
                          
                          {/* Word Count & Duration */}
                          <div className="mt-2 flex gap-4 text-xs text-gray-500">
                            {selectedApplicant.video?.transcript_word_count && (
                              <span>Word Count: {selectedApplicant.video.transcript_word_count}</span>
                            )}
                            {selectedApplicant.video?.video_duration_seconds && (
                              <span>Duration: {Math.floor(selectedApplicant.video.video_duration_seconds / 60)}:{(selectedApplicant.video.video_duration_seconds % 60).toString().padStart(2, '0')}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Transcription Content */}
                      {selectedApplicant.video?.transcription_status === 'completed' && selectedApplicant.video?.transcription && (
                        <div className="bg-white border border-gray-200 rounded-lg p-3 max-h-60 overflow-y-auto">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {selectedApplicant.video.transcription}
                          </p>
                        </div>
                      )}

                      {/* Segments with Timestamps */}
                      {selectedApplicant.video?.transcription_status === 'completed' &&
                       selectedApplicant.video?.transcription_segments &&
                       selectedApplicant.video.transcription_segments.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">Timestamped Segments</h5>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedApplicant.video.transcription_segments.map((segment, idx) => (
                              <div key={idx} className="flex gap-3 text-sm">
                                <span className="text-gray-400 font-mono text-xs whitespace-nowrap pt-0.5">
                                  {Math.floor(segment.start / 60)}:{(segment.start % 60).toString().padStart(2, '0')}
                                </span>
                                <p className="text-gray-700">{segment.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {selectedApplicant.video?.transcription_status === 'failed' && selectedApplicant.video?.transcription_error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-700">
                            <span className="font-medium">Error:</span> {selectedApplicant.video.transcription_error}
                          </p>
                        </div>
                      )}

                      {/* Processing Status */}
                      {selectedApplicant.video?.transcription_status === 'processing' && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-yellow-700">Transcription is being processed...</p>
                        </div>
                      )}

                      {/* Pending Status */}
                      {(!selectedApplicant.video?.transcription_status || selectedApplicant.video?.transcription_status === 'pending') && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-sm text-gray-600">Transcription not started yet.</p>
                          {selectedApplicant.video?.video_url && (
                            <button
                              onClick={() => {
                                // Trigger transcription processing
                                console.log('Trigger transcription for:', selectedApplicant.id);
                                alert('Transcription processing would be triggered here');
                              }}
                              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Start Transcription →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedApplicant.video?.status === 'pending' && (
                    <button
                      onClick={() =>
                        handleAction(
                          selectedApplicant.id,
                          'sent_video_invite',
                          'Sent video assessment invitation'
                        )
                      }
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Send Video Invitation
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <ClipboardList className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Work Profiling Test</h3>
                    {getStatusBadge(selectedApplicant.test?.status)}
                  </div>
                  <div className="bg-gray-50 rounded p-4 mb-3">
                    {selectedApplicant.test?.status === 'submitted' ? (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">
                          Completed {selectedApplicant.test.answers.length} questions
                        </p>
                        <div className="text-xs text-gray-500">
                          AI analysis results would appear here
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600">No test submitted</p>
                    )}
                  </div>
                  {selectedApplicant.test?.status === 'pending' && (
                    <button
                      onClick={() =>
                        handleAction(
                          selectedApplicant.id,
                          'sent_test_invite',
                          'Sent work profiling test invitation'
                        )
                      }
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Send Test Invitation
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => setSelectedApplicant(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors text-sm"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowScheduleModal(true);
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Calendar className="w-4 h-4" />
                Schedule Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {showScheduleModal && selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Schedule Interview</h3>
              <button 
                onClick={() => {
                  setShowScheduleModal(false);
                  setScheduleDate('');
                  setScheduleTime('');
                  setSchedulePlatform('Google Meet');
                  setScheduleNotes('');
                }}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applicant</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {selectedApplicant.name} <span className="text-gray-500">({selectedApplicant.email})</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {selectedApplicant.position}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interview Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interview Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={schedulePlatform}
                  onChange={(e) => setSchedulePlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="Google Meet">Google Meet</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Microsoft Teams">Microsoft Teams</option>
                  <option value="Phone Call">Phone Call</option>
                  <option value="In-Person">In-Person</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="Add any additional notes for the applicant..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  setScheduleDate('');
                  setScheduleTime('');
                  setSchedulePlatform('Google Meet');
                  setScheduleNotes('');
                }}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!scheduleDate || !scheduleTime) {
                    alert('Please select both date and time');
                    return;
                  }
                  
                  setScheduling(true);
                  try {
                    // Call the API to schedule interview and send email
                    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/schedule-interview`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        applicant_email: selectedApplicant.email,
                        applicant_name: selectedApplicant.name,
                        position: selectedApplicant.position,
                        interview_date: scheduleDate,
                        interview_time: scheduleTime,
                        interview_platform: schedulePlatform,
                        interview_notes: scheduleNotes,
                      }),
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                      // Update applicant status
                      const adminClient = getSupabaseAdminClient();
                      await adminClient
                        .from('applicants')
                        .update({ status: 'interview_scheduled' })
                        .eq('id', selectedApplicant.id);
                      
                      // Log the action
                      handleAction(
                        selectedApplicant.id,
                        'scheduled_interview',
                        `Scheduled for ${scheduleDate} at ${scheduleTime} via ${schedulePlatform}`
                      );
                      
                      // Refresh the applicants list
                      loadApplicants();
                      
                      // Close modals
                      setShowScheduleModal(false);
                      setSelectedApplicant(null);
                      
                      // Reset form
                      setScheduleDate('');
                      setScheduleTime('');
                      setSchedulePlatform('Google Meet');
                      setScheduleNotes('');
                      
                      alert('Interview scheduled and email sent to applicant!');
                    } else {
                      alert('Failed to schedule interview: ' + result.message);
                    }
                  } catch (err) {
                    console.error('Error scheduling interview:', err);
                    alert('Failed to schedule interview. Please check if the API server is running.');
                  } finally {
                    setScheduling(false);
                  }
                }}
                disabled={scheduling || !scheduleDate || !scheduleTime}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Calendar className="w-4 h-4" />
                {scheduling ? 'Sending...' : 'Schedule & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

