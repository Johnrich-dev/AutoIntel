import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle, Sliders, Target, GraduationCap, Briefcase, FolderGit2 } from 'lucide-react';
import { getSupabaseAdminClient, ScoringSettings } from '../lib/supabase';

const DEFAULT_SETTINGS = {
  experience_weight: 40,
  skills_weight: 30,
  education_weight: 20,
  projects_weight: 10,
  qualified_threshold: 80,
  review_threshold: 60,
  baseline_project_score: 2,
};

interface ValidationErrors {
  weights?: string;
  qualified_threshold?: string;
  review_threshold?: string;
  baseline_project_score?: string;
}

// Helper to check if error is due to table not existing
const isTableNotExistError = (error: any): boolean => {
  return error?.code === '42P01' || 
         error?.message?.includes('does not exist') ||
         error?.status === 404;
};

export function AdminScoringSettings() {
  const [settings, setSettings] = useState<ScoringSettings | null>(null);
  const [formValues, setFormValues] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Calculate total weight
  const totalWeight = formValues.experience_weight + formValues.skills_weight + 
                      formValues.education_weight + formValues.projects_weight;

  const validateForm = useCallback((): boolean => {
    const errors: ValidationErrors = {};

    // Validate weights sum to 100
    const weightsSum = formValues.experience_weight + formValues.skills_weight + 
                       formValues.education_weight + formValues.projects_weight;
    if (weightsSum !== 100) {
      errors.weights = `Weights must sum to 100 (currently: ${weightsSum})`;
    }

    // Validate individual weight ranges (0-100)
    const weights = [
      { name: 'Experience', value: formValues.experience_weight },
      { name: 'Skills', value: formValues.skills_weight },
      { name: 'Education', value: formValues.education_weight },
      { name: 'Projects', value: formValues.projects_weight },
    ];

    for (const weight of weights) {
      if (weight.value < 0 || weight.value > 100) {
        errors.weights = `${weight.name} weight must be between 0 and 100`;
        break;
      }
    }

    // Validate qualified_threshold
    if (formValues.qualified_threshold < 0 || formValues.qualified_threshold > 100) {
      errors.qualified_threshold = 'Qualified threshold must be between 0 and 100';
    }

    // Validate review_threshold
    if (formValues.review_threshold < 0 || formValues.review_threshold > 100) {
      errors.review_threshold = 'Review threshold must be between 0 and 100';
    }

    // Validate qualified > review
    if (formValues.qualified_threshold <= formValues.review_threshold) {
      errors.qualified_threshold = 'Qualified threshold must be greater than review threshold';
      errors.review_threshold = 'Review threshold must be less than qualified threshold';
    }

    // Validate baseline_project_score
    if (formValues.baseline_project_score < 0 || formValues.baseline_project_score > 10) {
      errors.baseline_project_score = 'Baseline project score must be between 0 and 10';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formValues]);

  useEffect(() => {
    validateForm();
  }, [formValues, validateForm]);

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
          return;
        }
        throw fetchError;
      }

      if (data) {
        setSettings(data);
        setFormValues({
          experience_weight: data.experience_weight,
          skills_weight: data.skills_weight,
          education_weight: data.education_weight,
          projects_weight: data.projects_weight,
          qualified_threshold: data.qualified_threshold,
          review_threshold: data.review_threshold,
          baseline_project_score: data.baseline_project_score,
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

  const createDefaultSettings = async () => {
    try {
      const adminClient = getSupabaseAdminClient();

      const { data, error: insertError } = await adminClient
        .from('scoring_settings')
        .insert(DEFAULT_SETTINGS)
        .select()
        .single();

      if (insertError) throw insertError;

      setSettings(data);
      setFormValues({
        experience_weight: data.experience_weight,
        skills_weight: data.skills_weight,
        education_weight: data.education_weight,
        projects_weight: data.projects_weight,
        qualified_threshold: data.qualified_threshold,
        review_threshold: data.review_threshold,
        baseline_project_score: data.baseline_project_score,
      });
    } catch (err) {
      console.error('Error creating default settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to create default settings');
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

      if (settings) {
        // Update existing settings
        const { error: updateError } = await adminClient
          .from('scoring_settings')
          .update({
            ...formValues,
            updated_at: new Date().toISOString(),
          })
          .eq('settings_id', settings.settings_id);

        if (updateError) {
          // Check if table doesn't exist
          if (isTableNotExistError(updateError)) {
            throw new Error('Database table "scoring_settings" does not exist. Please run the database migration first.');
          }
          throw updateError;
        }
      } else {
        // Create new settings
        const { error: insertError } = await adminClient
          .from('scoring_settings')
          .insert(formValues);

        if (insertError) {
          // Check if table doesn't exist
          if (isTableNotExistError(insertError)) {
            throw new Error('Database table "scoring_settings" does not exist. Please run the database migration first.');
          }
          throw insertError;
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
        experience_weight: settings.experience_weight,
        skills_weight: settings.skills_weight,
        education_weight: settings.education_weight,
        projects_weight: settings.projects_weight,
        qualified_threshold: settings.qualified_threshold,
        review_threshold: settings.review_threshold,
        baseline_project_score: settings.baseline_project_score,
      });
    } else {
      setFormValues(DEFAULT_SETTINGS);
    }
    setValidationErrors({});
    setError(null);
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
            Configure resume scoring weights and qualification thresholds
          </p>
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

            {/* Project Score Settings */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="w-6 h-6 text-blue-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Project Scoring</h2>
                    <p className="text-sm text-gray-500">Configure project evaluation</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Baseline Project Score
                  <span className="text-gray-400 text-xs ml-2">(Default score for projects, 0-10)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={formValues.baseline_project_score}
                    onChange={(e) => setFormValues({ ...formValues, baseline_project_score: Number(e.target.value) })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                  />
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={formValues.baseline_project_score}
                    onChange={(e) => setFormValues({ ...formValues, baseline_project_score: Number(e.target.value) || 0 })}
                    className={`w-20 px-3 py-2 border rounded-lg text-center font-medium focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
                      validationErrors.baseline_project_score ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {validationErrors.baseline_project_score && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.baseline_project_score}
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
