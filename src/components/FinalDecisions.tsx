import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Award,
  CheckCircle,
  XCircle,
  Users,
  Download,
  X,
  Briefcase,
  Mail,
  Calendar,
  User,
} from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';

// ============================================================================
// Types
// ============================================================================

interface FinalDecisionRecord {
  id: string;
  name: string;
  email: string;
  position: string;
  department?: string;
  status: 'hired' | 'rejected';
  decision_date?: string;
  decision_notes?: string;
  interview_date?: string;
  interviewer_name?: string;
}

type StatusFilter = 'all' | 'hired' | 'rejected';

// ============================================================================
// Decision Badge
// ============================================================================

function DecisionBadge({ status }: { status: 'hired' | 'rejected' }) {
  if (status === 'hired') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        Hired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" />
      Rejected
    </span>
  );
}

// ============================================================================
// Decision Detail Modal
// ============================================================================

function DecisionModal({
  record,
  onClose,
}: {
  record: FinalDecisionRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Decision Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Candidate */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{record.name}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                {record.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-0.5">Position</p>
              <p className="font-medium text-gray-800 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                {record.position}
              </p>
            </div>
            {record.department && (
              <div>
                <p className="text-gray-500 mb-0.5">Department</p>
                <p className="font-medium text-gray-800">{record.department}</p>
              </div>
            )}
            {record.interview_date && (
              <div>
                <p className="text-gray-500 mb-0.5">Interview Date</p>
                <p className="font-medium text-gray-800 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {new Date(record.interview_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {record.interviewer_name && (
              <div>
                <p className="text-gray-500 mb-0.5">Interviewer</p>
                <p className="font-medium text-gray-800">{record.interviewer_name}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500 mb-0.5">Final Decision</p>
              <DecisionBadge status={record.status} />
            </div>
            {record.decision_date && (
              <div>
                <p className="text-gray-500 mb-0.5">Decision Date</p>
                <p className="font-medium text-gray-800">
                  {new Date(record.decision_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {record.decision_notes && (
            <div>
              <p className="text-gray-500 text-sm mb-1">Notes</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{record.decision_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FinalDecisions() {
  const [records, setRecords] = useState<FinalDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState<FinalDecisionRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const adminClient = getSupabaseAdminClient();

      const { data: applicantsData } = await adminClient
        .from('applicants')
        .select('id, name, email, position, status, decision_date, decision_notes, created_at')
        .in('status', ['hired', 'rejected'])
        .order('decision_date', { ascending: false });

      if (!applicantsData) {
        setRecords([]);
        return;
      }

      // Fetch interview data for these applicants
      const applicantIds = applicantsData.map((a) => a.id);
      const { data: interviewData } = await adminClient
        .from('scheduled_interviews')
        .select('applicant_id, interview_date, interviewer:interviewer_id(name)')
        .in('applicant_id', applicantIds);

      // Fetch job postings for department info
      const positions = [...new Set(applicantsData.map((a) => a.position).filter(Boolean))];
      const { data: jobsData } = await adminClient
        .from('job_postings')
        .select('title, department')
        .in('title', positions);

      const jobMap = new Map<string, string>();
      jobsData?.forEach((j) => {
        if (j.title) jobMap.set(j.title, j.department || '');
      });

      const interviewMap = new Map<string, { interview_date?: string; interviewer_name?: string }>();
      interviewData?.forEach((i) => {
        if (!interviewMap.has(i.applicant_id)) {
          interviewMap.set(i.applicant_id, {
            interview_date: i.interview_date,
            interviewer_name: (i.interviewer as any)?.name,
          });
        }
      });

      const mapped: FinalDecisionRecord[] = applicantsData.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        position: a.position || '',
        department: jobMap.get(a.position) || '',
        status: a.status as 'hired' | 'rejected',
        decision_date: a.decision_date,
        decision_notes: a.decision_notes,
        interview_date: interviewMap.get(a.id)?.interview_date,
        interviewer_name: interviewMap.get(a.id)?.interviewer_name,
      }));

      setRecords(mapped);
    } catch (err) {
      console.error('Error loading final decisions:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const departments = useMemo(() => {
    const deps = [...new Set(records.map((r) => r.department).filter(Boolean))] as string[];
    return ['all', ...deps];
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (departmentFilter !== 'all' && r.department !== departmentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.email.toLowerCase().includes(q) &&
          !r.position.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [records, statusFilter, departmentFilter, searchQuery]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = useMemo(() => {
    const total = records.length;
    const hired = records.filter((r) => r.status === 'hired').length;
    const rejected = records.filter((r) => r.status === 'rejected').length;
    const acceptanceRate = total > 0 ? Math.round((hired / total) * 100) : 0;
    return { total, hired, rejected, acceptanceRate };
  }, [records]);

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Position', 'Department', 'Interview Date', 'Interviewer', 'Decision', 'Decision Date', 'Notes'];
    const rows = filtered.map((r) => [
      r.name,
      r.email,
      r.position,
      r.department || '',
      r.interview_date ? new Date(r.interview_date).toLocaleDateString() : '',
      r.interviewer_name || '',
      r.status,
      r.decision_date ? new Date(r.decision_date).toLocaleDateString() : '',
      r.decision_notes || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'final_decisions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-blue-600" />
            Final Decisions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Candidates with confirmed hiring outcomes</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Decisions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Hired</p>
              <p className="text-2xl font-bold text-green-700">{stats.hired}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Rejected</p>
              <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Offer Acceptance Rate</p>
              <p className="text-2xl font-bold text-purple-700">{stats.acceptanceRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search candidate name, email, or position..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full h-10 pl-9 pr-4 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Department */}
          <FilterDropdown
            value={departmentFilter}
            onChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}
            options={departments.map(d => ({ value: d, label: d === 'all' ? 'All Departments' : d }))}
            width="w-full sm:w-52"
          />

          {/* Status */}
          <FilterDropdown
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as StatusFilter); setCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'hired', label: 'Hired' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            width="w-full sm:w-44"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Award className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No final decisions yet</p>
            <p className="text-sm text-gray-400 mt-1">Candidates will appear here after interview outcomes are recorded</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Candidate</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Position</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Interview Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Interviewer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Decision</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Decision Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{record.name}</p>
                        <p className="text-xs text-gray-400">{record.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{record.position}</td>
                      <td className="px-4 py-3 text-gray-500">{record.department || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {record.interview_date ? new Date(record.interview_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{record.interviewer_name || '—'}</td>
                      <td className="px-4 py-3">
                        <DecisionBadge status={record.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {record.decision_date ? new Date(record.decision_date).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <DecisionModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  );
}
