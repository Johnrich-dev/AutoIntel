import { useState, useEffect, useMemo, useRef } from 'react';
import { useFormatDate } from '../hooks/useFormatDate';
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
  Send,
  RefreshCw,
  Paperclip,
  AlertCircle,
} from 'lucide-react';
import { getSupabaseAdminClient } from '../lib/supabase';
import { FilterDropdown } from './FilterDropdown';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
  interview_date?: string;
  interviewer_name?: string;
  // email tracking
  offer_email_sent?: boolean;
  offer_email_sent_at?: string;
  offer_attachment_url?: string;
  rejection_email_sent?: boolean;
  rejection_email_sent_at?: string;
}

type StatusFilter = 'all' | 'hired' | 'rejected';

// ============================================================================
// Helpers
// ============================================================================

function DecisionBadge({ status }: { status: 'hired' | 'rejected' }) {
  if (status === 'hired') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" /> Hired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
}

function CommStatusBadge({ record }: { record: FinalDecisionRecord }) {
  if (record.status === 'hired') {
    return record.offer_email_sent ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <CheckCircle className="w-3 h-3" /> Offer Sent
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <AlertCircle className="w-3 h-3" /> Offer Not Sent
      </span>
    );
  }
  return record.rejection_email_sent ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
      <CheckCircle className="w-3 h-3" /> Rejection Sent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
      <AlertCircle className="w-3 h-3" /> Rejection Not Sent
    </span>
  );
}

// ============================================================================
// Send Offer Email Modal
// ============================================================================

function OfferEmailModal({
  record,
  onClose,
  onSent,
}: {
  record: FinalDecisionRecord;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState(`Job Offer – ${record.position}`);
  const [body, setBody] = useState(
    `Dear ${record.name},\n\nWe are delighted to offer you the position of ${record.position}${record.department ? ` in the ${record.department} department` : ''}.\n\nPlease review the attached offer letter for full details including compensation, benefits, and start date.\n\nKindly reply to this email to confirm your acceptance or to discuss any questions you may have.\n\nWe look forward to welcoming you to the team.\n\nBest regards,\nAutoIntel Recruitment Team`
  );
  const [cc, setCc] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!file) { setError('Please attach the offer letter before sending.'); return; }
    if (!subject.trim()) { setError('Subject is required.'); return; }
    setError('');
    setSending(true);

    try {
      const adminClient = getSupabaseAdminClient();

      // Upload file to Supabase Storage
      const ext = file.name.split('.').pop();
      const storagePath = `offer-letters/${record.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await adminClient.storage
        .from('applicant-documents')
        .upload(storagePath, file, { upsert: true });

      let attachmentUrl = '';
      if (!uploadError) {
        const { data: urlData } = adminClient.storage
          .from('applicant-documents')
          .getPublicUrl(storagePath);
        attachmentUrl = urlData?.publicUrl || '';
      }

      // Call backend API to send email
      const apiUrl = API_BASE;
      const formData = new FormData();
      formData.append('applicant_name', record.name);
      formData.append('applicant_email', record.email);
      formData.append('job_title', record.position);
      formData.append('department', record.department || '');
      formData.append('email_subject', subject);
      formData.append('email_body', body);
      formData.append('cc', cc);
      formData.append('attachment_url', attachmentUrl);
      formData.append('attachment', file);

      const res = await fetch(`${apiUrl}/api/send-offer-email`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to send email');

      // Update tracking fields
      const now = new Date().toISOString();
      await adminClient
        .from('applicants')
        .update({
          offer_email_sent: true,
          offer_email_sent_at: now,
          offer_attachment_url: attachmentUrl || null,
        })
        .eq('id', record.id);

      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send offer email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-green-600" />
            {record.offer_email_sent ? 'Resend Offer Email' : 'Send Offer Email'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Candidate</p>
              <p className="font-medium text-gray-800">{record.name}</p>
              <p className="text-xs text-gray-400">{record.email}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Position</p>
              <p className="font-medium text-gray-800">{record.position}</p>
              {record.department && <p className="text-xs text-gray-400">{record.department}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Offer Letter Attachment <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-500"
            >
              <Paperclip className="w-4 h-4" />
              {file ? file.name : 'Click to attach offer letter (PDF, DOCX)'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CC (optional)</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Offer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Send Rejection Email Modal
// ============================================================================

function RejectionEmailModal({
  record,
  onClose,
  onSent,
}: {
  record: FinalDecisionRecord;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState(`Application Update – ${record.position}`);
  const [body, setBody] = useState(
    `Dear ${record.name},\n\nThank you for taking the time to interview for the ${record.position} position.\n\nAfter careful consideration, we have decided to move forward with another candidate whose experience more closely aligns with our current needs.\n\nWe appreciate your interest in joining our team and encourage you to apply for future openings that match your qualifications.\n\nWe wish you all the best in your career journey.\n\nBest regards,\nAutoIntel Recruitment Team`
  );
  const [cc, setCc] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!subject.trim()) { setError('Subject is required.'); return; }
    setError('');
    setSending(true);

    try {
      const apiUrl = API_BASE;
      const res = await fetch(`${apiUrl}/api/send-rejection-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicant_name: record.name,
          applicant_email: record.email,
          email_subject: subject,
          email_body: body,
          cc,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to send email');

      const adminClient = getSupabaseAdminClient();
      const now = new Date().toISOString();
      await adminClient
        .from('applicants')
        .update({ rejection_email_sent: true, rejection_email_sent_at: now })
        .eq('id', record.id);

      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send rejection email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-600" />
            {record.rejection_email_sent ? 'Resend Rejection Email' : 'Send Rejection Email'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Candidate</p>
              <p className="font-medium text-gray-800">{record.name}</p>
              <p className="text-xs text-gray-400">{record.email}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Position</p>
              <p className="font-medium text-gray-800">{record.position}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CC (optional)</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Rejection</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Detail + Action Modal
// ============================================================================

function DecisionModal({
  record,
  onClose,
  onOpenOffer,
  onOpenRejection,
  formatDate,
}: {
  record: FinalDecisionRecord;
  onClose: () => void;
  onOpenOffer: () => void;
  onOpenRejection: () => void;
  formatDate: (d: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Decision Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{record.name}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> {record.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 mb-0.5">Position</p>
              <p className="font-medium text-gray-800 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-gray-400" /> {record.position}
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
                  {formatDate(record.interview_date)}
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
                  {formatDate(record.decision_date)}
                </p>
              </div>
            )}
            <div>
              <p className="text-gray-500 mb-0.5">Communication</p>
              <CommStatusBadge record={record} />
            </div>
            {record.status === 'hired' && record.offer_email_sent_at && (
              <div>
                <p className="text-gray-500 mb-0.5">Offer Sent At</p>
                <p className="text-xs text-gray-600">
                  {new Date(record.offer_email_sent_at).toLocaleString()}
                </p>
              </div>
            )}
            {record.status === 'rejected' && record.rejection_email_sent_at && (
              <div>
                <p className="text-gray-500 mb-0.5">Rejection Sent At</p>
                <p className="text-xs text-gray-600">
                  {new Date(record.rejection_email_sent_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
          {record.status === 'hired' && (
            <button
              onClick={() => { onClose(); onOpenOffer(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              {record.offer_email_sent ? 'Resend Offer Email' : 'Send Offer Email'}
            </button>
          )}
          {record.status === 'rejected' && (
            <button
              onClick={() => { onClose(); onOpenRejection(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4" />
              {record.rejection_email_sent ? 'Resend Rejection Email' : 'Send Rejection Email'}
            </button>
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
  const formatDate = useFormatDate();
  const [records, setRecords] = useState<FinalDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<FinalDecisionRecord | null>(null);
  const [offerTarget, setOfferTarget] = useState<FinalDecisionRecord | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<FinalDecisionRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const itemsPerPage = 10;

  useEffect(() => { loadData(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const adminClient = getSupabaseAdminClient();

      const { data: applicantsData } = await adminClient
        .from('applicants')
        .select(`
          id, name, email, position, status, decision_date, created_at,
          offer_email_sent, offer_email_sent_at, offer_attachment_url,
          rejection_email_sent, rejection_email_sent_at
        `)
        .in('status', ['hired', 'rejected'])
        .order('decision_date', { ascending: false, nullsFirst: false });

      if (!applicantsData) { setRecords([]); return; }

      const applicantIds = applicantsData.map((a) => a.id);

      const { data: interviewData } = await adminClient
        .from('scheduled_interviews')
        .select('applicant_id, interview_date, interviewer:interviewer_id(name)')
        .in('applicant_id', applicantIds);

      const positions = [...new Set(applicantsData.map((a) => a.position).filter(Boolean))];
      const { data: jobsData } = await adminClient
        .from('job_postings')
        .select('title, department')
        .in('title', positions);

      const jobMap = new Map<string, string>();
      jobsData?.forEach((j) => { if (j.title) jobMap.set(j.title, j.department || ''); });

      const interviewMap = new Map<string, { interview_date?: string; interviewer_name?: string }>();
      interviewData?.forEach((i) => {
        if (!interviewMap.has(i.applicant_id)) {
          interviewMap.set(i.applicant_id, {
            interview_date: i.interview_date,
            interviewer_name: (i.interviewer as { name?: string })?.name,
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
        interview_date: interviewMap.get(a.id)?.interview_date,
        interviewer_name: interviewMap.get(a.id)?.interviewer_name,
        offer_email_sent: a.offer_email_sent ?? false,
        offer_email_sent_at: a.offer_email_sent_at,
        offer_attachment_url: a.offer_attachment_url,
        rejection_email_sent: a.rejection_email_sent ?? false,
        rejection_email_sent_at: a.rejection_email_sent_at,
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
        if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q) && !r.position.toLowerCase().includes(q)) return false;
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
    const offersSent = records.filter((r) => r.offer_email_sent).length;
    return { total, hired, rejected, offersSent };
  }, [records]);

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Position', 'Department', 'Interview Date', 'Interviewer', 'Decision', 'Decision Date', 'Communication Status'];
    const rows = filtered.map((r) => [
      r.name, r.email, r.position, r.department || '',
      r.interview_date ? formatDate(r.interview_date) : '',
      r.interviewer_name || '',
      r.status,
      r.decision_date ? formatDate(r.decision_date) : '',
      r.status === 'hired' ? (r.offer_email_sent ? 'Offer Sent' : 'Offer Not Sent') : (r.rejection_email_sent ? 'Rejection Sent' : 'Rejection Not Sent'),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'final_decisions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-blue-600" /> Final Decisions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Post-interview outcomes and communication</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Decisions', value: stats.total, icon: Users, color: 'blue' },
          { label: 'Hired', value: stats.hired, icon: CheckCircle, color: 'green' },
          { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'red' },
          { label: 'Offers Sent', value: stats.offersSent, icon: Send, color: 'purple' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-${color}-50 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color}-600`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold text-${color}-700`}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search candidate, email, or position..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full h-10 pl-9 pr-4 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <FilterDropdown
            value={departmentFilter}
            onChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}
            options={departments.map((d) => ({ value: d, label: d === 'all' ? 'All Departments' : d }))}
            width="w-full sm:w-52"
          />
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
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Award className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No final decisions yet</p>
            <p className="text-sm text-gray-400 mt-1">Candidates appear here after interview outcomes are recorded</p>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Communication</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Decision Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
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
                        {record.interview_date ? formatDate(record.interview_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{record.interviewer_name || '—'}</td>
                      <td className="px-4 py-3"><DecisionBadge status={record.status} /></td>
                      <td className="px-4 py-3"><CommStatusBadge record={record} /></td>
                      <td className="px-4 py-3 text-gray-500">
                        {record.decision_date ? formatDate(record.decision_date) : '—'}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {record.status === 'hired' ? (
                          <button
                            onClick={() => setOfferTarget(record)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            {record.offer_email_sent ? 'Resend Offer' : 'Send Offer'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setRejectionTarget(record)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Mail className="w-3 h-3" />
                            {record.rejection_email_sent ? 'Resend' : 'Send Rejection'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${page === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
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

      {/* Modals */}
      {selectedRecord && (
        <DecisionModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onOpenOffer={() => setOfferTarget(selectedRecord)}
          onOpenRejection={() => setRejectionTarget(selectedRecord)}
          formatDate={formatDate}
        />
      )}

      {offerTarget && (
        <OfferEmailModal
          record={offerTarget}
          onClose={() => setOfferTarget(null)}
          onSent={() => {
            setOfferTarget(null);
            showToast(`Offer email sent to ${offerTarget.name}`);
            loadData();
          }}
        />
      )}

      {rejectionTarget && (
        <RejectionEmailModal
          record={rejectionTarget}
          onClose={() => setRejectionTarget(null)}
          onSent={() => {
            setRejectionTarget(null);
            showToast(`Rejection email sent to ${rejectionTarget.name}`);
            loadData();
          }}
        />
      )}
    </div>
  );
}
