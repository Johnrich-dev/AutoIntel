import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle, Sliders, Target, GraduationCap, Briefcase, FolderGit2, Award, BookOpen } from 'lucide-react';
import { getSupabaseAdminClient, ScoringSettings } from '../lib/supabase';

// Default unified scoring settings - used for ALL applicants
// NOTE: The scoring system now uses a single unified profile for all applicants
const DEFAULT_SETTINGS: {
  // Job level is kept for backward compatibility - stored but not used for scoring
  job_level: string;
  experience_weight: number;
  skills_weight: number;
  education_weight: number;
  projects_weight: number;
  traincert_weight: number;
  achievements_weight: number;
  qualified_threshold: number;
  review_threshold: number;
  baseline_experience: number;
  baseline_skills: number;
  baseline_education: number;
  baseline_projects: number;
  baseline_traincert: number;
  baseline_achievements: number;
  scoring_type: 'semantic' | 'hybrid';
} = {
  job_level: 'unified',
  // Unified weights for 6 categories (same for all applicants)
  experience_weight: 28,
  skills_weight: 30,
  education_weight: 18,
  projects_weight: 14,
  traincert_weight: 6,
  achievements_weight: 4,
  // Unified thresholds
  qualified_threshold: 78,
  review_threshold: 65,
  // Baselines for count scoring
  baseline_experience: 2,
  baseline_skills: 10,
  baseline_education: 2,
  baseline_projects: 2,
  baseline_traincert: 2,
  baseline_achievements: 1,
  // Scoring type
  scoring_type: 'hybrid',
};

// Job level presets - KEPT FOR DISPLAY/CATEGORIZATION PURPOSES ONLY
// These are no longer used for scoring calculations
const JOB_LEVEL_PRESETS = {
  fresh_grad: {
    experience_weight: 18,
    skills_weight: 30,
    education_weight: 22,
    projects_weight: 18,
    traincert_weight: 7,
    achievements_weight: 5,
    qualified_threshold: 75,
    review_threshold: 60,
    baseline_experience: 1,
    baseline_skills: 8,
    baseline_education: 2,
    baseline_projects: 2,
    baseline_traincert: 2,
    baseline_achievements: 1,
  },
  entry_level: {
    experience_weight: 28,
    skills_weight: 30,
    education_weight: 18,
    projects_weight: 14,
    traincert_weight: 6,
    achievements_weight: 4,
    qualified_threshold: 78,
    review_threshold: 65,
    baseline_experience: 2,
    baseline_skills: 10,
    baseline_education: 2,
    baseline_projects: 2,
    baseline_traincert: 2,
    baseline_achievements: 1,
  },
  mid_level: {
    experience_weight: 42,
    skills_weight: 28,
    education_weight: 14,
    projects_weight: 8,
    traincert_weight: 5,
    achievements_weight: 3,
    qualified_threshold: 80,
    review_threshold: 68,
    baseline_experience: 4,
    baseline_skills: 12,
    baseline_education: 2,
    baseline_projects: 2,
    baseline_traincert: 2,
    baseline_achievements: 1,
  },
};

interface ValidationErrors {
  weights?: string;
  qualified_threshold?: string;
  review_threshold?: string;
  baseline?: string;
}

// Helper to check if error is due to table not existing
const isTableNotExistError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === '42P01' || 
           (error as { message?: string }).message?.includes('does not exist') ||
           (error as { status?: number }).status === 404;
  }
  return false;
};

export function AdminScoringSettings() {
  const [settings, setSettings] = useState<ScoringSettings | null>(null);
  const [formValues, setFormValues] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Calculate total weight - handle undefined values
  const totalWeight = 
    (formValues.experience_weight || 0) + 
    (formValues.skills_weight || 0) + 
    (formValues.education_weight || 0) + 
    (formValues.projects_weight || 0) +
    (formValues.traincert_weight || 0) + 
    (formValues.achievements_weight || 0);

  const validateForm = useCallback((): boolean => {
    const errors: ValidationErrors = {};

    // Get values with fallback to 0 for undefined
    const expWeight = formValues.experience_weight || 0;
    const skillWeight = formValues.skills_weight || 0;
    const eduWeight = formValues.education_weight || 0;
    const projWeight = formValues.projects_weight || 0;
    const tcWeight = formValues.traincert_weight || 0;
    const achWeight = formValues.achievements_weight || 0;
    const qualThresh = formValues.qualified_threshold || 0;
    const revThresh = formValues.review_threshold || 0;

    // Validate weights sum to 100
    const weightsSum = expWeight + skillWeight + eduWeight + projWeight + tcWeight + achWeight;
    if (weightsSum !== 100) {
      errors.weights = `Weights must sum to 100 (currently: ${weightsSum})`;
    }

    // Validate individual weight ranges (0-100)
    const weights = [
      { name: 'Experience', value: expWeight },
      { name: 'Skills', value: skillWeight },
      { name: 'Education', value: eduWeight },
      { name: 'Projects', value: projWeight },
      { name: 'Trainings & Certs', value: tcWeight },
      { name: 'Achievements', value: achWeight },
    ];

    for (const weight of weights) {
      if (weight.value < 0 || weight.value > 100) {
        errors.weights = `${weight.name} weight must be between 0 and 100`;
        break;
      }
    }

    // Validate qualified_threshold
    if (qualThresh < 0 || qualThresh > 100) {
      errors.qualified_threshold = 'Qualified threshold must be between 0 and 100';
    }

    // Validate review_threshold
    if (revThresh < 0 || revThresh > 100) {
      errors.review_threshold = 'Review threshold must be between 0 and 100';
    }

    // Validate qualified > review
    if (qualThresh <= revThresh) {
      errors.qualified_threshold = 'Qualified threshold must be greater than review threshold';
      errors.review_threshold = 'Review threshold must be less than qualified threshold';
    }

    // Validate baselines
    const baselines = [
      formValues.baseline_experience,
      formValues.baseline_skills,
      formValues.baseline_education,
      formValues.baseline_projects,
      formValues.baseline_traincert,
      formValues.baseline_achievements,
    ];
    if (baselines.some(b => (b || 0) < 0 || (b || 0) > 100)) {
      errors.baseline = 'All baselines must be between 0 and 100';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formValues]);

  useEffect(() => {
    // Skip validation while loading initial data
    if (!loading) {
      validateForm();
    }
  }, [formValues, validateForm, loading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const adminClient = getSupabaseAdminClient();

      // Try to fetch existing settings
      const { data, error: fetchError } = await adminClient
        .from('scoring_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        // Check if error is due to table not existing
        if (isTableNotExistError(fetchError)) {
          console.warn('scoring_settings table does not exist, using defaults');
          // Use default values without showing error
          setSettings(null);
          setFormValues(DEFAULT_SETTINGS);
          setLoading(false);
          return;
        }
        throw fetchError;
      }

      if (data) {
        setSettings(data);
        setFormValues({
          job_level: data.job_level || 'entry_level',
          experience_weight: data.experience_weight ?? 28,
          skills_weight: data.skills_weight ?? 30,
          education_weight: data.education_weight ?? 18,
          projects_weight: data.projects_weight ?? 14,
          traincert_weight: data.traincert_weight ?? 6,
          achievements_weight: data.achievements_weight ?? 4,
          qualified_threshold: data.qualified_threshold ?? 78,
          review_threshold: data.review_threshold ?? 65,
          baseline_experience: data.baseline_experience ?? 2,
          baseline_skills: data.baseline_skills ?? 10,
          baseline_education: data.baseline_education ?? 2,
          baseline_projects: data.baseline_projects ?? 2,
          baseline_traincert: data.baseline_traincert ?? 2,
          baseline_achievements: data.baseline_achievements ?? 1,
          scoring_type: data.scoring_type ?? 'hybrid',
        });
      } else {
        // No settings row exists, use defaults
        setSettings(null);
        setFormValues(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scoring settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);
      const adminClient = getSupabaseAdminClient();

      // Simplified save data for unified scoring
      // Only use base columns - not level-specific columns
      const saveData = {
        job_level: 'unified',
        // Base weights
        experience_weight: formValues.experience_weight,
        skills_weight: formValues.skills_weight,
        education_weight: formValues.education_weight,
        projects_weight: formValues.projects_weight,
        traincert_weight: formValues.traincert_weight,
        achievements_weight: formValues.achievements_weight,
        // Base thresholds
        qualified_threshold: formValues.qualified_threshold,
        review_threshold: formValues.review_threshold,
        // Baselines
        baseline_experience: formValues.baseline_experience,
        baseline_skills: formValues.baseline_skills,
        baseline_education: formValues.baseline_education,
        baseline_projects: formValues.baseline_projects,
        baseline_traincert: formValues.baseline_traincert,
        baseline_achievements: formValues.baseline_achievements,
        scoring_type: 'hybrid',
      };

      if (settings) {
        // Update existing settings
        const { error: updateError } = await adminClient
          .from('scoring_settings')
          .update(saveData)
          .eq('settings_id', settings.settings_id);

        if (updateError) {
          // Check if error is column does not exist
          if (updateError.message?.includes('column') || updateError.code === '42703') {
            throw new Error(`Database column missing: ${updateError.message}. Please run the migration add_hybrid_scoring_columns.sql in Supabase.`);
          }
          if (isTableNotExistError(updateError)) {
            throw new Error('Database table "scoring_settings" does not exist. Please run the database migration first.');
          }
          throw new Error(`Update failed: ${updateError.message}`);
        }
      } else {
        // Create new settings
        const { error: insertError } = await adminClient
          .from('scoring_settings')
          .insert(saveData);

        if (insertError) {
          // Check if error is column does not exist
          if (insertError.message?.includes('column') || insertError.code === '42703') {
            throw new Error(`Database column missing: ${insertError.message}. Please run the migration add_hybrid_scoring_columns.sql in Supabase.`);
          }
          if (isTableNotExistError(insertError)) {
            throw new Error('Database table "scoring_settings" does not exist. Please run the database migration first.');
          }
          throw new Error(`Insert failed: ${insertError.message}`);
        }
      }

      setSaveSuccess(true);
      await loadSettings();
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormValues({
        job_level: settings.job_level || 'entry_level',
        experience_weight: settings.experience_weight || 28,
        skills_weight: settings.skills_weight || 30,
        education_weight: settings.education_weight || 18,
        projects_weight: settings.projects_weight || 14,
        traincert_weight: settings.traincert_weight || 6,
        achievements_weight: settings.achievements_weight || 4,
        qualified_threshold: settings.qualified_threshold || 78,
        review_threshold: settings.review_threshold || 65,
        baseline_experience: settings.baseline_experience || 2,
        baseline_skills: settings.baseline_skills || 10,
        baseline_education: settings.baseline_education || 2,
        baseline_projects: settings.baseline_projects || 2,
        baseline_traincert: settings.baseline_traincert || 2,
        baseline_achievements: settings.baseline_achievements || 1,
        scoring_type: settings.scoring_type || 'hybrid',
      });
    } else {
      setFormValues(DEFAULT_SETTINGS);
    }
    setValidationErrors({});
    setError(null);
  };

  const applyJobLevelPreset = (level: 'fresh_grad' | 'entry_level' | 'mid_level') => {
    // First check if there are saved values in the separate columns for this job level
    const qualifiedKey = `${level}_qualified_threshold`;
    const reviewKey = `${level}_review_threshold`;
    const weightsKey = `${level}_weights`;
    
    // Check if saved values exist in the new column structure
    const savedQualifiedThreshold = settings?.[qualifiedKey as keyof typeof settings] as number | undefined;
    const savedReviewThreshold = settings?.[reviewKey as keyof typeof settings] as number | undefined;
    const savedWeights = settings?.[weightsKey as keyof typeof settings] as Record<string, number> | undefined;
    
    // If there's saved data for this job level, use those values
    if (savedQualifiedThreshold !== undefined || savedWeights) {
      console.log(`[applyJobLevelPreset] Using saved values for ${level}:`, { savedQualifiedThreshold, savedReviewThreshold, savedWeights });
      setFormValues({
        ...formValues,
        job_level: level,
        experience_weight: savedWeights?.experience_weight ?? JOB_LEVEL_PRESETS[level].experience_weight,
        skills_weight: savedWeights?.skills_weight ?? JOB_LEVEL_PRESETS[level].skills_weight,
        education_weight: savedWeights?.education_weight ?? JOB_LEVEL_PRESETS[level].education_weight,
        projects_weight: savedWeights?.projects_weight ?? JOB_LEVEL_PRESETS[level].projects_weight,
        traincert_weight: savedWeights?.traincert_weight ?? JOB_LEVEL_PRESETS[level].traincert_weight,
        achievements_weight: savedWeights?.achievements_weight ?? JOB_LEVEL_PRESETS[level].achievements_weight,
        qualified_threshold: savedQualifiedThreshold ?? JOB_LEVEL_PRESETS[level].qualified_threshold,
        review_threshold: savedReviewThreshold ?? JOB_LEVEL_PRESETS[level].review_threshold,
        baseline_experience: savedWeights?.baseline_experience ?? JOB_LEVEL_PRESETS[level].baseline_experience,
        baseline_skills: savedWeights?.baseline_skills ?? JOB_LEVEL_PRESETS[level].baseline_skills,
        baseline_education: savedWeights?.baseline_education ?? JOB_LEVEL_PRESETS[level].baseline_education,
        baseline_projects: savedWeights?.baseline_projects ?? JOB_LEVEL_PRESETS[level].baseline_projects,
        baseline_traincert: savedWeights?.baseline_traincert ?? JOB_LEVEL_PRESETS[level].baseline_traincert,
        baseline_achievements: savedWeights?.baseline_achievements ?? JOB_LEVEL_PRESETS[level].baseline_achievements,
      });
    } else {
      // No saved preset, use the hardcoded JOB_LEVEL_PRESETS
      const preset = JOB_LEVEL_PRESETS[level];
      console.log(`[applyJobLevelPreset] Using default preset for ${level}:`, preset);
      setFormValues({
        ...formValues,
        job_level: level,
        experience_weight: preset.experience_weight,
        skills_weight: preset.skills_weight,
        education_weight: preset.education_weight,
        projects_weight: preset.projects_weight,
        traincert_weight: preset.traincert_weight,
        achievements_weight: preset.achievements_weight,
        qualified_threshold: preset.qualified_threshold,
        review_threshold: preset.review_threshold,
        baseline_experience: preset.baseline_experience,
        baseline_skills: preset.baseline_skills,
        baseline_education: preset.baseline_education,
        baseline_projects: preset.baseline_projects,
        baseline_traincert: preset.baseline_traincert,
        baseline_achievements: preset.baseline_achievements,
      });
    }
  };

  const handleResetToDefaults = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      setFormValues(DEFAULT_SETTINGS);
      // Clear validation errors since defaults are valid
      setValidationErrors({});
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading scoring settings...</div>
      </div>
    );
  }

  const WeightInput = ({ 
    label, 
    icon: Icon, 
    value, 
    onChange, 
    color 
  }: { 
    label: string; 
    icon: React.ElementType; 
    value: number; 
    onChange: (value: number) => void;
    color: string;
  }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <label className="font-medium text-gray-900">{label}</label>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <input
          type="number"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-gray-500 font-medium">%</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            Scoring Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure unified scoring weights and thresholds for all applicants
          </p>
          
          {/* Unified Scoring Notice */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-800 font-medium">
              <Target className="w-5 h-5" />
              Unified Scoring - Same for All Applicants
            </div>

          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Success Message */}
        {saveSuccess && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Settings saved successfully!
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weight Configuration */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <Sliders className="w-6 h-6 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Scoring Weights</h2>
                  <p className="text-sm text-gray-500">How much each factor contributes to the final score</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <WeightInput
                label="Experience Weight"
                icon={Briefcase}
                value={formValues.experience_weight}
                onChange={(value) => setFormValues({ ...formValues, experience_weight: value })}
                color="bg-blue-600"
              />
              
              <WeightInput
                label="Skills Weight"
                icon={Target}
                value={formValues.skills_weight}
                onChange={(value) => setFormValues({ ...formValues, skills_weight: value })}
                color="bg-green-600"
              />
              
              <WeightInput
                label="Education Weight"
                icon={GraduationCap}
                value={formValues.education_weight}
                onChange={(value) => setFormValues({ ...formValues, education_weight: value })}
                color="bg-purple-600"
              />
              
              <WeightInput
                label="Projects Weight"
                icon={FolderGit2}
                value={formValues.projects_weight}
                onChange={(value) => setFormValues({ ...formValues, projects_weight: value })}
                color="bg-orange-600"
              />
              
              <WeightInput
                label="Trainings & Certifications Weight"
                icon={BookOpen}
                value={formValues.traincert_weight}
                onChange={(value) => setFormValues({ ...formValues, traincert_weight: value })}
                color="bg-teal-600"
              />
              
              <WeightInput
                label="Achievements Weight"
                icon={Award}
                value={formValues.achievements_weight}
                onChange={(value) => setFormValues({ ...formValues, achievements_weight: value })}
                color="bg-yellow-600"
              />

              {/* Total Weight Indicator */}
              <div className={`p-4 rounded-lg border-2 ${
                totalWeight === 100 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">Total Weight:</span>
                  <span className={`text-2xl font-bold ${
                    totalWeight === 100 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {totalWeight}%
                  </span>
                </div>
                {validationErrors.weights && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.weights}
                  </p>
                )}
                {totalWeight === 100 && (
                  <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Weights are properly balanced
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Threshold Configuration */}
          <div className="space-y-6">
            {/* Score Thresholds */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <Target className="w-6 h-6 text-blue-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Score Thresholds</h2>
                    <p className="text-sm text-gray-500">Define qualification criteria</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Qualified Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Qualified Threshold
                    <span className="text-gray-400 text-xs ml-2">(Minimum score to be considered qualified)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formValues.qualified_threshold}
                      onChange={(e) => setFormValues({ ...formValues, qualified_threshold: Number(e.target.value) })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formValues.qualified_threshold}
                      onChange={(e) => setFormValues({ ...formValues, qualified_threshold: Number(e.target.value) || 0 })}
                      className={`w-20 px-3 py-2 border rounded-lg text-center font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                        validationErrors.qualified_threshold ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <span className="text-gray-500 font-medium">%</span>
                  </div>
                  {validationErrors.qualified_threshold && (
                    <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.qualified_threshold}
                    </p>
                  )}
                </div>

                {/* Review Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Review Threshold
                    <span className="text-gray-400 text-xs ml-2">(Minimum score for manual review)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formValues.review_threshold}
                      onChange={(e) => setFormValues({ ...formValues, review_threshold: Number(e.target.value) })}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-yellow-600"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formValues.review_threshold}
                      onChange={(e) => setFormValues({ ...formValues, review_threshold: Number(e.target.value) || 0 })}
                      className={`w-20 px-3 py-2 border rounded-lg text-center font-medium focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 ${
                        validationErrors.review_threshold ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <span className="text-gray-500 font-medium">%</span>
                  </div>
                  {validationErrors.review_threshold && (
                    <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.review_threshold}
                    </p>
                  )}
                </div>

                {/* Threshold Visualization */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Threshold Visualization</h4>
                  <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                    {/* Rejected zone */}
                    <div 
                      className="absolute left-0 h-full bg-red-400"
                      style={{ width: `${formValues.review_threshold}%` }}
                    />
                    {/* Review zone */}
                    <div 
                      className="absolute h-full bg-yellow-400"
                      style={{ 
                        left: `${formValues.review_threshold}%`, 
                        width: `${formValues.qualified_threshold - formValues.review_threshold}%` 
                      }}
                    />
                    {/* Qualified zone */}
                    <div 
                      className="absolute right-0 h-full bg-green-400"
                      style={{ width: `${100 - formValues.qualified_threshold}%` }}
                    />
                    
                    {/* Labels */}
                    <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-medium text-gray-700">
                      <span>Rejected</span>
                      <span>Review</span>
                      <span>Qualified</span>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>0%</span>
                    <span>{formValues.review_threshold}%</span>
                    <span>{formValues.qualified_threshold}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Baseline Settings for Count Scoring */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="w-6 h-6 text-blue-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Count Baselines</h2>
                    <p className="text-sm text-gray-500">Minimum counts for full score in each category</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Experience Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Experience Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={formValues.baseline_experience}
                      onChange={(e) => setFormValues({ ...formValues, baseline_experience: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-gray-500 text-sm">experiences needed for 100%</span>
                  </div>
                </div>

                {/* Skills Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Skills Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={formValues.baseline_skills}
                      onChange={(e) => setFormValues({ ...formValues, baseline_skills: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <span className="text-gray-500 text-sm">skills needed for 100%</span>
                  </div>
                </div>

                {/* Education Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Education Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={formValues.baseline_education}
                      onChange={(e) => setFormValues({ ...formValues, baseline_education: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <span className="text-gray-500 text-sm">educations needed for 100%</span>
                  </div>
                </div>

                {/* Projects Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Projects Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={formValues.baseline_projects}
                      onChange={(e) => setFormValues({ ...formValues, baseline_projects: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <span className="text-gray-500 text-sm">projects needed for 100%</span>
                  </div>
                </div>

                {/* Training/Cert Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trainings & Certifications Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={formValues.baseline_traincert}
                      onChange={(e) => setFormValues({ ...formValues, baseline_traincert: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <span className="text-gray-500 text-sm">trainings/certs needed for 100%</span>
                  </div>
                </div>

                {/* Achievements Baseline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Achievements Baseline
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={formValues.baseline_achievements}
                      onChange={(e) => setFormValues({ ...formValues, baseline_achievements: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    />
                    <span className="text-gray-500 text-sm">achievements needed for 100%</span>
                  </div>
                </div>

                {validationErrors.baseline && (
                  <p className="text-red-600 text-sm flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.baseline}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-end">
          <button
            onClick={handleResetToDefaults}
            className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(validationErrors).length > 0}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>

        {/* Last Updated Info */}
        {settings?.updated_at && (
          <div className="mt-4 text-right text-sm text-gray-500">
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
