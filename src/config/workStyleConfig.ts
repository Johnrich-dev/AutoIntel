/**
 * Work Style Assessment Configuration
 * 
 * This module contains all configurations for the Work Style Assessment:
 * - Question definitions with updated work-behavior wording
 * - Dimension mapping for each question
 * - Role family profiles with dimension weights
 * - Auto-detection of role family from job title
 * 
 * The system uses keyword matching to automatically detect which role family
 * a job title belongs to, making it easy to extend without code changes.
 */

// Dimension types based on the 15 work-style dimensions
export type WorkStyleDimension = 
  | 'collaboration'
  | 'independence'
  | 'leadership_readiness'
  | 'adaptability'
  | 'attention_to_detail'
  | 'problem_solving'
  | 'communication'
  | 'stress_tolerance'
  | 'feedback_receptiveness'
  | 'ambiguity_tolerance'
  | 'initiative'
  | 'relationship_building'
  | 'learning_orientation'
  | 'conflict_management'
  | 'work_preference_balance';

// Weight levels for job profiles
export type WeightLevel = 'high' | 'medium_high' | 'medium' | 'low_medium' | 'low';

// Numeric weight mapping
export const WEIGHT_VALUES: Record<WeightLevel, number> = {
  high: 1.0,
  medium_high: 0.85,
  medium: 0.7,
  low_medium: 0.55,
  low: 0.4,
};

// Dimension labels for display
export const DIMENSION_LABELS: Record<WorkStyleDimension, string> = {
  collaboration: 'Collaboration',
  independence: 'Independence',
  leadership_readiness: 'Leadership Readiness',
  adaptability: 'Adaptability',
  attention_to_detail: 'Attention to Detail',
  problem_solving: 'Problem Solving',
  communication: 'Communication',
  stress_tolerance: 'Stress Tolerance',
  feedback_receptiveness: 'Feedback Receptiveness',
  ambiguity_tolerance: 'Ambiguity Tolerance',
  initiative: 'Initiative',
  relationship_building: 'Relationship Building',
  learning_orientation: 'Learning Orientation',
  conflict_management: 'Conflict Management',
  work_preference_balance: 'Work Preference Balance',
};

// Question structure with dimension mapping
export interface WorkStyleQuestion {
  id: number;
  text: string;
  dimension: WorkStyleDimension;
}

// Updated questions - work-behavior based wording
export const WORK_STYLE_QUESTIONS: WorkStyleQuestion[] = [
  {
    id: 1,
    text: "I enjoy working in team environments and collaborating with others on shared goals.",
    dimension: 'collaboration',
  },
  {
    id: 2,
    text: "I prefer to work independently and manage my own schedule without much supervision.",
    dimension: 'independence',
  },
  {
    id: 3,
    text: "I am comfortable taking on leadership roles when needed to guide a team toward its goals.",
    dimension: 'leadership_readiness',
  },
  {
    id: 4,
    text: "I adapt quickly to changing priorities and new challenges in my work environment.",
    dimension: 'adaptability',
  },
  {
    id: 5,
    text: "I pay close attention to details and ensure accuracy in my work deliverables.",
    dimension: 'attention_to_detail',
  },
  {
    id: 6,
    text: "I am motivated by complex problems that require creative thinking to solve.",
    dimension: 'problem_solving',
  },
  {
    id: 7,
    text: "I communicate clearly and effectively with team members and stakeholders.",
    dimension: 'communication',
  },
  {
    id: 8,
    text: "I remain calm and focused when working under pressure or tight deadlines.",
    dimension: 'stress_tolerance',
  },
  {
    id: 9,
    text: "I actively seek feedback from others to improve my performance and skills.",
    dimension: 'feedback_receptiveness',
  },
  {
    id: 10,
    text: "I am comfortable with ambiguity and can make decisions even with incomplete information.",
    dimension: 'ambiguity_tolerance',
  },
  {
    id: 11,
    text: "I take initiative and act proactively without waiting for explicit direction.",
    dimension: 'initiative',
  },
  {
    id: 12,
    text: "I prioritize building and maintaining strong professional relationships.",
    dimension: 'relationship_building',
  },
  {
    id: 13,
    text: "I am passionate about continuous learning and developing new skills.",
    dimension: 'learning_orientation',
  },
  {
    id: 14,
    text: "I approach conflicts constructively and work to resolve disagreements professionally.",
    dimension: 'conflict_management',
  },
  {
    id: 15,
    text: "I value maintaining a healthy balance between work responsibilities and personal well-being.",
    dimension: 'work_preference_balance',
  },
];

// Scale labels for the 5-point Likert scale
export const SCALE_LABELS = [
  'Strongly Disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly Agree',
];

// Role family type
export type RoleFamily = 
  | 'development'
  | 'data'
  | 'design'
  | 'security'
  | 'network'
  | 'cloud'
  | 'marketing'
  | 'business'
  | 'qa'
  | 'default';

// Role family profiles with dimension weights
export interface RoleFamilyProfile {
  name: string;
  displayName: string;
  description: string;
  weights: Record<WorkStyleDimension, WeightLevel>;
}

// Role family keyword mapping - EASY TO EXTEND
// Add new keywords here to automatically match new job titles
export const ROLE_FAMILY_KEYWORDS: Record<RoleFamily, string[]> = {
  development: [
    'developer', 'engineer', 'programmer', 'software', 
    '.net', 'python', 'java', 'javascript', 'web', 
    'ios', 'android', 'mobile', 'full stack', 'frontend', 'backend',
    'robotic', 'game', 'ar', 'vr', '.net'
  ],
  data: [
    'data analyst', 'data scientist', 'data engineer', 'ml', 
    'machine learning', 'ai', 'artificial intelligence', 
    'big data', 'analytics'
  ],
  design: [
    'ui', 'ux', 'designer', 'graphic', 'interaction', 
    'visual', 'product designer'
  ],
  security: [
    'security', 'cybersecurity', 'ethical hacker', 'infosec',
    'penetration', 'vulnerability'
  ],
  network: [
    'network', 'noc', 'cisco', 'ccna', 'network analyst',
    'network engineer', 'support engineer'
  ],
  cloud: [
    'cloud', 'aws', 'azure', 'gcp', 'devops', 'sre',
    'site reliability', 'solutions architect'
  ],
  marketing: [
    'marketing', 'seo', 'content', 'copywriter', 'digital',
    'social media', 'brand'
  ],
  business: [
    'business analyst', 'product', 'market research', 
    'consultant', 'management'
  ],
  qa: [
    'qa', 'tester', 'testing', 'sdet', 'quality', 
    'test automation', 'automation test'
  ],
  default: ['default']
};

// Role family profiles
export const ROLE_FAMILY_PROFILES: Record<RoleFamily, RoleFamilyProfile> = {
  development: {
    name: 'development',
    displayName: 'Software Development',
    description: 'Software development and engineering roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium_high',
      leadership_readiness: 'medium',
      adaptability: 'high',
      attention_to_detail: 'high',
      problem_solving: 'high',
      communication: 'medium',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'medium',
      ambiguity_tolerance: 'medium',
      initiative: 'medium_high',
      relationship_building: 'low_medium',
      learning_orientation: 'high',
      conflict_management: 'low_medium',
      work_preference_balance: 'medium',
    },
  },
  data: {
    name: 'data',
    displayName: 'Data & AI',
    description: 'Data analysis, science and AI/ML roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium_high',
      leadership_readiness: 'low_medium',
      adaptability: 'high',
      attention_to_detail: 'high',
      problem_solving: 'high',
      communication: 'medium_high',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'high',
      ambiguity_tolerance: 'medium',
      initiative: 'medium',
      relationship_building: 'low_medium',
      learning_orientation: 'high',
      conflict_management: 'low_medium',
      work_preference_balance: 'medium',
    },
  },
  design: {
    name: 'design',
    displayName: 'Design',
    description: 'UI/UX and graphic design roles',
    weights: {
      collaboration: 'high',
      independence: 'medium',
      leadership_readiness: 'low_medium',
      adaptability: 'high',
      attention_to_detail: 'high',
      problem_solving: 'medium_high',
      communication: 'high',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'high',
      ambiguity_tolerance: 'high',
      initiative: 'medium_high',
      relationship_building: 'medium',
      learning_orientation: 'high',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
  security: {
    name: 'security',
    displayName: 'Cybersecurity',
    description: 'Security and information assurance roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium_high',
      leadership_readiness: 'medium',
      adaptability: 'high',
      attention_to_detail: 'high',
      problem_solving: 'high',
      communication: 'medium',
      stress_tolerance: 'high',
      feedback_receptiveness: 'medium_high',
      ambiguity_tolerance: 'medium_high',
      initiative: 'high',
      relationship_building: 'low_medium',
      learning_orientation: 'high',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
  network: {
    name: 'network',
    displayName: 'Network & Infrastructure',
    description: 'Network and IT infrastructure roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium',
      leadership_readiness: 'low_medium',
      adaptability: 'medium',
      attention_to_detail: 'high',
      problem_solving: 'medium_high',
      communication: 'medium_high',
      stress_tolerance: 'high',
      feedback_receptiveness: 'medium',
      ambiguity_tolerance: 'low_medium',
      initiative: 'medium',
      relationship_building: 'low_medium',
      learning_orientation: 'medium_high',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
  cloud: {
    name: 'cloud',
    displayName: 'Cloud & DevOps',
    description: 'Cloud engineering and DevOps roles',
    weights: {
      collaboration: 'medium_high',
      independence: 'medium_high',
      leadership_readiness: 'medium',
      adaptability: 'high',
      attention_to_detail: 'high',
      problem_solving: 'high',
      communication: 'medium_high',
      stress_tolerance: 'medium_high',
      feedback_receptiveness: 'medium_high',
      ambiguity_tolerance: 'medium',
      initiative: 'high',
      relationship_building: 'low_medium',
      learning_orientation: 'high',
      conflict_management: 'low_medium',
      work_preference_balance: 'medium',
    },
  },
  marketing: {
    name: 'marketing',
    displayName: 'Marketing & Content',
    description: 'Marketing, content and digital media roles',
    weights: {
      collaboration: 'high',
      independence: 'low_medium',
      leadership_readiness: 'low_medium',
      adaptability: 'high',
      attention_to_detail: 'medium_high',
      problem_solving: 'medium',
      communication: 'high',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'high',
      ambiguity_tolerance: 'medium',
      initiative: 'medium_high',
      relationship_building: 'high',
      learning_orientation: 'medium_high',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
  business: {
    name: 'business',
    displayName: 'Business & Product',
    description: 'Business analysis and product roles',
    weights: {
      collaboration: 'high',
      independence: 'medium',
      leadership_readiness: 'medium',
      adaptability: 'high',
      attention_to_detail: 'medium_high',
      problem_solving: 'medium_high',
      communication: 'high',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'high',
      ambiguity_tolerance: 'high',
      initiative: 'medium_high',
      relationship_building: 'high',
      learning_orientation: 'medium_high',
      conflict_management: 'medium_high',
      work_preference_balance: 'medium',
    },
  },
  qa: {
    name: 'qa',
    displayName: 'Quality Assurance',
    description: 'QA, testing and quality roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium',
      leadership_readiness: 'low_medium',
      adaptability: 'medium',
      attention_to_detail: 'high',
      problem_solving: 'medium_high',
      communication: 'medium_high',
      stress_tolerance: 'medium_high',
      feedback_receptiveness: 'high',
      ambiguity_tolerance: 'low_medium',
      initiative: 'medium',
      relationship_building: 'low_medium',
      learning_orientation: 'medium_high',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
  default: {
    name: 'default',
    displayName: 'General',
    description: 'Default profile for unmatched roles',
    weights: {
      collaboration: 'medium',
      independence: 'medium',
      leadership_readiness: 'medium',
      adaptability: 'medium',
      attention_to_detail: 'medium',
      problem_solving: 'medium',
      communication: 'medium',
      stress_tolerance: 'medium',
      feedback_receptiveness: 'medium',
      ambiguity_tolerance: 'medium',
      initiative: 'medium',
      relationship_building: 'medium',
      learning_orientation: 'medium',
      conflict_management: 'medium',
      work_preference_balance: 'medium',
    },
  },
};

// Auto-detect role family from job title
export function detectRoleFamily(jobTitle: string): RoleFamily {
  const titleLower = jobTitle.toLowerCase();
  
  // Check each role family's keywords
  for (const [family, keywords] of Object.entries(ROLE_FAMILY_KEYWORDS)) {
    // Skip the default family in this check
    if (family === 'default') continue;
    
    for (const keyword of keywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return family as RoleFamily;
      }
    }
  }
  
  // Return default if no match
  return 'default';
}

// Get available role families for display
export const AVAILABLE_ROLE_FAMILIES = Object.keys(ROLE_FAMILY_PROFILES)
  .filter(key => key !== 'default')
  .map(key => ({
    key: key as RoleFamily,
    ...ROLE_FAMILY_PROFILES[key as RoleFamily]
  }));

// Answer structure from database
export interface WorkStyleAnswer {
  question: number;
  answer: number;
}

// Dimension scores structure
export interface DimensionScores {
  dimension: WorkStyleDimension;
  score: number;
  rawAnswers: number[];
}

// Work style assessment result
export interface WorkStyleResult {
  dimensionScores: DimensionScores[];
  overallAlignmentScore: number;
  matchedRoleFamily: RoleFamily;
  matchedRoleDisplayName: string;
  strongAreas: WorkStyleDimension[];
  moderateAreas: WorkStyleDimension[];
  developmentAreas: WorkStyleDimension[];
}

// Scoring utility functions
/**
 * Calculate dimension scores from raw answers
 */
export function calculateDimensionScores(answers: WorkStyleAnswer[]): DimensionScores[] {
  const dimensionMap = new Map<WorkStyleDimension, number[]>();
  
  // Initialize dimension map
  WORK_STYLE_QUESTIONS.forEach(q => {
    dimensionMap.set(q.dimension, []);
  });
  
  // Group answers by dimension
  answers.forEach(answer => {
    const question = WORK_STYLE_QUESTIONS.find(q => q.id === answer.question);
    if (question && dimensionMap.has(question.dimension)) {
      dimensionMap.get(question.dimension)!.push(answer.answer);
    }
  });
  
  // Calculate average score per dimension
  const results: DimensionScores[] = [];
  dimensionMap.forEach((rawAnswers, dimension) => {
    const score = rawAnswers.length > 0
      ? rawAnswers.reduce((sum, val) => sum + val, 0) / rawAnswers.length
      : 0;
    results.push({ dimension, score, rawAnswers });
  });
  
  return results;
}

/**
 * Calculate Work Style Alignment Score for a specific role family
 */
export function calculateAlignmentScore(
  dimensionScores: DimensionScores[],
  jobTitle: string
): { score: number; breakdown: Record<string, number>; matchedFamily: RoleFamily } {
  // Auto-detect role family from job title
  const roleFamily = detectRoleFamily(jobTitle);
  const profile = ROLE_FAMILY_PROFILES[roleFamily];
  
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};
  
  dimensionScores.forEach(ds => {
    const weightLevel = profile.weights[ds.dimension];
    const weight = WEIGHT_VALUES[weightLevel];
    
    // Normalize score to 0-100 (since answers are 1-5)
    const normalizedScore = (ds.score / 5) * 100;
    
    weightedSum += normalizedScore * weight;
    totalWeight += weight;
    
    breakdown[ds.dimension] = Math.round(normalizedScore);
  });
  
  const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  
  return { score: finalScore, breakdown, matchedFamily: roleFamily };
}

/**
 * Categorize dimensions into strong, moderate, and development areas
 */
export function categorizeDimensions(dimensionScores: DimensionScores[]): {
  strong: WorkStyleDimension[];
  moderate: WorkStyleDimension[];
  development: WorkStyleDimension[];
} {
  const sorted = [...dimensionScores].sort((a, b) => b.score - a.score);
  
  const strong: WorkStyleDimension[] = [];
  const moderate: WorkStyleDimension[] = [];
  const development: WorkStyleDimension[] = [];
  
  sorted.forEach(ds => {
    const normalizedScore = (ds.score / 5) * 100;
    if (normalizedScore >= 70) {
      strong.push(ds.dimension);
    } else if (normalizedScore >= 50) {
      moderate.push(ds.dimension);
    } else {
      development.push(ds.dimension);
    }
  });
  
  return { strong, moderate, development };
}

/**
 * Get full work style result for a job title
 */
export function getWorkStyleResult(
  answers: WorkStyleAnswer[],
  jobTitle: string
): WorkStyleResult {
  const dimensionScores = calculateDimensionScores(answers);
  const { score, matchedFamily } = calculateAlignmentScore(dimensionScores, jobTitle);
  const categories = categorizeDimensions(dimensionScores);
  const profile = ROLE_FAMILY_PROFILES[matchedFamily];
  
  return {
    dimensionScores,
    overallAlignmentScore: score,
    matchedRoleFamily: matchedFamily,
    matchedRoleDisplayName: profile.displayName,
    strongAreas: categories.strong,
    moderateAreas: categories.moderate,
    developmentAreas: categories.development,
  };
}