import { useEffect, useState } from 'react';
import { Briefcase, Plus, Search, Edit2, Power, PowerOff, Copy, X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { getSupabaseAdminClient, JobPosting, JobPostingFormData } from '../lib/supabase';
import { TagInput } from './TagInput';

// Role family options
const ROLE_FAMILIES = [
  'Data Science',
  'Machine Learning',
  'Software Engineering',
  'Data Engineering',
  'DevOps',
  'Product Management',
  'Other',
];

const DEFAULT_FORM_DATA: JobPostingFormData = {
  title: '',
  description: '',
  role_family: '',
  skills: [],
  keywords: [],
  required_education: [],
  expected_projects: [],
  preferred_certifications: [],
  min_years_experience: '',
  max_years_experience: '',
};

// Helper to check if error is due to table not existing
const isTableNotExistError = (error: any): boolean => {
  return error?.code === '42P01' || 
         error?.message?.includes('does not exist') ||
         error?.status === 404;
};

export function AdminJobManagement() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'admin' | 'dataset'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [formData, setFormData] = useState<JobPostingFormData>(DEFAULT_FORM_DATA);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();
      
      const { data, error: fetchError } = await adminClient
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        // Check if table doesn't exist
        if (isTableNotExistError(fetchError)) {
          setError('Database table "job_postings" does not exist. Please run the database migration first.');
          setJobs([]);
          return;
        }
        throw fetchError;
      }
      setJobs(data || []);
    } catch (err) {
      console.error('Error loading jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    // Source filter
    if (filterSource !== 'all' && job.source !== filterSource) return false;
    
    // Active filter
    if (filterActive === 'active' && !job.is_active) return false;
    if (filterActive === 'inactive' && job.is_active) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = job.title.toLowerCase().includes(query);
      const matchesRoleFamily = job.role_family?.toLowerCase().includes(query) ?? false;
      
      // Safely check skills array (might be null or undefined)
      const matchesSkills = Array.isArray(job.skills) && 
        job.skills.some((s: string) => typeof s === 'string' && s.toLowerCase().includes(query));
      
      // Safely check keywords array (might be null or undefined)
      const matchesKeywords = Array.isArray(job.keywords) && 
        job.keywords.some((k: string) => typeof k === 'string' && k.toLowerCase().includes(query));
      
      if (!matchesTitle && !matchesRoleFamily && !matchesSkills && !matchesKeywords) {
        return false;
      }
    }
    
    return true;
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Job title is required';
    }

    if (!formData.role_family) {
      errors.role_family = 'Role family is required';
    }

    const minExp = formData.min_years_experience;
    const maxExp = formData.max_years_experience;

    if (minExp !== '' && maxExp !== '' && Number(minExp) > Number(maxExp)) {
      errors.experience = 'Minimum years cannot be greater than maximum years';
    }

    if (minExp !== '' && (Number(minExp) < 0 || Number(minExp) > 50)) {
      errors.min_years = 'Must be between 0 and 50';
    }

    if (maxExp !== '' && (Number(maxExp) < 0 || Number(maxExp) > 50)) {
      errors.max_years = 'Must be between 0 and 50';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateJob = async () => {
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();

      // Generate a unique job_id
      const jobId = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newJob = {
        job_id: jobId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        role_family: formData.role_family || null,
        skills: formData.skills,
        keywords: formData.keywords,
        required_education: formData.required_education,
        expected_projects: formData.expected_projects,
        preferred_certifications: formData.preferred_certifications,
        min_years_experience: formData.min_years_experience === '' ? null : Number(formData.min_years_experience),
        max_years_experience: formData.max_years_experience === '' ? null : Number(formData.max_years_experience),
        source: 'admin',
        is_active: true,
        deleted_at: null,
      };

      const { error: insertError } = await adminClient
        .from('job_postings')
        .insert(newJob);

      if (insertError) {
        if (isTableNotExistError(insertError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw insertError;
      }

      setIsCreateModalOpen(false);
      setFormData(DEFAULT_FORM_DATA);
      await loadJobs();
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateJob = async () => {
    if (!editingJob || !validateForm()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const updates = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        role_family: formData.role_family || null,
        skills: formData.skills,
        keywords: formData.keywords,
        required_education: formData.required_education,
        expected_projects: formData.expected_projects,
        preferred_certifications: formData.preferred_certifications,
        min_years_experience: formData.min_years_experience === '' ? null : Number(formData.min_years_experience),
        max_years_experience: formData.max_years_experience === '' ? null : Number(formData.max_years_experience),
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await adminClient
        .from('job_postings')
        .update(updates)
        .eq('job_id', editingJob.job_id);

      if (updateError) {
        if (isTableNotExistError(updateError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw updateError;
      }

      setIsEditModalOpen(false);
      setEditingJob(null);
      setFormData(DEFAULT_FORM_DATA);
      await loadJobs();
    } catch (err) {
      console.error('Error updating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (job: JobPosting) => {
    try {
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const updates = {
        is_active: !job.is_active,
        deleted_at: job.is_active ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await adminClient
        .from('job_postings')
        .update(updates)
        .eq('job_id', job.job_id);

      if (updateError) {
        if (isTableNotExistError(updateError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw updateError;
      }

      await loadJobs();
    } catch (err) {
      console.error('Error toggling job status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update job status');
    }
  };

  const handleDuplicateJob = async (job: JobPosting) => {
    try {
      setError(null);
      const adminClient = getSupabaseAdminClient();

      const newJobId = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const duplicatedJob = {
        job_id: newJobId,
        title: `${job.title} (Copy)`,
        description: job.description,
        role_family: job.role_family,
        skills: job.skills,
        keywords: job.keywords,
        required_education: job.required_education,
        expected_projects: job.expected_projects,
        preferred_certifications: job.preferred_certifications,
        min_years_experience: job.min_years_experience,
        max_years_experience: job.max_years_experience,
        source: 'admin',
        is_active: true,
        deleted_at: null,
      };

      const { error: insertError } = await adminClient
        .from('job_postings')
        .insert(duplicatedJob);

      if (insertError) {
        if (isTableNotExistError(insertError)) {
          throw new Error('Database table "job_postings" does not exist. Please run the database migration first.');
        }
        throw insertError;
      }

      await loadJobs();
    } catch (err) {
      console.error('Error duplicating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate job');
    }
  };

  const openEditModal = (job: JobPosting) => {
    setEditingJob(job);
    setFormData({
      title: job.title,
      description: job.description || '',
      role_family: job.role_family || '',
      skills: job.skills,
      keywords: job.keywords,
      required_education: job.required_education,
      expected_projects: job.expected_projects,
      preferred_certifications: job.preferred_certifications,
      min_years_experience: job.min_years_experience ?? '',
      max_years_experience: job.max_years_experience ?? '',
    });
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
    setIsCreateModalOpen(true);
  };

  const closeModals = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingJob(null);
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
  };

  const renderJobForm = (isEdit: boolean) => (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            formErrors.title ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="e.g., Senior Machine Learning Engineer"
        />
        {formErrors.title && (
          <p className="mt-1 text-sm text-red-600">{formErrors.title}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter job description..."
        />
      </div>

      {/* Role Family */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Role Family <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.role_family}
          onChange={(e) => setFormData({ ...formData, role_family: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            formErrors.role_family ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value="">Select a role family...</option>
          {ROLE_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
        {formErrors.role_family && (
          <p className="mt-1 text-sm text-red-600">{formErrors.role_family}</p>
        )}
      </div>

      {/* Experience Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Years of Experience
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <input
              type="number"
              min="0"
              max="50"
              value={formData.min_years_experience}
              onChange={(e) => setFormData({ ...formData, min_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formErrors.min_years || formErrors.experience ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Min"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum</p>
          </div>
          <div>
            <input
              type="number"
              min="0"
              max="50"
              value={formData.max_years_experience}
              onChange={(e) => setFormData({ ...formData, max_years_experience: e.target.value === '' ? '' : Number(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formErrors.max_years || formErrors.experience ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Max"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum</p>
          </div>
        </div>
        {(formErrors.experience || formErrors.min_years || formErrors.max_years) && (
          <p className="mt-1 text-sm text-red-600">
            {formErrors.experience || formErrors.min_years || formErrors.max_years}
          </p>
        )}
      </div>

      {/* Skills */}
      <TagInput
        label="Required Skills"
        tags={formData.skills}
        onChange={(skills) => setFormData({ ...formData, skills })}
        placeholder="e.g., Python, TensorFlow, SQL..."
      />

      {/* Keywords */}
      <TagInput
        label="Keywords"
        tags={formData.keywords}
        onChange={(keywords) => setFormData({ ...formData, keywords })}
        placeholder="e.g., NLP, computer vision, deep learning..."
      />

      {/* Required Education */}
      <TagInput
        label="Required Education"
        tags={formData.required_education}
        onChange={(required_education) => setFormData({ ...formData, required_education })}
        placeholder="e.g., Bachelor's in Computer Science, Master's in Data Science..."
      />

      {/* Expected Projects */}
      <TagInput
        label="Expected Projects"
        tags={formData.expected_projects}
        onChange={(expected_projects) => setFormData({ ...formData, expected_projects })}
        placeholder="e.g., recommendation systems, fraud detection..."
      />

      {/* Preferred Certifications */}
      <TagInput
        label="Preferred Certifications"
        tags={formData.preferred_certifications}
        onChange={(preferred_certifications) => setFormData({ ...formData, preferred_certifications })}
        placeholder="e.g., AWS Certified, Google Cloud Professional..."
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-blue-600" />
            Job Management
          </h1>
          <p className="text-gray-600 mt-1">
            Create, edit, and manage job postings for the recruitment system
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Source Filter */}
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Sources</option>
                <option value="admin">Admin Created</option>
                <option value="dataset">Dataset Imported</option>
              </select>

              {/* Active Filter */}
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Job
            </button>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500">
            Showing {filteredJobs.length} of {jobs.length} jobs
          </div>
        </div>

        {/* Jobs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role Family
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No jobs found matching your criteria
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <>
                      <tr
                        key={job.job_id}
                        className={`hover:bg-gray-50 ${!job.is_active ? 'bg-gray-50' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setExpandedJobId(expandedJobId === job.job_id ? null : job.job_id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {expandedJobId === job.job_id ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <div>
                              <div className={`text-sm font-medium ${job.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                                {job.title}
                              </div>
                              <div className="text-sm text-gray-500">
                                {Array.isArray(job.skills) && job.skills.length > 0 ? (
                                  <>
                                    {job.skills.slice(0, 3).join(', ')}
                                    {job.skills.length > 3 && ` +${job.skills.length - 3} more`}
                                  </>
                                ) : (
                                  '-'
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">{job.role_family || '-'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {job.min_years_experience !== null && job.max_years_experience !== null
                              ? `${job.min_years_experience}-${job.max_years_experience} years`
                              : job.min_years_experience !== null
                              ? `${job.min_years_experience}+ years`
                              : job.max_years_experience !== null
                              ? `Up to ${job.max_years_experience} years`
                              : 'Not specified'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              job.source === 'admin'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {job.source === 'admin' ? 'Admin' : 'Dataset'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleActive(job)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              job.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {job.is_active ? (
                              <>
                                <Power className="w-3 h-3" />
                                Active
                              </>
                            ) : (
                              <>
                                <PowerOff className="w-3 h-3" />
                                Inactive
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(job)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit job"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDuplicateJob(job)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                              title="Duplicate as custom job"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded Details */}
                      {expandedJobId === job.job_id && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {job.description && (
                                <div className="col-span-full">
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Description</h4>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
                                </div>
                              )}
                              
                              {Array.isArray(job.skills) && job.skills.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Skills ({job.skills.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {job.skills.map((skill, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {Array.isArray(job.keywords) && job.keywords.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Keywords ({job.keywords.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {job.keywords.map((keyword, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {Array.isArray(job.required_education) && job.required_education.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Required Education</h4>
                                  <ul className="text-sm text-gray-700 space-y-1">
                                    {job.required_education.map((edu, i) => (
                                      <li key={i}>• {edu}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {Array.isArray(job.expected_projects) && job.expected_projects.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Expected Projects</h4>
                                  <ul className="text-sm text-gray-700 space-y-1">
                                    {job.expected_projects.map((proj, i) => (
                                      <li key={i}>• {proj}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {Array.isArray(job.preferred_certifications) && job.preferred_certifications.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Preferred Certifications</h4>
                                  <ul className="text-sm text-gray-700 space-y-1">
                                    {job.preferred_certifications.map((cert, i) => (
                                      <li key={i}>• {cert}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                              <p>Job ID: {job.job_id}</p>
                              <p>Created: {new Date(job.created_at).toLocaleDateString()}</p>
                              {job.deleted_at && (
                                <p className="text-red-600">Deactivated: {new Date(job.deleted_at).toLocaleDateString()}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Job Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Create New Job</h2>
                <p className="text-blue-100 text-sm">Add a new job posting to the system</p>
              </div>
              <button
                onClick={closeModals}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {renderJobForm(false)}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={closeModals}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {isEditModalOpen && editingJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Edit Job</h2>
                <p className="text-blue-100 text-sm">Update job posting details</p>
              </div>
              <button
                onClick={closeModals}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {renderJobForm(true)}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={closeModals}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateJob}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
