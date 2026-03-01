import { Calendar, CheckCircle, ClipboardList, FileText, LogOut, Send, Users, Video, X } from 'lucide-react';
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

export function AdminDashboard() {
  const { logout } = useAuth();
  const [applicants, setApplicants] = useState<ApplicantWithDetails[]>([]);
  const [filteredApplicants, setFilteredApplicants] = useState<ApplicantWithDetails[]>([]);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'filtered' | 'unfiltered'>('all');
  const [error, setError] = useState<string | null>(null);

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
              adminClient.from('personality_tests').select('*').eq('applicant_id', applicant.id).maybeSingle(),
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
        <div className="text-gray-600 text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SentinelAI Admin Dashboard</h1>
                <p className="text-sm text-gray-600">Manage applicants and review assessments</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = '/';
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            All Resumes
          </button>
          <button
            onClick={() => setFilter('filtered')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'filtered' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Filtered (Suitable)
          </button>
          <button
            onClick={() => setFilter('unfiltered')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'unfiltered' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Unfiltered (All)
          </button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resume
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Video
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Test
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApplicants.map((applicant) => (
                  <tr key={applicant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{applicant.name}</div>
                        <div className="text-sm text-gray-500">{applicant.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{applicant.position}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(applicant.resume?.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(applicant.video?.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(applicant.test?.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedApplicant(applicant)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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

                        {/* Skills - Separated into Hard and Soft */}
                        {parsedData.skills && (parsedData.skills.hard_skills?.length > 0 || parsedData.skills.soft_skills?.length > 0) && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Skills</h4>
                            
                            {/* Hard Skills */}
                            {parsedData.skills.hard_skills && parsedData.skills.hard_skills.length > 0 && (
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
                            )}
                            
                            {/* Soft Skills */}
                            {parsedData.skills.soft_skills && parsedData.skills.soft_skills.length > 0 && (
                              <div>
                                <h5 className="text-xs font-medium text-gray-400 uppercase mb-1">Soft Skills</h5>
                                <div className="flex flex-wrap gap-1">
                                  {parsedData.skills.soft_skills.map((skill: string, idx: number) => (
                                    <span key={`soft-${idx}`} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Education - College and Senior High only */}
                        {parsedData.education && parsedData.education.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Education</h4>
                            <div className="space-y-2">
                              {parsedData.education.filter((edu: any) => edu.education_type === 'College' || edu.education_type === 'Senior High School').map((edu: any, idx: number) => (
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
                              ))}
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
                    <h3 className="text-lg font-semibold text-gray-900">Personality Test</h3>
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
                          'Sent personality test invitation'
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

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedApplicant(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleAction(
                    selectedApplicant.id,
                    'scheduled_interview',
                    'Scheduled final interview'
                  );
                  setSelectedApplicant(null);
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Schedule Interview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
