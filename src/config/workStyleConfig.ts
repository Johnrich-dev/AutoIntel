/**
 * Work Style Assessment Configuration
 * 
 * This module contains all configurations for the Work Style Assessment:
 * - 20 Question definitions with reverse coding support
 * - Essay question configuration
 * - Dimension mapping for each question
 * - Role family profiles with dimension weights
 * - Auto-detection of role family from job title
 * 
 * Updated for semantic scoring with:
 * - 20 Likert scale questions + 1 essay question
 * - Reverse coding support
 * - Hybrid scoring (embeddings + GPT)
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

// Question structure with dimension mapping and reverse coding
export interface WorkStyleQuestion {
  id: number;
  text: string;
  dimension: WorkStyleDimension;
  isReverseCoded: boolean;
}

// 20 Likert Scale Questions (as specified in requirements)
export const WORK_STYLE_QUESTIONS: WorkStyleQuestion[] = [
  {
    id: 1,
    text: "I work effectively with others to achieve shared goals.",
    dimension: 'collaboration',
    isReverseCoded: false,
  },
  {
    id: 2,
    text: "I find it difficult to collaborate with people who have different working styles.",
    dimension: 'collaboration',
    isReverseCoded: true,
  },
  {
    id: 3,
    text: "I can manage my work responsibilities without constant supervision.",
    dimension: 'independence',
    isReverseCoded: false,
  },
  {
    id: 4,
    text: "I struggle to stay productive when working independently.",
    dimension: 'independence',
    isReverseCoded: true,
  },
  {
    id: 5,
    text: "I am willing to take responsibility when leading tasks or projects.",
    dimension: 'leadership_readiness',
    isReverseCoded: false,
  },
  {
    id: 6,
    text: "I adapt quickly when priorities or requirements change.",
    dimension: 'adaptability',
    isReverseCoded: false,
  },
  {
    id: 7,
    text: "I feel uncomfortable when my work environment changes suddenly.",
    dimension: 'adaptability',
    isReverseCoded: true,
  },
  {
    id: 8,
    text: "I carefully review my work to ensure accuracy.",
    dimension: 'attention_to_detail',
    isReverseCoded: false,
  },
  {
    id: 9,
    text: "I often overlook small details in my work.",
    dimension: 'attention_to_detail',
    isReverseCoded: true,
  },
  {
    id: 10,
    text: "I enjoy solving complex problems that require critical thinking.",
    dimension: 'problem_solving',
    isReverseCoded: false,
  },
  {
    id: 11,
    text: "I clearly express my ideas when communicating with others.",
    dimension: 'communication',
    isReverseCoded: false,
  },
  {
    id: 12,
    text: "I find it hard to explain my thoughts in a clear and structured way.",
    dimension: 'communication',
    isReverseCoded: true,
  },
  {
    id: 13,
    text: "I remain calm and productive under pressure.",
    dimension: 'stress_tolerance',
    isReverseCoded: false,
  },
  {
    id: 14,
    text: "I feel overwhelmed when working under tight deadlines.",
    dimension: 'stress_tolerance',
    isReverseCoded: true,
  },
  {
    id: 15,
    text: "I actively seek feedback to improve my performance.",
    dimension: 'feedback_receptiveness',
    isReverseCoded: false,
  },
  {
    id: 16,
    text: "I can make decisions even when information is incomplete.",
    dimension: 'ambiguity_tolerance',
    isReverseCoded: false,
  },
  {
    id: 17,
    text: "I take initiative without waiting to be told what to do.",
    dimension: 'initiative',
    isReverseCoded: false,
  },
  {
    id: 18,
    text: "I build and maintain positive working relationships with others.",
    dimension: 'relationship_building',
    isReverseCoded: false,
  },
  {
    id: 19,
    text: "I continuously look for opportunities to learn new skills.",
    dimension: 'learning_orientation',
    isReverseCoded: false,
  },
  {
    id: 20,
    text: "I avoid addressing conflicts even when they affect work outcomes.",
    dimension: 'conflict_management',
    isReverseCoded: true,
  },
];

// Essay question configuration
export const ESSAY_QUESTION = {
  id: 21,
  text: "Describe a situation where you faced a challenging work problem or conflict. How did you handle it, and what was the outcome? What did you learn from the experience?",
  dimensions: [
    'problem_solving',
    'communication',
    'conflict_management',
    'stress_tolerance',
    'learning_orientation',
    'initiative',
    'adaptability',
    'relationship_building'
  ] as WorkStyleDimension[]
};

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

// Role family keyword mapping - EASY TO EXTEND
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

// Role family profiles with dimension weights
export interface RoleFamilyProfile {
  name: string;
  displayName: string;
  description: string;
  weights: Record<WorkStyleDimension, WeightLevel>;
}

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
  
  // Collect all matches with their keyword length (longer = more specific = higher priority)
  const matches: Array<{family: string, keywordLength: number}> = [];
  
  for (const [family, keywords] of Object.entries(ROLE_FAMILY_KEYWORDS)) {
    if (family === 'default') continue;
    
    for (const keyword of keywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        matches.push({ family, keywordLength: keyword.length });
      }
    }
  }
  
  // Sort by keyword length (longest first) to prioritize more specific matches
  matches.sort((a, b) => b.keywordLength - a.keywordLength);
  
  // Return the best match if any
  if (matches.length > 0) {
    return matches[0].family as RoleFamily;
  }
  
  return 'default';
}

// Get available role families for display
export const AVAILABLE_ROLE_FAMILIES = Object.keys(ROLE_FAMILY_PROFILES)
  .filter(key => key !== 'default')
  .map(key => ({
    key: key as RoleFamily,
    ...ROLE_FAMILY_PROFILES[key as RoleFamily]
  }));

// Answer structure from database (Likert only)
export interface WorkStyleAnswer {
  question: number;
  answer: number;
}

// Essay answer structure
export interface EssayAnswer {
  question: number;
  essay: string;
}

// Legacy dimension scores (for backward compatibility)
export interface DimensionScores {
  dimension: WorkStyleDimension;
  score: number;
  rawAnswers: number[];
}

// Work style assessment result (legacy format)
export interface WorkStyleResult {
  dimensionScores: DimensionScores[];
  overallAlignmentScore: number;
  matchedRoleFamily: RoleFamily;
  matchedRoleDisplayName: string;
  strongAreas: WorkStyleDimension[];
  moderateAreas: WorkStyleDimension[];
  developmentAreas: WorkStyleDimension[];
}

// Reverse code a Likert answer value
export function reverseCodeAnswer(answer: number): number {
  // 1 -> 5, 2 -> 4, 3 -> 3, 4 -> 2, 5 -> 1
  return 6 - answer;
}

// Process answers with reverse coding
export function processAnswers(answers: WorkStyleAnswer[]): WorkStyleAnswer[] {
  return answers.map(answer => {
    const question = WORK_STYLE_QUESTIONS.find(q => q.id === answer.question);
    if (question?.isReverseCoded) {
      return {
        ...answer,
        answer: reverseCodeAnswer(answer.answer)
      };
    }
    return answer;
  });
}

/**
 * Calculate dimension scores from raw answers (legacy method)
 */
export function calculateDimensionScores(answers: WorkStyleAnswer[]): DimensionScores[] {
  const dimensionMap = new Map<WorkStyleDimension, number[]>();
  
  WORK_STYLE_QUESTIONS.forEach(q => {
    dimensionMap.set(q.dimension, []);
  });
  
  const processedAnswers = processAnswers(answers);
  
  processedAnswers.forEach(answer => {
    const question = WORK_STYLE_QUESTIONS.find(q => q.id === answer.question);
    if (question && dimensionMap.has(question.dimension)) {
      dimensionMap.get(question.dimension)!.push(answer.answer);
    }
  });
  
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
 * Calculate Work Style Alignment Score for a specific role family (legacy method)
 */
export function calculateAlignmentScore(
  dimensionScores: DimensionScores[],
  jobTitle: string
): { score: number; breakdown: Record<string, number>; matchedFamily: RoleFamily } {
  const roleFamily = detectRoleFamily(jobTitle);
  const profile = ROLE_FAMILY_PROFILES[roleFamily];
  
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};
  
  dimensionScores.forEach(ds => {
    const weightLevel = profile.weights[ds.dimension];
    const weight = WEIGHT_VALUES[weightLevel];
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
 * Get full work style result for a job title (legacy method)
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
