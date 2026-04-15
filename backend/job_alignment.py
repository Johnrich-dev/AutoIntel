#!/usr/bin/env python3
"""
Job Alignment Module for AutoIntel
Implements BERT-based semantic matching using all-MiniLM-L6-v2
for resume-to-job fit scoring and job recommendations.

Stage 2: Core Semantic Functions
- Enhanced similarity calculation with preprocessing and confidence
- Structured job fit scoring with breakdown and metrics
- Job recommendations from Supabase database
"""

import os
import sys
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Model configuration
MODEL_NAME = "all-MiniLM-L6-v2"  # ~80MB, BERT-distilled, 384-dimensional embeddings
DEVICE = os.getenv("MODEL_DEVICE", "cpu")  # Use "cuda" if GPU available
MAX_TEXT_LENGTH = 10000  # Maximum characters to process

# Default scoring weights for count-based calculation
DEFAULT_COUNT_WEIGHTS = {
    'skills_weight': 30,
    'experience_weight': 40,
    'education_weight': 20,
    'projects_weight': 10
}

# Default 6-category weights for hybrid scoring (UNIFIED - used for all applicants)
DEFAULT_HYBRID_WEIGHTS = {
    'experience_weight': 30,
    'skills_weight': 30,
    'education_weight': 20,
    'projects_weight': 10,
    'traincert_weight': 10
}

# Default baselines for hybrid scoring (UNIFIED - used for all applicants)
# Note: baseline_experience is intentionally excluded — experience is evaluated
# from the job posting's min_years_experience field directly.
DEFAULT_HYBRID_BASELINES = {
    'baseline_skills': 10,
    'baseline_education': 2,
    'baseline_projects': 2,
    'baseline_traincert': 2,
}

# Unified scoring profile - used for ALL applicants (no special treatment)
# These are the fallback defaults when the database is unavailable.
# The actual thresholds/weights are loaded from the scoring_settings table at runtime.
UNIFIED_SCORING_PROFILE = {
    'weights': DEFAULT_HYBRID_WEIGHTS.copy(),
    'baselines': DEFAULT_HYBRID_BASELINES.copy(),
    'thresholds': {
        'qualified_threshold': 65,
        'review_threshold': 55
    }
}

# Model cache
_model = None

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_model():
    """
    Load the sentence transformer model (cached singleton).
    First run will download ~80MB model files.
    """
    global _model
    if _model is None:
        print(f"Loading sentence transformer model: {MODEL_NAME}...")
        print("(First run will download ~80MB model files)")
        
        try:
            from sentence_transformers import SentenceTransformer
            
            _model = SentenceTransformer(MODEL_NAME, device=DEVICE)
            print(f"[OK] Model loaded successfully on {DEVICE}!")
            print(f"  Embedding dimensions: {_model.get_sentence_embedding_dimension()}")
            
        except ImportError as e:
            print(f"ERROR: Missing sentence-transformers library: {e}")
            print("Run: pip install sentence-transformers>=2.2.0")
            raise
        except Exception as e:
            print(f"ERROR loading model: {str(e)}")
            raise
    
    return _model


def preprocess_text(text: str) -> str:
    """
    Preprocess text for better similarity matching.
    
    Args:
        text: Raw input text
        
    Returns:
        Preprocessed text (lowercased, trimmed, normalized whitespace)
    """
    if not text:
        return ""
    
    # Convert to lowercase
    text = text.lower()
    
    # Trim leading/trailing whitespace
    text = text.strip()
    
    # Normalize whitespace (replace multiple spaces with single space)
    text = re.sub(r'\s+', ' ', text)
    
    return text


def truncate_text(text: str, max_length: int = MAX_TEXT_LENGTH) -> str:
    """
    Truncate text to maximum length to avoid model issues.
    
    Args:
        text: Input text
        max_length: Maximum character length
        
    Returns:
        Truncated text
    """
    if not text:
        return ""
    
    if len(text) > max_length:
        # Try to truncate at a sentence boundary
        truncated = text[:max_length]
        last_period = truncated.rfind('.')
        last_comma = truncated.rfind(',')
        last_space = truncated.rfind(' ')
        
        # Find the best break point
        break_point = max(last_period, last_comma, last_space)
        if break_point > max_length * 0.8:  # At least 80% of max length
            return truncated[:break_point + 1]
        else:
            return truncated + "..."
    
    return text


def encode_text(text: str) -> Any:
    """
    Encode text into embeddings using the loaded model.
    
    Args:
        text: Input text (resume or job description)
        
    Returns:
        Embedding vector (384-dimensional for all-MiniLM-L6-v2)
    """
    if not text or not text.strip():
        # Return zero vector for empty text
        import numpy as np
        return np.zeros(384)
    
    # Truncate very long text
    text = truncate_text(text)
    
    model = get_model()
    return model.encode(text, convert_to_tensor=False, show_progress_bar=False)


def calculate_embedding_confidence(embedding1: Any, embedding2: Any) -> float:
    """
    Calculate confidence level based on embedding quality.
    
    Args:
        embedding1: First text embedding
        embedding2: Second text embedding
        
    Returns:
        Confidence score between 0.0 and 1.0
    """
    import numpy as np
    
    # Flatten embeddings if needed
    emb1 = embedding1.flatten() if embedding1.ndim > 1 else embedding1
    emb2 = embedding2.flatten() if embedding2.ndim > 1 else embedding2
    
    # Calculate embedding norms (magnitude)
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    
    # Zero vectors indicate empty/invalid text
    if norm1 < 0.01 or norm2 < 0.01:
        return 0.0
    
    # Calculate cosine similarity
    cosine_sim = np.dot(emb1, emb2) / (norm1 * norm2)
    
    # Normalize to 0-1 range
    cosine_sim = max(-1.0, min(1.0, cosine_sim))
    
    # Convert to confidence (higher similarity = higher confidence)
    # Use absolute value for similarity magnitude
    confidence = abs(cosine_sim)
    
    # Adjust confidence based on embedding strength
    # Stronger embeddings (higher norms) get a slight boost
    avg_norm = (norm1 + norm2) / 2
    norm_factor = min(1.0, avg_norm / 10.0)  # Normalize assuming avg norm ~10
    
    confidence = confidence * 0.8 + norm_factor * 0.2
    
    return round(confidence, 4)


def calculate_semantic_similarity(text1: str, text2: str) -> Dict[str, Any]:
    """
    Calculate cosine similarity between two texts with preprocessing and confidence.
    
    Args:
        text1: First text (e.g., resume)
        text2: Second text (e.g., job description)
        
    Returns:
        Dictionary with similarity score and confidence level
    """
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np
    
    # Handle edge cases: empty text
    if not text1 or not text1.strip():
        return {
            "similarity": 0.0,
            "confidence": 0.0,
            "status": "error",
            "message": "First text is empty"
        }
    
    if not text2 or not text2.strip():
        return {
            "similarity": 0.0,
            "confidence": 0.0,
            "status": "error",
            "message": "Second text is empty"
        }
    
    # Preprocess texts
    text1_processed = preprocess_text(text1)
    text2_processed = preprocess_text(text2)
    
    # Handle edge case: very short text after preprocessing
    if len(text1_processed) < 5 or len(text2_processed) < 5:
        return {
            "similarity": 0.0,
            "confidence": 0.0,
            "status": "warning",
            "message": "Text too short for reliable matching"
        }
    
    # Get embeddings
    emb1 = encode_text(text1_processed)
    emb2 = encode_text(text2_processed)
    
    # Check for zero vectors
    if np.sum(emb1) == 0 or np.sum(emb2) == 0:
        return {
            "similarity": 0.0,
            "confidence": 0.0,
            "status": "error",
            "message": "Could not encode text properly"
        }
    
    # Reshape for sklearn
    emb1 = emb1.reshape(1, -1)
    emb2 = emb2.reshape(1, -1)
    
    # Calculate cosine similarity
    similarity = cosine_similarity(emb1, emb2)[0][0]
    
    # Ensure bounds [0, 1]
    similarity = float(max(0.0, min(1.0, similarity)))
    
    # Calculate confidence
    # Use original embeddings (not reshaped) for confidence calculation
    emb1_original = encode_text(text1_processed)
    emb2_original = encode_text(text2_processed)
    confidence = calculate_embedding_confidence(emb1_original, emb2_original)
    
    return {
        "similarity": round(similarity, 4),
        "confidence": confidence,
        "status": "success",
        "message": "Similarity calculated successfully"
    }


def calculate_job_fit_score(
    resume_text: str,
    job_description: str,
    job_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate job fit score between resume and job description.
    
    Args:
        resume_text: Parsed resume text
        job_description: Job description text
        job_id: Optional job ID for tracking
        
    Returns:
        Dictionary with structured score breakdown and confidence metrics
    """
    # Get semantic similarity result
    similarity_result = calculate_semantic_similarity(resume_text, job_description)
    
    # Extract similarity value
    similarity = similarity_result.get("similarity", 0.0)
    confidence = similarity_result.get("confidence", 0.0)
    
    # Convert to 0-100 scale
    score_100 = round(similarity * 100, 2)
    
    # Determine fit category
    if score_100 >= 80:
        fit_category = "Excellent Fit"
    elif score_100 >= 60:
        fit_category = "Good Fit"
    elif score_100 >= 40:
        fit_category = "Moderate Fit"
    else:
        fit_category = "Low Fit"
    
    # Calculate confidence level label
    if confidence >= 0.9:
        confidence_label = "Very High"
    elif confidence >= 0.7:
        confidence_label = "High"
    elif confidence >= 0.5:
        confidence_label = "Medium"
    elif confidence >= 0.3:
        confidence_label = "Low"
    else:
        confidence_label = "Very Low"
    
    # Calculate text length metrics
    resume_length = len(resume_text) if resume_text else 0
    job_desc_length = len(job_description) if job_description else 0
    
    # Determine score quality based on text lengths
    if resume_length < 100 or job_desc_length < 100:
        score_quality = "Low - Short text may reduce accuracy"
    elif resume_length > 5000 and job_desc_length > 2000:
        score_quality = "High - Sufficient content for matching"
    else:
        score_quality = "Medium - Consider adding more details"
    
    return {
        "job_id": job_id,
        "semantic_score": score_100,  # 0-100
        "raw_similarity": similarity,  # 0.0-1.0
        "fit_category": fit_category,
        "confidence": confidence,
        "confidence_label": confidence_label,
        "score_quality": score_quality,
        "text_lengths": {
            "resume_length": resume_length,
            "job_description_length": job_desc_length
        },
        "status": similarity_result.get("status", "unknown"),
        "message": similarity_result.get("message", "")
    }


def extract_experience_text(experience_list: List[Dict]) -> str:
    """
    Combine experience entries into searchable text for semantic matching.
    
    Args:
        experience_list: List of experience dictionaries from parsed resume
    
    Returns:
        Combined text representation of experience
    """
    if not experience_list:
        return ""
    
    texts = []
    for exp in experience_list:
        parts = []
        if exp.get('role'):
            parts.append(str(exp['role']))
        if exp.get('company'):
            parts.append(str(exp['company']))
        if exp.get('years'):
            parts.append(str(exp['years']) + " years")
        # 'summary' = resume_parser (BERT) output key
        if exp.get('summary'):
            parts.append(str(exp['summary']))
        # 'description' / 'bullets' = GPT extractor output keys
        if exp.get('description'):
            parts.append(str(exp['description']))
        bullets = exp.get('bullets') or exp.get('responsibilities') or []
        if isinstance(bullets, list):
            parts.extend(str(b) for b in bullets if b)
        elif isinstance(bullets, str) and bullets:
            parts.append(bullets)
        if parts:
            texts.append(" ".join(parts))
    
    return " ".join(texts)


def extract_skills_text(skills_dict: Dict) -> str:
    """
    Combine all skills into searchable text for semantic matching.
    
    Args:
        skills_dict: Dictionary with hard_skills, soft_skills, all
    
    Returns:
        Combined text representation of skills
    """
    if not skills_dict:
        return ""
    
    all_skills = []
    if isinstance(skills_dict, dict):
        all_skills = skills_dict.get('hard_skills', []) + skills_dict.get('soft_skills', [])
        if skills_dict.get('all'):
            all_skills = skills_dict['all']
    elif isinstance(skills_dict, list):
        all_skills = skills_dict
    
    # Convert to string
    return " ".join(str(s) for s in all_skills if s)


def extract_education_text(education_list: List[Dict]) -> str:
    """
    Combine education entries into searchable text for semantic matching.
    
    Args:
        education_list: List of education dictionaries from parsed resume
    
    Returns:
        Combined text representation of education
    """
    if not education_list:
        return ""
    
    texts = []
    for edu in education_list:
        parts = []
        if edu.get('school'):
            parts.append(str(edu['school']))
        if edu.get('course_or_strand'):
            parts.append(str(edu['course_or_strand']))
        if edu.get('education_type'):
            parts.append(str(edu['education_type']))
        if edu.get('year_range'):
            parts.append(str(edu['year_range']))
        if parts:
            texts.append(" ".join(parts))
    
    return " ".join(texts)


def extract_projects_text(projects_list: List[Dict]) -> str:
    """
    Combine project entries into searchable text for semantic matching.
    
    Args:
        projects_list: List of project dictionaries from parsed resume
    
    Returns:
        Combined text representation of projects
    """
    if not projects_list:
        return ""
    
    texts = []
    for proj in projects_list:
        parts = []
        if proj.get('name'):
            parts.append(str(proj['name']))
        if proj.get('details'):
            parts.append(str(proj['details']))
        if parts:
            texts.append(" ".join(parts))
    
    return " ".join(texts)


def parse_jsonb_field(value: Any) -> List[str]:
    """
    Parse jsonb field from Supabase, handling various formats.
    
    Args:
        value: The value from the database (list, string, or other)
    
    Returns:
        List of strings
    """
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed if v]
            return [str(parsed)]
        except json.JSONDecodeError:
            return [value]
    return [str(value)]


def build_job_requirements_text(job_posting: Dict) -> Dict[str, str]:
    """
    Build requirement texts from job posting for semantic matching.
    
    Args:
        job_posting: Job posting dictionary
    
    Returns:
        Dictionary with requirement texts for each component
    """
    # Experience requirement
    min_years = job_posting.get('min_years_experience')
    max_years = job_posting.get('max_years_experience')
    if min_years:
        try:
            min_years = float(min_years)
            exp_req = f"{int(min_years)}+ years of relevant work experience"
            if max_years:
                try:
                    max_years = float(max_years)
                    exp_req = f"{int(min_years)} to {int(max_years)} years of relevant work experience"
                except (ValueError, TypeError):
                    exp_req = f"{int(min_years)}+ years of relevant work experience"
        except (ValueError, TypeError):
            exp_req = "relevant work experience"
    else:
        exp_req = "relevant work experience"
    
    # Skills requirement (from skills array or keywords)
    skills = job_posting.get('skills', [])
    keywords = job_posting.get('keywords', [])
    
    # Parse jsonb fields properly
    skills_list = parse_jsonb_field(skills)
    keywords_list = parse_jsonb_field(keywords)
    
    if skills_list:
        skills_req = " ".join(skills_list)
    elif keywords_list:
        skills_req = " ".join(keywords_list)
    else:
        skills_req = job_posting.get('description', '')[:500] if job_posting.get('description') else ""
    
    # Education requirement
    required_edu = job_posting.get('required_education', [])
    edu_list = parse_jsonb_field(required_edu)
    if edu_list:
        edu_req = " ".join(edu_list)
    else:
        edu_req = "relevant education"
    
    # Projects requirement
    expected_projects = job_posting.get('expected_projects', [])
    projects_list = parse_jsonb_field(expected_projects)
    if projects_list:
        proj_req = " ".join(projects_list)
    else:
        proj_req = "relevant projects"
    
    return {
        "experience": exp_req,
        "skills": skills_req,
        "education": edu_req,
        "projects": proj_req
    }


def normalize_skill(skill: str) -> str:
    """
    Normalize a skill string for matching.
    Removes common variations and normalizes to lowercase.
    """
    skill = skill.lower().strip()
    # Remove seniority prefixes only when they appear as standalone words
    # (avoid stripping 'lead' from 'lead generation', 'principal' from 'principal component', etc.)
    for prefix in ['senior', 'junior', 'principal', 'staff']:
        skill = re.sub(r'\b' + prefix + r'\b', '', skill)
    skill = re.sub(r'[^\w#+\.]', ' ', skill)
    skill = re.sub(r'\s+', ' ', skill).strip()
    return skill


# Canonical alias map: maps known variants/abbreviations to a single canonical token.
# Both the resume skill and the job requirement are resolved through this map before
# comparison, so "reactjs" and "react.js" both resolve to "react" and match correctly.
_SKILL_ALIASES: Dict[str, str] = {
    # JavaScript ecosystem
    'javascript': 'javascript', 'js': 'javascript',
    'typescript': 'typescript', 'ts': 'typescript',
    'react': 'react', 'reactjs': 'react', 'react.js': 'react',
    'vue': 'vue', 'vuejs': 'vue', 'vue.js': 'vue',
    'angular': 'angular', 'angularjs': 'angular',
    'node': 'nodejs', 'nodejs': 'nodejs', 'node.js': 'nodejs',
    'next': 'nextjs', 'nextjs': 'nextjs', 'next.js': 'nextjs',
    'express': 'express', 'expressjs': 'express', 'express.js': 'express',
    # Python ecosystem
    'python': 'python', 'py': 'python',
    'django': 'django', 'flask': 'flask', 'fastapi': 'fastapi',
    'pandas': 'pandas', 'numpy': 'numpy', 'scipy': 'scipy',
    'tensorflow': 'tensorflow', 'tf': 'tensorflow',
    'pytorch': 'pytorch', 'torch': 'pytorch',
    'scikit': 'scikitlearn', 'scikit-learn': 'scikitlearn', 'sklearn': 'scikitlearn',
    # JVM
    'java': 'java', 'kotlin': 'kotlin', 'scala': 'scala',
    'spring': 'spring', 'springboot': 'spring', 'spring boot': 'spring',
    # .NET
    'c#': 'csharp', 'csharp': 'csharp',
    '.net': 'dotnet', 'dotnet': 'dotnet', 'asp.net': 'dotnet',
    # C/C++
    'c++': 'cpp', 'cpp': 'cpp',
    'c': 'clang',  # only exact "c" maps here; "c++" already handled above
    # Databases
    'sql': 'sql',
    'mysql': 'mysql', 'postgresql': 'postgresql', 'postgres': 'postgresql',
    'mssql': 'mssql', 'sql server': 'mssql', 'microsoft sql server': 'mssql',
    'mongodb': 'mongodb', 'mongo': 'mongodb',
    'redis': 'redis', 'elasticsearch': 'elasticsearch', 'elastic': 'elasticsearch',
    'sqlite': 'sqlite',
    # Cloud / DevOps
    'aws': 'aws', 'amazon web services': 'aws',
    'azure': 'azure', 'microsoft azure': 'azure',
    'gcp': 'gcp', 'google cloud': 'gcp', 'google cloud platform': 'gcp',
    'docker': 'docker', 'kubernetes': 'kubernetes', 'k8s': 'kubernetes',
    'terraform': 'terraform', 'ansible': 'ansible',
    'jenkins': 'jenkins', 'github actions': 'githubactions', 'gitlab ci': 'gitlabci',
    'ci/cd': 'cicd', 'cicd': 'cicd',
    # ML / Data
    'machine learning': 'machinelearning', 'ml': 'machinelearning',
    'deep learning': 'deeplearning', 'dl': 'deeplearning',
    'nlp': 'nlp', 'natural language processing': 'nlp',
    'computer vision': 'computervision', 'cv': 'computervision',
    'data science': 'datascience',
    'data engineering': 'dataengineering',
    'data analysis': 'dataanalysis', 'data analytics': 'dataanalysis',
    'power bi': 'powerbi', 'powerbi': 'powerbi',
    'tableau': 'tableau',
    'spark': 'spark', 'apache spark': 'spark',
    'kafka': 'kafka', 'apache kafka': 'kafka',
    'airflow': 'airflow', 'apache airflow': 'airflow',
    # Version control / tools
    'git': 'git', 'github': 'github', 'gitlab': 'gitlab', 'bitbucket': 'bitbucket',
    'linux': 'linux', 'unix': 'linux',
    'bash': 'bash', 'shell': 'bash', 'shell scripting': 'bash',
    'rest': 'restapi', 'rest api': 'restapi', 'restful': 'restapi',
    'graphql': 'graphql',
    # Mobile
    'swift': 'swift', 'objective-c': 'objectivec',
    'flutter': 'flutter', 'dart': 'dart',
    'react native': 'reactnative',
    # Other common
    'php': 'php', 'laravel': 'laravel',
    'ruby': 'ruby', 'rails': 'rails', 'ruby on rails': 'rails',
    'go': 'golang', 'golang': 'golang',
    'rust': 'rust',
    'r': 'rlang',
    'excel': 'excel', 'microsoft excel': 'excel',
    'word': 'msword', 'microsoft word': 'msword',
    'powerpoint': 'powerpoint', 'microsoft powerpoint': 'powerpoint',
    'figma': 'figma', 'sketch': 'sketch', 'adobe xd': 'adobexd',
    'photoshop': 'photoshop', 'illustrator': 'illustrator',
    'jira': 'jira', 'confluence': 'confluence', 'trello': 'trello',
    'agile': 'agile', 'scrum': 'scrum', 'kanban': 'kanban',
}

# Canonical alias map: maps known variants/abbreviations to a single canonical token.
# Both the resume skill and the job requirement are resolved through this map before
# comparison, so "reactjs" and "react.js" both resolve to "react" and match correctly.
# Covers: Tech, Finance, Healthcare, Marketing, Sales, HR, Legal, Operations, Education,
#         Creative, Supply Chain, Real Estate, Hospitality, and more.
_SKILL_ALIASES: Dict[str, str] = {
    # ── JavaScript / Web ──────────────────────────────────────────────────────
    'javascript': 'javascript', 'js': 'javascript',
    'typescript': 'typescript', 'ts': 'typescript',
    'react': 'react', 'reactjs': 'react', 'react.js': 'react',
    'vue': 'vue', 'vuejs': 'vue', 'vue.js': 'vue',
    'angular': 'angular', 'angularjs': 'angular',
    'node': 'nodejs', 'nodejs': 'nodejs', 'node.js': 'nodejs',
    'next': 'nextjs', 'nextjs': 'nextjs', 'next.js': 'nextjs',
    'nuxt': 'nuxtjs', 'nuxtjs': 'nuxtjs', 'nuxt.js': 'nuxtjs',
    'svelte': 'svelte', 'sveltekit': 'svelte',
    'express': 'express', 'expressjs': 'express', 'express.js': 'express',
    'jquery': 'jquery',
    'html': 'html', 'html5': 'html',
    'css': 'css', 'css3': 'css',
    'sass': 'sass', 'scss': 'sass',
    'tailwind': 'tailwind', 'tailwindcss': 'tailwind',
    'bootstrap': 'bootstrap',
    'webpack': 'webpack', 'vite': 'vite',
    # ── Python ────────────────────────────────────────────────────────────────
    'python': 'python', 'py': 'python',
    'django': 'django', 'flask': 'flask', 'fastapi': 'fastapi',
    'pandas': 'pandas', 'numpy': 'numpy', 'scipy': 'scipy',
    'matplotlib': 'matplotlib', 'seaborn': 'seaborn', 'plotly': 'plotly',
    'tensorflow': 'tensorflow', 'tf': 'tensorflow',
    'pytorch': 'pytorch', 'torch': 'pytorch',
    'scikit': 'scikitlearn', 'scikit-learn': 'scikitlearn', 'sklearn': 'scikitlearn',
    'keras': 'keras', 'xgboost': 'xgboost', 'lightgbm': 'lightgbm',
    'jupyter': 'jupyter', 'jupyter notebook': 'jupyter',
    # ── JVM ───────────────────────────────────────────────────────────────────
    'java': 'java', 'kotlin': 'kotlin', 'scala': 'scala', 'groovy': 'groovy',
    'spring': 'spring', 'springboot': 'spring', 'spring boot': 'spring',
    'hibernate': 'hibernate', 'maven': 'maven', 'gradle': 'gradle',
    # ── .NET ──────────────────────────────────────────────────────────────────
    'c#': 'csharp', 'csharp': 'csharp',
    '.net': 'dotnet', 'dotnet': 'dotnet', 'asp.net': 'dotnet',
    '.net framework': 'dotnet', '.net core': 'dotnet', 'asp.net core': 'dotnet',
    'asp.net mvc': 'dotnet', 'asp.net core mvc': 'dotnet', 'dotnet core': 'dotnet',
    'blazor': 'blazor', 'xamarin': 'xamarin', 'maui': 'maui',
    # ── C / C++ ───────────────────────────────────────────────────────────────
    'c++': 'cpp', 'cpp': 'cpp',
    'c': 'clang',
    # ── Databases ─────────────────────────────────────────────────────────────
    'sql': 'sql',
    'mysql': 'mysql', 'postgresql': 'postgresql', 'postgres': 'postgresql',
    'mssql': 'mssql', 'sql server': 'mssql', 'microsoft sql server': 'mssql',
    'oracle': 'oracle', 'oracle db': 'oracle', 'oracle database': 'oracle',
    'mongodb': 'mongodb', 'mongo': 'mongodb',
    'redis': 'redis', 'memcached': 'memcached',
    'elasticsearch': 'elasticsearch', 'elastic': 'elasticsearch',
    'cassandra': 'cassandra', 'dynamodb': 'dynamodb',
    'sqlite': 'sqlite', 'mariadb': 'mariadb',
    'snowflake': 'snowflake', 'bigquery': 'bigquery', 'redshift': 'redshift',
    # ── Cloud / DevOps ────────────────────────────────────────────────────────
    'aws': 'aws', 'amazon web services': 'aws',
    'aws s3': 'aws', 'aws ec2': 'aws', 'aws lambda': 'aws', 'aws rds': 'aws',
    'aws cloud': 'aws', 'aws automation': 'aws', 'aws databases': 'aws',
    'aws api gateway': 'aws', 'aws cloudfront': 'aws', 'aws route 53': 'aws',
    'aws codecommit': 'aws', 'aws cognito': 'aws', 'aws glue': 'aws',
    'azure': 'azure', 'microsoft azure': 'azure', 'azure cloud': 'azure',
    'azure devops': 'azure', 'azure services': 'azure',
    'gcp': 'gcp', 'google cloud': 'gcp', 'google cloud platform': 'gcp', 'google cloud platforms': 'gcp',
    'docker': 'docker', 'kubernetes': 'kubernetes', 'k8s': 'kubernetes',
    'terraform': 'terraform', 'ansible': 'ansible', 'puppet': 'puppet', 'chef': 'chef',
    'jenkins': 'jenkins', 'github actions': 'githubactions', 'gitlab ci': 'gitlabci',
    'ci/cd': 'cicd', 'cicd': 'cicd', 'continuous integration': 'cicd',
    'nginx': 'nginx', 'apache': 'apache',
    'linux': 'linux', 'unix': 'linux', 'ubuntu': 'linux', 'centos': 'linux',
    'bash': 'bash', 'shell': 'bash', 'shell scripting': 'bash',
    # ── ML / Data ─────────────────────────────────────────────────────────────
    'machine learning': 'machinelearning', 'ml': 'machinelearning',
    'deep learning': 'deeplearning', 'dl': 'deeplearning',
    'nlp': 'nlp', 'natural language processing': 'nlp',
    'computer vision': 'computervision', 'cv': 'computervision',
    'data science': 'datascience',
    'data engineering': 'dataengineering',
    'data analysis': 'dataanalysis', 'data analytics': 'dataanalysis',
    'data visualization': 'datavisualization', 'data viz': 'datavisualization',
    'power bi': 'powerbi', 'powerbi': 'powerbi',
    'tableau': 'tableau', 'looker': 'looker', 'qlik': 'qlik',
    'spark': 'spark', 'apache spark': 'spark', 'pyspark': 'spark',
    'kafka': 'kafka', 'apache kafka': 'kafka',
    'airflow': 'airflow', 'apache airflow': 'airflow',
    'etl': 'etl', 'etl pipelines': 'etl', 'etl pipeline': 'etl',
    'etl tools': 'etl', 'extract transform load': 'etl',
    'hadoop': 'hadoop', 'apache hadoop': 'hadoop', 'hdfs': 'hadoop', 'mapreduce': 'hadoop',
    'hive': 'hive', 'hbase': 'hbase', 'pig': 'pig',
    'scala': 'scala',
    'data modeling': 'datamodeling', 'data modelling': 'datamodeling', 'data models': 'datamodeling',
    'data structures': 'datastructures', 'data structure': 'datastructures',
    'analytical thinking': 'analytical', 'analytical skills': 'analytical',
    'eda': 'dataanalysis', 'exploratory data analysis': 'dataanalysis',
    'dbt': 'dbt', 'fivetran': 'fivetran', 'stitch': 'stitch',
    'r': 'rlang', 'r programming': 'rlang', 'r language': 'rlang',
    'sas': 'sas', 'spss': 'spss', 'stata': 'stata',
    # ── Version control / APIs ────────────────────────────────────────────────
    'git': 'git', 'github': 'github', 'gitlab': 'gitlab', 'bitbucket': 'bitbucket',
    'rest': 'restapi', 'rest api': 'restapi', 'restful': 'restapi',
    'graphql': 'graphql', 'grpc': 'grpc', 'soap': 'soap',
    'postman': 'postman', 'swagger': 'swagger', 'openapi': 'openapi',
    # ── Mobile ────────────────────────────────────────────────────────────────
    'swift': 'swift', 'objective-c': 'objectivec',
    'flutter': 'flutter', 'dart': 'dart',
    'react native': 'reactnative',
    'android': 'android', 'ios': 'ios',
    # ── Other languages ───────────────────────────────────────────────────────
    'php': 'php', 'laravel': 'laravel', 'symfony': 'symfony',
    'ruby': 'ruby', 'rails': 'rails', 'ruby on rails': 'rails',
    'go': 'golang', 'golang': 'golang',
    'rust': 'rust', 'elixir': 'elixir', 'erlang': 'erlang',
    'perl': 'perl', 'lua': 'lua',
    # ── Project management / collaboration ────────────────────────────────────
    'jira': 'jira', 'confluence': 'confluence', 'trello': 'trello',
    'asana': 'asana', 'monday': 'monday', 'monday.com': 'monday',
    'notion': 'notion', 'basecamp': 'basecamp', 'clickup': 'clickup',
    'slack': 'slack', 'teams': 'msteams', 'microsoft teams': 'msteams',
    'zoom': 'zoom', 'google meet': 'googlemeet',
    'agile': 'agile', 'scrum': 'scrum', 'kanban': 'kanban',
    'waterfall': 'waterfall', 'prince2': 'prince2', 'pmp': 'pmp',
    'six sigma': 'sixsigma', 'lean': 'lean', 'kaizen': 'kaizen',
    # ── Microsoft Office / Google Workspace ───────────────────────────────────
    'excel': 'excel', 'microsoft excel': 'excel', 'ms excel': 'excel',
    'word': 'msword', 'microsoft word': 'msword', 'ms word': 'msword',
    'powerpoint': 'powerpoint', 'microsoft powerpoint': 'powerpoint', 'ms powerpoint': 'powerpoint',
    'outlook': 'outlook', 'microsoft outlook': 'outlook',
    'access': 'msaccess', 'microsoft access': 'msaccess',
    'sharepoint': 'sharepoint', 'microsoft sharepoint': 'sharepoint',
    'google sheets': 'googlesheets', 'google docs': 'googledocs',
    'google workspace': 'googleworkspace', 'g suite': 'googleworkspace',
    # ── Design / Creative ─────────────────────────────────────────────────────
    'figma': 'figma', 'sketch': 'sketch', 'adobe xd': 'adobexd', 'xd': 'adobexd',
    'photoshop': 'photoshop', 'adobe photoshop': 'photoshop',
    'illustrator': 'illustrator', 'adobe illustrator': 'illustrator',
    'indesign': 'indesign', 'adobe indesign': 'indesign',
    'premiere': 'premiere', 'adobe premiere': 'premiere', 'premiere pro': 'premiere',
    'after effects': 'aftereffects', 'adobe after effects': 'aftereffects',
    'lightroom': 'lightroom', 'adobe lightroom': 'lightroom',
    'canva': 'canva', 'coreldraw': 'coreldraw',
    'blender': 'blender', 'maya': 'maya', 'autocad': 'autocad',
    '3ds max': '3dsmax', 'cinema 4d': 'cinema4d',
    # ── Finance / Accounting ──────────────────────────────────────────────────
    'quickbooks': 'quickbooks', 'quickbooks online': 'quickbooks',
    'xero': 'xero', 'sage': 'sage', 'sage accounting': 'sage',
    'sap': 'sap', 'sap fi': 'sap', 'sap fico': 'sap',
    'oracle financials': 'oraclefinancials', 'oracle erp': 'oraclefinancials',
    'netsuite': 'netsuite', 'oracle netsuite': 'netsuite',
    'financial modeling': 'financialmodeling', 'financial modelling': 'financialmodeling',
    'financial analysis': 'financialanalysis', 'financial reporting': 'financialreporting',
    'budgeting': 'budgeting', 'forecasting': 'forecasting',
    'accounts payable': 'accountspayable', 'ap': 'accountspayable',
    'accounts receivable': 'accountsreceivable', 'ar': 'accountsreceivable',
    'general ledger': 'generalledger', 'gl': 'generalledger',
    'gaap': 'gaap', 'ifrs': 'ifrs',
    'tax': 'tax', 'taxation': 'tax', 'tax compliance': 'tax',
    'audit': 'audit', 'internal audit': 'audit', 'external audit': 'audit',
    'payroll': 'payroll', 'payroll processing': 'payroll',
    'bloomberg': 'bloomberg', 'bloomberg terminal': 'bloomberg',
    'valuation': 'valuation', 'dcf': 'dcf', 'discounted cash flow': 'dcf',
    'equity research': 'equityresearch', 'investment banking': 'investmentbanking',
    'risk management': 'riskmanagement', 'credit risk': 'creditrisk',
    'compliance': 'compliance', 'regulatory compliance': 'compliance',
    'kyc': 'kyc', 'know your customer': 'kyc',
    'aml': 'aml', 'anti-money laundering': 'aml',
    'derivatives': 'derivatives', 'fixed income': 'fixedincome',
    'portfolio management': 'portfoliomanagement',
    'financial planning': 'financialplanning', 'fp&a': 'fpa', 'fpa': 'fpa',
    # ── Marketing / Digital Marketing ─────────────────────────────────────────
    'seo': 'seo', 'search engine optimization': 'seo',
    'sem': 'sem', 'search engine marketing': 'sem',
    'ppc': 'ppc', 'pay per click': 'ppc', 'paid search': 'ppc',
    'google ads': 'googleads', 'google adwords': 'googleads',
    'facebook ads': 'facebookads', 'meta ads': 'facebookads',
    'social media marketing': 'socialmediamarketing', 'smm': 'socialmediamarketing',
    'content marketing': 'contentmarketing', 'content strategy': 'contentmarketing',
    'email marketing': 'emailmarketing',
    'marketing automation': 'marketingautomation',
    'hubspot': 'hubspot', 'marketo': 'marketo', 'pardot': 'pardot',
    'mailchimp': 'mailchimp', 'klaviyo': 'klaviyo',
    'google analytics': 'googleanalytics', 'ga4': 'googleanalytics',
    'adobe analytics': 'adobeanalytics',
    'crm': 'crm', 'customer relationship management': 'crm',
    'salesforce': 'salesforce', 'salesforce crm': 'salesforce',
    'zoho': 'zoho', 'zoho crm': 'zoho',
    'brand management': 'brandmanagement', 'branding': 'brandmanagement',
    'market research': 'marketresearch', 'consumer insights': 'marketresearch',
    'copywriting': 'copywriting', 'content writing': 'copywriting',
    'public relations': 'pr', 'pr': 'pr',
    'influencer marketing': 'influencermarketing',
    'affiliate marketing': 'affiliatemarketing',
    'conversion rate optimization': 'cro', 'cro': 'cro',
    'a/b testing': 'abtesting', 'ab testing': 'abtesting',
    'growth hacking': 'growthhacking', 'growth marketing': 'growthhacking',
    # ── Sales ─────────────────────────────────────────────────────────────────
    'b2b sales': 'b2bsales', 'b2b': 'b2bsales',
    'b2c sales': 'b2csales', 'b2c': 'b2csales',
    'inside sales': 'insidesales', 'outside sales': 'outsidesales',
    'account management': 'accountmanagement',
    'business development': 'businessdevelopment', 'biz dev': 'businessdevelopment',
    'lead generation': 'leadgeneration', 'prospecting': 'leadgeneration',
    'lead gen': 'leadgeneration', 'outbound prospecting': 'leadgeneration',
    'cold calling': 'coldcalling', 'cold outreach': 'coldcalling',
    'pipeline management': 'pipelinemanagement', 'sales pipeline': 'pipelinemanagement',
    'negotiation': 'negotiation', 'contract negotiation': 'negotiation',
    'closing': 'salesclosing', 'deal closing': 'salesclosing',
    'quota': 'quota', 'revenue target': 'quota',
    'upselling': 'upselling', 'cross-selling': 'crossselling', 'cross selling': 'crossselling',
    # ── HR / People ───────────────────────────────────────────────────────────
    'recruitment': 'recruitment', 'recruiting': 'recruitment', 'talent acquisition': 'recruitment',
    'sourcing': 'sourcing', 'talent sourcing': 'sourcing',
    'onboarding': 'onboarding', 'employee onboarding': 'onboarding',
    'performance management': 'performancemanagement', 'performance review': 'performancemanagement',
    'employee relations': 'employeerelations', 'er': 'employeerelations',
    'compensation': 'compensation', 'benefits': 'benefits',
    'compensation and benefits': 'compensationbenefits', 'c&b': 'compensationbenefits',
    'hris': 'hris', 'hr information system': 'hris',
    'workday': 'workday', 'bamboohr': 'bamboohr', 'adp': 'adp',
    'successfactors': 'successfactors', 'sap successfactors': 'successfactors',
    'learning and development': 'learninganddevelopment', 'l&d': 'learninganddevelopment',
    'l and d': 'learninganddevelopment', 'ld': 'learninganddevelopment',
    'training and development': 'learninganddevelopment', 't&d': 'learninganddevelopment',
    'organizational development': 'orgdevelopment', 'od': 'orgdevelopment',
    'labor law': 'laborlaw', 'employment law': 'laborlaw',
    'diversity and inclusion': 'dei', 'dei': 'dei', 'd&i': 'dei',
    'workforce planning': 'workforceplanning', 'headcount planning': 'workforceplanning',
    # ── Healthcare / Medical ──────────────────────────────────────────────────
    'ehr': 'ehr', 'electronic health records': 'ehr', 'emr': 'ehr',
    'epic': 'epic', 'epic systems': 'epic',
    'cerner': 'cerner', 'meditech': 'meditech',
    'hipaa': 'hipaa', 'hipaa compliance': 'hipaa',
    'icd-10': 'icd10', 'icd10': 'icd10', 'icd 10': 'icd10',
    'cpt coding': 'cptcoding', 'medical coding': 'cptcoding',
    'medical billing': 'medicalbilling',
    'clinical research': 'clinicalresearch', 'clinical trials': 'clinicalresearch',
    'patient care': 'patientcare', 'patient management': 'patientcare',
    'nursing': 'nursing', 'rn': 'rn', 'registered nurse': 'rn',
    'lpn': 'lpn', 'licensed practical nurse': 'lpn',
    'cna': 'cna', 'certified nursing assistant': 'cna',
    'phlebotomy': 'phlebotomy', 'venipuncture': 'phlebotomy',
    'radiology': 'radiology', 'mri': 'mri', 'ct scan': 'ctscan',
    'pharmacy': 'pharmacy', 'pharmacology': 'pharmacology',
    'physical therapy': 'physicaltherapy', 'pt': 'physicaltherapy',
    'occupational therapy': 'occupationaltherapy', 'ot': 'occupationaltherapy',
    'mental health': 'mentalhealth', 'counseling': 'counseling',
    'telemedicine': 'telemedicine', 'telehealth': 'telemedicine',
    # ── Legal ─────────────────────────────────────────────────────────────────
    'legal research': 'legalresearch', 'case research': 'legalresearch',
    'legal writing': 'legalwriting', 'legal drafting': 'legalwriting',
    'contract drafting': 'contractdrafting', 'contract review': 'contractdrafting',
    'litigation': 'litigation', 'trial preparation': 'litigation',
    'corporate law': 'corporatelaw', 'mergers and acquisitions': 'mergers',
    'm&a': 'mergers', 'due diligence': 'duediligence',
    'intellectual property': 'ip', 'ip law': 'ip', 'patent': 'patent',
    'trademark': 'trademark', 'copyright': 'copyright',
    'westlaw': 'westlaw', 'lexisnexis': 'lexisnexis',
    'paralegal': 'paralegal', 'legal assistant': 'paralegal',
    # ── Operations / Supply Chain / Logistics ─────────────────────────────────
    'supply chain': 'supplychain', 'supply chain management': 'supplychain',
    'logistics': 'logistics', 'freight': 'logistics',
    'procurement': 'procurement', 'purchasing': 'procurement',
    'inventory management': 'inventorymanagement', 'inventory control': 'inventorymanagement',
    'warehouse management': 'warehousemanagement', 'wms': 'warehousemanagement',
    'erp': 'erp', 'enterprise resource planning': 'erp',
    'sap mm': 'sapmm', 'sap sd': 'sapsd', 'sap pp': 'sappp',
    'demand planning': 'demandplanning', 'demand forecasting': 'demandplanning',
    'vendor management': 'vendormanagement', 'supplier management': 'vendormanagement',
    'quality control': 'qualitycontrol', 'qc': 'qualitycontrol',
    'quality assurance': 'qualityassurance', 'qa': 'qualityassurance',
    'iso': 'iso', 'iso 9001': 'iso9001', 'iso 14001': 'iso14001',
    'lean manufacturing': 'leanmanufacturing', 'lean six sigma': 'leansixsigma',
    'process improvement': 'processimprovement', 'continuous improvement': 'processimprovement',
    'operations management': 'operationsmanagement',
    'fleet management': 'fleetmanagement',
    # ── Customer Service / Support ────────────────────────────────────────────
    'customer service': 'customerservice', 'customer support': 'customerservice',
    'customer success': 'customersuccess', 'cs': 'customersuccess',
    'zendesk': 'zendesk', 'freshdesk': 'freshdesk', 'intercom': 'intercom',
    'servicenow': 'servicenow', 'service now': 'servicenow',
    'help desk': 'helpdesk', 'helpdesk': 'helpdesk', 'it support': 'helpdesk',
    'ticketing': 'ticketing', 'ticket management': 'ticketing',
    'call center': 'callcenter', 'contact center': 'callcenter',
    'live chat': 'livechat', 'chat support': 'livechat',
    'nps': 'nps', 'net promoter score': 'nps',
    'csat': 'csat', 'customer satisfaction': 'csat',
    # ── Education / Training ──────────────────────────────────────────────────
    'curriculum development': 'curriculumdevelopment', 'curriculum design': 'curriculumdevelopment',
    'instructional design': 'instructionaldesign', 'e-learning': 'elearning',
    'lms': 'lms', 'learning management system': 'lms',
    'moodle': 'moodle', 'canvas': 'canvas', 'blackboard': 'blackboard',
    'classroom management': 'classroommanagement',
    'lesson planning': 'lessonplanning', 'lesson plan': 'lessonplanning',
    'special education': 'specialeducation', 'sped': 'specialeducation',
    'stem': 'stem', 'steam': 'steam',
    # ── Real Estate ───────────────────────────────────────────────────────────
    'property management': 'propertymanagement',
    'real estate': 'realestate', 'real estate sales': 'realestate',
    'mls': 'mls', 'multiple listing service': 'mls',
    'lease administration': 'leaseadmin', 'lease management': 'leaseadmin',
    'appraisal': 'appraisal', 'property valuation': 'appraisal',
    'title insurance': 'titleinsurance', 'escrow': 'escrow',
    # ── Hospitality / Food & Beverage ─────────────────────────────────────────
    'food safety': 'foodsafety', 'haccp': 'haccp',
    'pos': 'pos', 'point of sale': 'pos',
    'restaurant management': 'restaurantmanagement',
    'hotel management': 'hotelmanagement', 'hospitality management': 'hotelmanagement',
    'front desk': 'frontdesk', 'front office': 'frontdesk',
    'housekeeping': 'housekeeping',
    'event planning': 'eventplanning', 'event management': 'eventplanning',
    'catering': 'catering', 'banquet': 'banquet',
    # ── Construction / Engineering ────────────────────────────────────────────
    'revit': 'revit', 'archicad': 'archicad',
    'civil 3d': 'civil3d', 'microstation': 'microstation',
    'construction management': 'constructionmanagement',
    'cost estimation': 'costestimation', 'quantity surveying': 'costestimation',
    'structural analysis': 'structuralanalysis',
    'building codes': 'buildingcodes', 'building regulations': 'buildingcodes',
    'osha': 'osha', 'health and safety': 'healthsafety', 'hse': 'healthsafety',
    # ── Soft skills (universal) ───────────────────────────────────────────────
    'communication': 'communication', 'written communication': 'communication',
    'verbal communication': 'communication', 'presentation': 'presentation',
    'public speaking': 'publicspeaking',
    'leadership': 'leadership', 'team leadership': 'leadership',
    'management': 'management', 'people management': 'management',
    'teamwork': 'teamwork', 'collaboration': 'teamwork', 'team player': 'teamwork',
    'problem solving': 'problemsolving', 'critical thinking': 'criticalthinking',
    'analytical': 'analytical', 'analytical skills': 'analytical',
    'attention to detail': 'attentiontodetail', 'detail oriented': 'attentiontodetail',
    'time management': 'timemanagement', 'prioritization': 'timemanagement',
    'multitasking': 'multitasking',
    'adaptability': 'adaptability', 'flexibility': 'adaptability',
    'creativity': 'creativity', 'innovation': 'innovation',
    'customer focus': 'customerfocus', 'client focus': 'customerfocus',
    'research': 'research', 'report writing': 'reportwriting',
    'microsoft office': 'msoffice', 'ms office': 'msoffice', 'office suite': 'msoffice',
}

# Minimum token length for a partial-match to be considered valid.
# Prevents single-letter or very short tokens from causing false positives.
_MIN_PARTIAL_LEN = 4


def _strip_skill_qualifiers(skill: str) -> str:
    """
    Remove level/proficiency qualifiers that job postings append to skill names.
    e.g. "React basics" → "React", "AWS S3 basics" → "AWS S3",
         "ETL fundamentals" → "ETL", "Node.js introduction" → "Node.js"

    This ensures job requirements like "React basics" match a resume that lists "React".
    """
    qualifiers = (
        r'\b(?:basics?|fundamentals?|introduction|intro|beginner|intermediate|advanced|'
        r'proficiency|knowledge|experience|skills?|concepts?|principles?|overview|'
        r'essentials?|foundations?|core|level [1-9]|[1-9] ?[0-9]* ?(?:years?|yrs?))\b'
    )
    cleaned = re.sub(qualifiers, '', skill, flags=re.IGNORECASE)
    # Clean up leftover punctuation / extra spaces
    cleaned = re.sub(r'[\-/,]+$', '', cleaned.strip())
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else skill  # fall back to original if everything was stripped


def _canonicalize_skill(raw: str) -> str:
    """
    Resolve a raw skill string to its canonical alias (if known),
    otherwise return the normalized form.

    Pipeline:
    1. Strip level qualifiers ("React basics" → "React")
    2. Normalize (lowercase, remove special chars)
    3. Look up in alias map (full string, then compact/no-spaces form)
    4. Return canonical token or normalized string
    """
    # Step 1: strip qualifiers before normalizing
    stripped = _strip_skill_qualifiers(raw)
    norm = normalize_skill(stripped)
    # Try the full normalized string first
    if norm in _SKILL_ALIASES:
        return _SKILL_ALIASES[norm]
    # Try without internal spaces (e.g. "react js" -> "reactjs")
    compact = norm.replace(' ', '')
    if compact in _SKILL_ALIASES:
        return _SKILL_ALIASES[compact]
    return norm


def _skills_match(resume_canon: str, req_canon: str) -> bool:
    """
    Return True if resume_canon is considered a match for req_canon.

    Rules (in order):
    1. Exact canonical match.
    2. One is a whole-word prefix/suffix of the other — but only when both
       tokens are long enough to avoid Java/JavaScript-style false positives.
    3. One contains the other as a whole word (word-boundary check).
    """
    if resume_canon == req_canon:
        return True

    # Guard: both sides must be at least _MIN_PARTIAL_LEN chars for partial matching
    if len(resume_canon) < _MIN_PARTIAL_LEN or len(req_canon) < _MIN_PARTIAL_LEN:
        return False

    # Whole-word containment: "python developer" contains "python" as a word
    # Use word-boundary regex to avoid "sql" matching "nosql"
    try:
        if re.search(r'\b' + re.escape(req_canon) + r'\b', resume_canon):
            return True
        if re.search(r'\b' + re.escape(resume_canon) + r'\b', req_canon):
            return True
    except re.error:
        pass

    return False


def calculate_skills_keyword_match(
    resume_skills: Dict[str, List[str]],
    job_skills: List[str],
    resume_experience: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Calculate skills match using canonical alias resolution + safe word-boundary matching.

    Returns:
        Dict with 'score' (0-100), 'matched' (list of raw job skill labels matched),
        and 'missing' (list of raw job skill labels not matched).
    """
    if not job_skills:
        return {'score': 50.0, 'matched': [], 'missing': []}

    # Extract all resume skills
    all_resume_skills: List[str] = []
    if isinstance(resume_skills, dict):
        # Prefer 'all' field (GPT extractor builds this as full deduped union of hard+soft)
        if resume_skills.get('all') and isinstance(resume_skills['all'], list):
            all_resume_skills = list(resume_skills['all'])
        else:
            all_resume_skills = resume_skills.get('hard_skills', []) + resume_skills.get('soft_skills', [])
        # Fallback: flatten all values if still empty
        if not all_resume_skills:
            for v in resume_skills.values():
                if isinstance(v, str):
                    all_resume_skills.extend(s.strip() for s in v.split(',') if s.strip())
                elif isinstance(v, list):
                    all_resume_skills.extend(v)
    elif isinstance(resume_skills, list):
        all_resume_skills = list(resume_skills)

    # Also extract tech keywords from experience text (catches skills only in experience bullets)
    _TECH_PATTERN = re.compile(
        r'\b(JavaScript|TypeScript|Python|Java|PHP|SQL|HTML|CSS|C#|C\+\+|Scala|Ruby|Go|Rust|'
        r'React|Angular|Vue|Node\.js|Next\.js|ASP\.NET|Django|Flask|FastAPI|Spring|Laravel|'
        r'MySQL|PostgreSQL|MSSQL|MongoDB|Redis|SQLite|Supabase|Firebase|DynamoDB|'
        r'AWS|GCP|Azure|Docker|Kubernetes|Terraform|Ansible|Jenkins|Linux|Git|GitHub|'
        r'Spark|Hadoop|Airflow|Kafka|ETL|n8n|Talend|SAP|Figma|Unity|LINQ|Razor|'
        r'Entity\s+Framework|\.NET\s+Framework|ASP\.NET\s+Core|ASP\.NET\s+MVC|VB\.NET)\b',
        re.IGNORECASE
    )
    if resume_experience:
        for exp in resume_experience:
            parts = []
            if isinstance(exp.get('summary'), str):
                parts.append(exp['summary'])
            if isinstance(exp.get('description'), str):
                parts.append(exp['description'])
            if isinstance(exp.get('bullets'), list):
                parts.extend(str(b) for b in exp['bullets'])
            text = ' '.join(parts)
            for m in _TECH_PATTERN.finditer(text):
                all_resume_skills.append(m.group(0))

    if not all_resume_skills:
        return {'score': 0.0, 'matched': [], 'missing': [raw for _, raw in []]}

    # Canonicalize both sides
    canon_resume = [_canonicalize_skill(s) for s in all_resume_skills if s]
    # Deduplicate job skills by canonical form to avoid inflating the denominator
    seen_req: set = set()
    canon_job: list = []
    for s in job_skills:
        if s:
            canon = _canonicalize_skill(s)
            if canon not in seen_req:
                seen_req.add(canon)
                canon_job.append((canon, s))

    matched_canons: set = set()
    for req_canon, req_raw in canon_job:
        for res_canon in canon_resume:
            if _skills_match(res_canon, req_canon):
                matched_canons.add(req_canon)
                break

    matched_raw = [raw for canon, raw in canon_job if canon in matched_canons]
    missing_raw = [raw for canon, raw in canon_job if canon not in matched_canons]

    match_percentage = (len(matched_canons) / len(canon_job)) * 100 if canon_job else 0

    print(f"[DEBUG] Skills match: {len(matched_canons)}/{len(canon_job)} = {match_percentage:.1f}%")
    print(f"[DEBUG]   Required (canon): {[c for c, _ in canon_job]}")
    print(f"[DEBUG]   Matched (canon): {matched_canons}")

    return {
        'score': round(match_percentage, 2),
        'matched': matched_raw,
        'missing': missing_raw,
    }






def _parse_years_from_experience(exp: Dict) -> float:
    """
    Extract the number of years from a single experience entry.

    Handles:
    - Explicit text: "3 years", "2 yrs"
    - Date ranges: "2021-2024", "Jan 2020 – Mar 2023", "AUG 2025 - SEPT 2025",
      "2019 to present", "2018 – current", etc.
    - Same-year ranges: "AUG 2025 - SEPT 2025" → 0.08 years (1 month)
    - Numeric year values stored directly as int/float
    """
    from datetime import date

    _MONTH_MAP = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }

    _MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                    'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

    def month_num(s: str) -> int:
        return _MONTH_MAP.get(s[:3].lower(), 1)

    def months_between(m1: int, y1: int, m2: int, y2: int) -> float:
        return max(0.0, (y2 - y1) * 12 + (m2 - m1)) / 12.0

    current_year  = date.today().year
    current_month = date.today().month
    current_month_name = _MONTH_NAMES[current_month - 1]
    present_replacement = f'{current_month_name} {current_year}'

    # 1. Try the 'years' field first
    raw_years = exp.get('years') or exp.get('year_range') or ''
    if isinstance(raw_years, (int, float)):
        # Guard: a raw 4-digit year like 2025 is not a duration
        val = float(raw_years)
        return val if val < 100 else 0.0

    raw_years = str(raw_years).strip()

    # Guard: a bare 4-digit calendar year is not a duration — skip it
    if re.fullmatch(r'\d{4}', raw_years):
        return 0.0

    # 1a. Explicit "N years" / "N yrs"
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:years?|yrs?)', raw_years, re.IGNORECASE)
    if m:
        return float(m.group(1))

    # Normalise separators and present/current tokens
    normalised = re.sub(
        r'(?i)\b(present|current|now|ongoing)\b',
        present_replacement,
        raw_years
    )
    normalised = re.sub(r'[–—−]', '-', normalised)

    months_pat = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'

    # 1b. "Mon YYYY - Mon YYYY"  (full month-level precision)
    m = re.search(
        rf'({months_pat})\s+(\d{{4}})\s*(?:-|to)\s*({months_pat})\s+(\d{{4}})',
        normalised, re.IGNORECASE
    )
    if m:
        m1, y1 = month_num(m.group(1)), int(m.group(2))
        m2, y2 = month_num(m.group(3)), int(m.group(4))
        return months_between(m1, y1, m2, y2)

    # 1c. "Mon YYYY - YYYY"  (start month known, end year only)
    m = re.search(
        rf'({months_pat})\s+(\d{{4}})\s*(?:-|to)\s*(\d{{4}})',
        normalised, re.IGNORECASE
    )
    if m:
        m1, y1, y2 = month_num(m.group(1)), int(m.group(2)), int(m.group(3))
        return months_between(m1, y1, 1, y2)

    # 1d. "YYYY - Mon YYYY"  (end month known, start year only)
    m = re.search(
        rf'(\d{{4}})\s*(?:-|to)\s*({months_pat})\s+(\d{{4}})',
        normalised, re.IGNORECASE
    )
    if m:
        y1, m2, y2 = int(m.group(1)), month_num(m.group(2)), int(m.group(3))
        return months_between(1, y1, m2, y2)

    # 1e. "YYYY - YYYY"  (year-only range)
    m = re.search(r'(\d{4})\s*(?:-|to)\s*(\d{4})', normalised)
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        return max(0.0, float(y2 - y1))

    # 2. Fall back to the full experience text
    exp_text = extract_experience_text([exp]).lower()
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:years?|yrs?)', exp_text)
    if m:
        return float(m.group(1))

    # 3. Try date-range patterns in combined text
    normalised2 = re.sub(
        r'(?i)\b(present|current|now|ongoing)\b',
        present_replacement,
        exp_text
    )
    normalised2 = re.sub(r'[–—−]', '-', normalised2)

    m = re.search(
        rf'({months_pat})\s+(\d{{4}})\s*(?:-|to)\s*({months_pat})\s+(\d{{4}})',
        normalised2, re.IGNORECASE
    )
    if m:
        m1, y1 = month_num(m.group(1)), int(m.group(2))
        m2, y2 = month_num(m.group(3)), int(m.group(4))
        return months_between(m1, y1, m2, y2)

    m = re.search(r'(\d{4})\s*(?:-|to)\s*(\d{4})', normalised2)
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        return max(0.0, float(y2 - y1))

    return 0.0


# ── Role / title synonym groups ───────────────────────────────────────────────
# Each tuple is a set of interchangeable terms. When a job-title keyword
# matches any member of a group, all other members are also considered matched.
# Covers: Tech, Finance, Healthcare, Marketing, Sales, HR, Legal, Operations,
#         Education, Creative, Supply Chain, Real Estate, Hospitality, and more.
_ROLE_SYNONYMS: List[tuple] = [
    # ── Software Engineering ──────────────────────────────────────────────────
    ('engineer', 'developer', 'programmer', 'coder', 'dev'),
    ('software engineer', 'software developer', 'software programmer'),
    ('frontend', 'front-end', 'front end', 'ui developer', 'ui engineer'),
    ('backend', 'back-end', 'back end', 'server-side'),
    ('fullstack', 'full-stack', 'full stack', 'full-stack developer', 'fullstack developer'),
    ('mobile developer', 'mobile engineer', 'app developer'),
    ('ios developer', 'ios engineer', 'swift developer'),
    ('android developer', 'android engineer', 'kotlin developer'),
    ('devops', 'dev ops', 'site reliability', 'sre', 'platform engineer'),
    ('data engineer', 'data pipeline engineer', 'etl developer', 'etl engineer'),
    ('data scientist', 'data science', 'ml engineer', 'machine learning engineer'),
    ('data analyst', 'data analytics', 'business analyst', 'bi analyst'),
    ('cloud engineer', 'cloud architect', 'cloud developer'),
    ('security engineer', 'cybersecurity engineer', 'infosec engineer', 'information security engineer'),
    ('qa engineer', 'quality assurance engineer', 'test engineer', 'sdet', 'automation engineer', 'software tester'),
    ('embedded engineer', 'firmware engineer', 'embedded developer'),
    ('solutions architect', 'enterprise architect', 'technical architect'),
    ('database administrator', 'dba', 'database engineer'),
    ('network engineer', 'network administrator', 'network analyst', 'network specialist'),
    ('systems administrator', 'sysadmin', 'systems engineer', 'it administrator'),
    ('technical writer', 'documentation engineer', 'technical documentation specialist'),
    # ── Tech Management ───────────────────────────────────────────────────────
    ('tech lead', 'technical lead', 'team lead', 'engineering lead'),
    ('engineering manager', 'software manager', 'development manager'),
    ('product manager', 'product owner', 'pm'),
    ('project manager', 'project lead', 'delivery manager', 'program manager'),
    ('scrum master', 'agile coach', 'agile practitioner'),
    ('it manager', 'it director', 'head of it', 'chief information officer', 'cio'),
    ('cto', 'chief technology officer', 'vp of engineering', 'head of engineering'),
    # ── Design / UX ───────────────────────────────────────────────────────────
    ('ux designer', 'ui designer', 'ux/ui designer', 'product designer', 'interaction designer', 'user experience designer'),
    ('graphic designer', 'visual designer', 'graphic artist'),
    ('web designer', 'website designer', 'digital designer'),
    ('motion designer', 'motion graphics artist', 'animator'),
    ('art director', 'creative director', 'design director'),
    ('brand designer', 'brand identity designer'),
    # ── Finance / Accounting ──────────────────────────────────────────────────
    ('accountant', 'accounting specialist', 'accounting officer'),
    ('financial analyst', 'finance analyst', 'financial planning analyst', 'fp&a analyst'),
    ('financial controller', 'finance controller', 'comptroller'),
    ('chief financial officer', 'cfo', 'vp of finance', 'head of finance'),
    ('auditor', 'internal auditor', 'external auditor', 'audit specialist'),
    ('tax accountant', 'tax specialist', 'tax consultant', 'tax advisor'),
    ('bookkeeper', 'accounts clerk', 'accounting clerk'),
    ('investment analyst', 'equity analyst', 'research analyst', 'equity research analyst'),
    ('investment banker', 'investment banking analyst', 'ib analyst'),
    ('risk analyst', 'risk manager', 'risk officer', 'credit risk analyst'),
    ('compliance officer', 'compliance analyst', 'regulatory affairs officer'),
    ('treasury analyst', 'treasury manager', 'cash management analyst'),
    ('payroll specialist', 'payroll administrator', 'payroll officer'),
    ('budget analyst', 'budget manager', 'budget officer'),
    ('actuary', 'actuarial analyst', 'actuarial associate'),
    # ── Marketing ─────────────────────────────────────────────────────────────
    ('marketing manager', 'marketing director', 'head of marketing'),
    ('digital marketing manager', 'digital marketing specialist', 'online marketing manager'),
    ('seo specialist', 'seo analyst', 'seo manager', 'search engine optimization specialist'),
    ('content writer', 'copywriter', 'content creator', 'content specialist'),
    ('social media manager', 'social media specialist', 'social media coordinator'),
    ('brand manager', 'brand strategist', 'brand specialist'),
    ('marketing analyst', 'market research analyst', 'consumer insights analyst'),
    ('email marketing specialist', 'email marketing manager', 'crm specialist'),
    ('growth marketer', 'growth hacker', 'growth manager'),
    ('public relations manager', 'pr manager', 'communications manager', 'pr specialist'),
    ('event coordinator', 'event planner', 'event manager', 'events specialist'),
    ('media buyer', 'media planner', 'paid media specialist'),
    # ── Sales ─────────────────────────────────────────────────────────────────
    ('sales representative', 'sales rep', 'sales executive', 'sales associate'),
    ('account executive', 'account manager', 'client manager', 'relationship manager'),
    ('business development manager', 'business development executive', 'biz dev manager'),
    ('sales manager', 'sales director', 'head of sales', 'vp of sales'),
    ('inside sales representative', 'inside sales rep', 'inbound sales rep'),
    ('outside sales representative', 'field sales representative', 'territory manager'),
    ('key account manager', 'kam', 'strategic account manager'),
    ('pre-sales consultant', 'solutions consultant', 'sales engineer'),
    ('retail sales associate', 'retail associate', 'sales floor associate'),
    # ── HR / People ───────────────────────────────────────────────────────────
    ('hr manager', 'human resources manager', 'people manager', 'hr business partner', 'hrbp'),
    ('recruiter', 'talent acquisition specialist', 'talent acquisition manager', 'hiring manager'),
    ('hr generalist', 'human resources generalist', 'hr officer'),
    ('hr director', 'chief people officer', 'cpo', 'vp of hr', 'head of hr'),
    ('compensation analyst', 'benefits analyst', 'total rewards analyst'),
    ('learning and development specialist', 'l&d specialist', 'training specialist', 'training coordinator'),
    ('organizational development specialist', 'od specialist', 'change management specialist'),
    ('hr coordinator', 'hr assistant', 'people operations coordinator'),
    # ── Healthcare ────────────────────────────────────────────────────────────
    ('registered nurse', 'rn', 'staff nurse', 'clinical nurse'),
    ('licensed practical nurse', 'lpn', 'licensed vocational nurse', 'lvn'),
    ('nurse practitioner', 'np', 'advanced practice nurse', 'aprn'),
    ('physician', 'doctor', 'medical doctor', 'md', 'attending physician'),
    ('physician assistant', 'pa', 'pa-c'),
    ('medical assistant', 'clinical assistant', 'healthcare assistant'),
    ('pharmacist', 'clinical pharmacist', 'staff pharmacist'),
    ('pharmacy technician', 'pharm tech', 'pharmacy assistant'),
    ('physical therapist', 'physiotherapist', 'pt'),
    ('occupational therapist', 'ot'),
    ('radiologist', 'radiology technician', 'radiologic technologist', 'x-ray technician'),
    ('medical coder', 'medical billing specialist', 'coding specialist'),
    ('healthcare administrator', 'hospital administrator', 'clinic manager'),
    ('clinical research coordinator', 'crc', 'clinical trial coordinator'),
    ('mental health counselor', 'therapist', 'psychotherapist', 'counselor'),
    ('social worker', 'clinical social worker', 'case manager'),
    ('dentist', 'dental surgeon', 'general dentist'),
    ('dental hygienist', 'dental assistant'),
    # ── Legal ─────────────────────────────────────────────────────────────────
    ('lawyer', 'attorney', 'counsel', 'legal counsel', 'solicitor', 'advocate'),
    ('paralegal', 'legal assistant', 'legal secretary'),
    ('legal analyst', 'legal researcher', 'law clerk'),
    ('corporate lawyer', 'corporate attorney', 'corporate counsel'),
    ('litigation attorney', 'trial lawyer', 'litigator'),
    ('compliance lawyer', 'regulatory lawyer', 'compliance counsel'),
    ('contract manager', 'contracts manager', 'contract administrator'),
    # ── Operations / Supply Chain ─────────────────────────────────────────────
    ('operations manager', 'operations director', 'head of operations', 'ops manager'),
    ('supply chain manager', 'supply chain analyst', 'supply chain coordinator'),
    ('logistics manager', 'logistics coordinator', 'logistics specialist'),
    ('procurement manager', 'purchasing manager', 'sourcing manager', 'category manager'),
    ('warehouse manager', 'warehouse supervisor', 'distribution center manager'),
    ('inventory analyst', 'inventory manager', 'stock controller'),
    ('quality manager', 'quality control manager', 'quality assurance manager'),
    ('process improvement manager', 'continuous improvement manager', 'lean manager'),
    ('facilities manager', 'facility manager', 'building manager'),
    # ── Customer Service ──────────────────────────────────────────────────────
    ('customer service representative', 'customer service agent', 'customer support agent', 'csr'),
    ('customer success manager', 'csm', 'client success manager'),
    ('call center agent', 'call center representative', 'contact center agent'),
    ('help desk technician', 'it support specialist', 'technical support specialist'),
    ('customer experience manager', 'cx manager', 'client experience manager'),
    # ── Education ─────────────────────────────────────────────────────────────
    ('teacher', 'educator', 'instructor', 'faculty', 'lecturer'),
    ('professor', 'associate professor', 'assistant professor', 'adjunct professor'),
    ('school principal', 'headmaster', 'headmistress', 'school head'),
    ('curriculum developer', 'curriculum designer', 'instructional designer'),
    ('tutor', 'academic tutor', 'private tutor', 'learning coach'),
    ('special education teacher', 'sped teacher', 'special needs teacher'),
    ('school counselor', 'guidance counselor', 'academic advisor'),
    ('training coordinator', 'training manager', 'corporate trainer'),
    # ── Real Estate ───────────────────────────────────────────────────────────
    ('real estate agent', 'real estate broker', 'realtor', 'property agent'),
    ('property manager', 'property management specialist', 'asset manager'),
    ('leasing agent', 'leasing consultant', 'leasing manager'),
    ('real estate analyst', 'property analyst', 'real estate investment analyst'),
    # ── Hospitality / Food & Beverage ─────────────────────────────────────────
    ('hotel manager', 'general manager', 'hospitality manager'),
    ('front desk agent', 'front desk officer', 'receptionist', 'guest services agent'),
    ('restaurant manager', 'food and beverage manager', 'f&b manager'),
    ('chef', 'head chef', 'executive chef', 'sous chef'),
    ('bartender', 'bar manager', 'mixologist'),
    ('housekeeper', 'housekeeping supervisor', 'room attendant'),
    ('concierge', 'guest relations officer', 'guest experience specialist'),
    # ── Construction / Engineering ────────────────────────────────────────────
    ('civil engineer', 'structural engineer', 'geotechnical engineer'),
    ('mechanical engineer', 'mechanical design engineer'),
    ('electrical engineer', 'electrical design engineer'),
    ('project engineer', 'site engineer', 'construction engineer'),
    ('quantity surveyor', 'cost estimator', 'cost engineer'),
    ('architect', 'architectural designer', 'building designer'),
    ('site manager', 'construction manager', 'site supervisor'),
    ('health and safety officer', 'hse officer', 'safety officer', 'safety manager'),
    # ── Administrative / Office ───────────────────────────────────────────────
    ('administrative assistant', 'admin assistant', 'office assistant', 'secretary'),
    ('executive assistant', 'ea', 'personal assistant', 'pa'),
    ('office manager', 'office administrator', 'office coordinator'),
    ('data entry specialist', 'data entry clerk', 'data entry operator'),
    ('receptionist', 'front desk receptionist', 'office receptionist'),
    ('virtual assistant', 'va', 'remote assistant'),
]

# Flatten into a lookup: token → canonical group index
_ROLE_SYNONYM_MAP: Dict[str, int] = {}
for _gidx, _group in enumerate(_ROLE_SYNONYMS):
    for _term in _group:
        _ROLE_SYNONYM_MAP[_term.lower()] = _gidx


def _expand_keywords(keywords: List[str]) -> set:
    """
    Expand a list of job-title keywords with their synonym group members.
    Returns a flat set of all tokens that should be considered equivalent.
    """
    expanded: set = set()
    for kw in keywords:
        kw_lower = kw.lower()
        expanded.add(kw_lower)
        # Check if this keyword (or any multi-word phrase containing it) is in a group
        if kw_lower in _ROLE_SYNONYM_MAP:
            gidx = _ROLE_SYNONYM_MAP[kw_lower]
            for term in _ROLE_SYNONYMS[gidx]:
                expanded.add(term.lower())
    return expanded


def calculate_experience_keyword_match(
    resume_experience: List[Dict],
    min_years: Optional[float],
    job_title_keywords: List[str]
) -> float:
    """
    Calculate experience relevance using keyword + synonym matching.

    Improvements:
    - Accumulates total years across ALL experience entries.
    - Parses date-range formats ("2021-2024", "Jan 2020 – Mar 2023", "2019 to present").
    - Job-title keywords are expanded with synonym groups so "Software Engineer"
      matches "Software Developer", "ML Engineer" matches "Machine Learning Engineer", etc.
    - When min_years == 0 (fresh grad / no experience required), having no experience
      is not penalised — years_score is 100 for everyone since the requirement is met.

    Returns:
        Match score from 0-100
    """
    # When the job requires 0 years, no experience is needed — skip years penalty entirely.
    # Keyword score still applies so relevant experience is still rewarded.
    if not resume_experience:
        if min_years is not None and min_years == 0:
            # Job explicitly requires no experience — fresh grad fully meets the bar.
            years_score = 100.0
            keyword_score = 0.0  # no experience text to match keywords against
            combined = (years_score * 0.6) + (keyword_score * 0.4)
            print(f"[DEBUG] Experience: no experience, min_years=0 → years_score=100.0, combined={combined:.1f}")
            return round(combined, 2)
        # Job requires experience but resume has none — penalise fully.
        return 0.0

    # ── Years score ──────────────────────────────────────────────────────────
    total_years = sum(_parse_years_from_experience(exp) for exp in resume_experience)

    if min_years is not None:
        if min_years == 0:
            # No experience required — everyone meets the bar regardless of how much they have.
            years_score = 100.0
        elif total_years >= min_years:
            years_score = 100.0
        elif total_years > 0:
            years_score = min((total_years / min_years) * 100, 100.0)
        else:
            years_score = 0.0
    else:
        # min_years not set on job posting — reward having any experience.
        years_score = 100.0 if total_years > 0 else 50.0

    # ── Keyword score with synonym expansion ─────────────────────────────────
    if job_title_keywords:
        expanded_kw = _expand_keywords(job_title_keywords)
        all_exp_text = ' '.join(
            extract_experience_text([exp]).lower() for exp in resume_experience
        )
        # A keyword is matched if any synonym appears in the experience text
        # Use word-boundary check to avoid partial-word false positives
        matched_kw = 0
        for kw in job_title_keywords:
            kw_lower = kw.lower()
            # Collect all synonyms for this keyword
            if kw_lower in _ROLE_SYNONYM_MAP:
                gidx = _ROLE_SYNONYM_MAP[kw_lower]
                candidates = [t.lower() for t in _ROLE_SYNONYMS[gidx]]
            else:
                candidates = [kw_lower]
            # Match if any candidate appears as a whole word in the experience text
            for candidate in candidates:
                try:
                    if re.search(r'\b' + re.escape(candidate) + r'\b', all_exp_text):
                        matched_kw += 1
                        break
                except re.error:
                    if candidate in all_exp_text:
                        matched_kw += 1
                        break
        keyword_score = (matched_kw / len(job_title_keywords)) * 100
    else:
        keyword_score = 100.0

    # ── Combine: 60% years, 40% keyword relevance ────────────────────────────
    combined = (years_score * 0.6) + (keyword_score * 0.4)

    print(f"[DEBUG] Experience: total_years={total_years:.1f}, min_years={min_years}, "
          f"years_score={years_score:.1f}, keyword_score={keyword_score:.1f}, "
          f"combined={combined:.1f}")

    return round(combined, 2)


def calculate_projects_keyword_match(
    resume_projects: List[Dict],
    expected_projects: List[str],
    resume_experience: Optional[List[Dict]] = None,
    raw_resume_text: Optional[str] = None,
) -> float:
    """
    Calculate projects relevance using tighter keyword matching.

    Scans projects section, experience descriptions/bullets, AND raw resume
    text (fallback) so that project-type work described anywhere in the resume
    is not missed regardless of which parser was used.
    """
    if not expected_projects:
        return 50.0

    # Common stop words
    _STOP = {'and', 'the', 'for', 'with', 'using', 'based', 'related',
             'oriented', 'driven', 'focused', 'level', 'type', 'kind',
             'system', 'systems', 'application', 'applications', 'solution',
             'solutions', 'platform', 'service', 'services', 'tool', 'tools'}

    def significant_words(phrase: str) -> List[str]:
        words = []
        for token in phrase.split():
            w_lower = token.lower()
            is_acronym = len(token) >= 2 and token.isupper()
            if is_acronym or (len(w_lower) > 3 and w_lower not in _STOP):
                words.append(w_lower)
        return words

    all_project_texts = []

    # 1. Projects section
    for proj in (resume_projects or []):
        name    = str(proj.get('name')    or '').lower()
        details = str(proj.get('details') or proj.get('description') or '').lower()
        all_project_texts.append(f"{name} {details}")

    # 2. Experience section — handles both NER (summary) and GPT (bullets) formats
    for exp in (resume_experience or []):
        role    = str(exp.get('role')    or exp.get('title')       or '').lower()
        summary = str(exp.get('summary') or exp.get('description') or '').lower()
        bullets = exp.get('bullets') or exp.get('responsibilities') or []
        if isinstance(bullets, list):
            bullets_text = ' '.join(str(b) for b in bullets).lower()
        else:
            bullets_text = str(bullets).lower()
        all_project_texts.append(f"{role} {summary} {bullets_text}")
    # 3. Raw resume text fallback — catches anything the parser missed
    if raw_resume_text:
        all_project_texts.append(raw_resume_text.lower())

    if not any(t.strip() for t in all_project_texts):
        return 0.0

    combined_text = ' '.join(all_project_texts)

    matched_project_types: set = set()

    for expected in expected_projects:
        exp_norm = expected.lower()
        sig_words = significant_words(expected)

        if not sig_words:
            if exp_norm.replace(' ', '') in combined_text.replace(' ', '').replace('-', ''):
                matched_project_types.add(exp_norm)
            continue

        if len(sig_words) == 1:
            word = sig_words[0]
            try:
                if re.search(r'\b' + re.escape(word) + r'\b', combined_text):
                    matched_project_types.add(exp_norm)
            except re.error:
                if word in combined_text:
                    matched_project_types.add(exp_norm)
        else:
            if all(
                re.search(r'\b' + re.escape(w) + r'\b', combined_text)
                for w in sig_words
            ):
                matched_project_types.add(exp_norm)
            else:
                matched_count = sum(
                    1 for w in sig_words
                    if re.search(r'\b' + re.escape(w) + r'\b', combined_text)
                )
                if len(sig_words) >= 3 and matched_count / len(sig_words) >= 0.75:
                    matched_project_types.add(exp_norm)

    match_percentage = (len(matched_project_types) / len(expected_projects)) * 100

    print(f"[DEBUG] Projects match: {len(matched_project_types)}/{len(expected_projects)} = {match_percentage:.1f}%")
    print(f"[DEBUG]   Expected: {expected_projects}")
    print(f"[DEBUG]   Matched: {matched_project_types}")

    return round(match_percentage, 2)


def _normalize_degree(text: str) -> str:
    """Normalize degree abbreviations and common variants to a canonical form."""
    t = text.lower().strip()
    # Degree level normalization
    t = re.sub(r'\bb\.?\s*s\.?\b', 'bachelor of science', t)
    t = re.sub(r'\bb\.?\s*a\.?\b', 'bachelor of arts', t)
    t = re.sub(r'\bb\.?\s*e\.?\b', 'bachelor of engineering', t)
    t = re.sub(r'\bb\.?\s*tech\.?\b', 'bachelor of technology', t)
    t = re.sub(r'\bm\.?\s*s\.?\b', 'master of science', t)
    t = re.sub(r'\bm\.?\s*a\.?\b', 'master of arts', t)
    t = re.sub(r'\bm\.?\s*e\.?\b', 'master of engineering', t)
    t = re.sub(r'\bm\.?\s*tech\.?\b', 'master of technology', t)
    t = re.sub(r'\bm\.?\s*b\.?\s*a\.?\b', 'master of business administration', t)
    t = re.sub(r'\bph\.?\s*d\.?\b', 'doctor of philosophy', t)
    return t


def _degree_level(text: str) -> str:
    """Return a canonical degree level string from text."""
    t = text.lower()
    if any(w in t for w in ['doctor', 'phd', 'ph.d']):
        return 'doctorate'
    if any(w in t for w in ['master', 'msc', 'm.sc', 'mba', 'm.b.a']):
        return 'master'
    if any(w in t for w in ['bachelor', 'bsc', 'b.sc', 'bscs', 'bsit', 'bsece', 'bsee',
                             'bsme', 'bsie', 'bsba', 'bsn', 'bsed', 'bsmath', 'bsstat',
                             'bsphysics', 'bschem', 'bsacct', 'bsfinance', 'bshrm',
                             'bscs', 'bsit', 'bsis', 'bsece', 'bsee', 'bsme', 'bsie',
                             'b.s.', 'b.a.', 'b.e.', 'b.tech', 'ab ', 'a.b.']):
        return 'bachelor'
    if any(w in t for w in ['associate', 'a.a.', 'a.s.']):
        return 'associate'
    if any(w in t for w in ['diploma', 'certificate', 'vocational', 'tesda', 'nc ii', 'nc ii']):
        return 'diploma'
    return ''


def _extract_major(text: str) -> str:
    """Extract the field/major from an education requirement or degree string."""
    t = text.lower()
    # Strip common degree prefixes to isolate the major
    for prefix in [
        'bachelor of science in', 'bachelor of arts in', 'bachelor of engineering in',
        'bachelor of technology in', 'bachelor of business administration in',
        'master of science in', 'master of arts in', 'master of engineering in',
        'master of technology in', 'master of business administration',
        'doctor of philosophy in', 'bachelor in', 'master in',
        'bs ', 'ba ', 'ms ', 'ma ', 'mba', 'phd',
    ]:
        if prefix in t:
            t = t.replace(prefix, '').strip()
    return t.strip()


def calculate_education_keyword_match(
    resume_education: List[Dict],
    required_education: List[str]
) -> float:
    """
    Calculate education relevance using keyword matching with exact-degree detection.

    Returns 100.0 when the applicant's parsed education contains an exact (or
    strongly equivalent) match for ANY of the required/accepted degrees.
    Falls back to partial keyword scoring when no exact match is found.

    Args:
        resume_education: List of education entries from resume
        required_education: List of required education strings from job posting

    Returns:
        Match score from 0-100 (100 = full match)
    """
    if not required_education:
        return 50.0  # No requirements, give half credit

    if not resume_education:
        return 0.0

    # ------------------------------------------------------------------ #
    # Build a flat list of normalised strings from the applicant's resume  #
    # ------------------------------------------------------------------ #
    resume_edu_texts = []
    for edu in resume_education:
        school = str(edu.get('school') or '').lower()
        course = (edu.get('course') or edu.get('course_or_strand') or '').lower()
        degree = str(edu.get('degree') or '').lower()
        edu_type = str(edu.get('education_type') or '').lower()
        combined = f"{school} {course} {degree} {edu_type}".strip()
        resume_edu_texts.append({
            'raw': combined,
            'normalized': _normalize_degree(combined),
            'degree_level': _degree_level(combined),
            'major': _extract_major(course or degree),
        })

    # ------------------------------------------------------------------ #
    # Phase 1 – Exact / full match check (returns 100 immediately)        #
    # ------------------------------------------------------------------ #
    for req in required_education:
        req_norm = _normalize_degree(req)
        req_level = _degree_level(req)
        req_major = _extract_major(req)

        for edu in resume_edu_texts:
            # 1a. The full normalised requirement string appears in the resume text
            if req_norm and req_norm in edu['normalized']:
                print(f"[EDUCATION] Full match (substring): '{req}' found in '{edu['raw']}'")
                return 100.0

            # 1b. Degree level AND major both match
            if req_level and req_major:
                level_match = (req_level == edu['degree_level'])
                major_match = req_major and edu['major'] and (
                    req_major in edu['major'] or edu['major'] in req_major
                )
                if level_match and major_match:
                    print(f"[EDUCATION] Full match (level+major): level='{req_level}' major='{req_major}'")
                    return 100.0

            # 1c. Degree level matches and requirement has no specific major
            if req_level and not req_major and edu['degree_level'] == req_level:
                print(f"[EDUCATION] Full match (level only, no major required): '{req_level}'")
                return 100.0

    # ------------------------------------------------------------------ #
    # Phase 2 – Partial / keyword fallback (original logic)               #
    # ------------------------------------------------------------------ #
    matched_edu = set()

    for edu in resume_edu_texts:
        edu_text = edu['raw']
        degree = edu['degree_level']

        for req in required_education:
            req_normalized = req.lower()

            # Direct substring match
            if req_normalized in edu_text:
                matched_edu.add(req_normalized)
                continue

            # Degree-type keyword fallback
            if 'bachelor' in req_normalized:
                if any(k in edu_text for k in ['bachelor', 'bs ', 'ba ', 'b.s', 'b.a']):
                    matched_edu.add(req_normalized)
            elif 'master' in req_normalized:
                if any(k in edu_text for k in ['master', 'ms ', 'ma ', 'm.s', 'm.a']):
                    matched_edu.add(req_normalized)
            elif 'computer' in req_normalized:
                if 'computer' in edu_text:
                    matched_edu.add(req_normalized)
            elif 'science' in req_normalized:
                if 'science' in edu_text:
                    matched_edu.add(req_normalized)
            elif 'engineering' in req_normalized:
                if 'engineering' in edu_text:
                    matched_edu.add(req_normalized)
            elif 'information technology' in req_normalized or ' it' in req_normalized:
                if any(k in edu_text for k in ['information technology', 'bsit', 'bs it']):
                    matched_edu.add(req_normalized)

    match_percentage = (len(matched_edu) / len(required_education)) * 100 if required_education else 0

    print(f"[DEBUG] Education match: {len(matched_edu)}/{len(required_education)} = {match_percentage:.1f}%")
    print(f"[DEBUG]   Required: {required_education}")
    print(f"[DEBUG]   Matched: {matched_edu}")
    print(f"[DEBUG]   Resume edu: {resume_education}")

    return round(match_percentage, 2)


def calculate_component_scores(
    parsed_resume_json: Dict,
    job_posting: Dict
) -> Dict[str, float]:
    """
    Calculate relevance scores for each resume component vs job requirements.
    NOW USES KEYWORD MATCHING instead of BERT string similarity!
    
    Args:
        parsed_resume_json: Parsed resume data dictionary
        job_posting: Job posting data dictionary
    
    Returns:
        Dictionary with relevance scores (0-100) for each component
    """
    # Get job requirements properly
    job_skills_list = parse_jsonb_field(job_posting.get('skills', []))
    job_edu_list = parse_jsonb_field(job_posting.get('required_education', []))
    job_projects_list = parse_jsonb_field(job_posting.get('expected_projects', []))
    min_years = job_posting.get('min_years_experience')
    
    # Try to get keywords from job title
    job_title = job_posting.get('title', '')
    job_title_keywords = [w for w in re.findall(r'\w+', job_title.lower()) if len(w) > 2] if job_title else []
    
    print(f"[DEBUG] Job skills: {job_skills_list}")
    print(f"[DEBUG] Job education: {job_edu_list}")
    print(f"[DEBUG] Job projects: {job_projects_list}")
    print(f"[DEBUG] Min years: {min_years}")
    print(f"[DEBUG] Job title keywords: {job_title_keywords}")
    
    results = {}
    
    # Skills relevance - NOW USES KEYWORD MATCHING
    resume_skills = parsed_resume_json.get('skills', {})
    resume_experience_for_skills = parsed_resume_json.get('experience', [])
    results['skills_relevance'] = calculate_skills_keyword_match(
        resume_skills=resume_skills,
        job_skills=job_skills_list,
        resume_experience=resume_experience_for_skills
    )
    
    # Experience relevance - NOW USES KEYWORD MATCHING
    resume_experience = parsed_resume_json.get('experience', [])
    results['experience_relevance'] = calculate_experience_keyword_match(
        resume_experience=resume_experience,
        min_years=float(min_years) if min_years else None,
        job_title_keywords=job_title_keywords
    )
    
    # Education relevance - NOW USES KEYWORD MATCHING
    resume_education = parsed_resume_json.get('education', [])
    results['education_relevance'] = calculate_education_keyword_match(
        resume_education=resume_education,
        required_education=job_edu_list
    )
    
    # Projects relevance - NOW USES KEYWORD MATCHING
    resume_projects = parsed_resume_json.get('projects', [])
    # Build raw text fallback from summary + skills sections for parsers that
    # don't populate experience bullets (e.g. BERT NER with unusual formatting)
    raw_fallback_parts = []
    if parsed_resume_json.get('summary'):
        raw_fallback_parts.append(str(parsed_resume_json['summary']))
    skills_raw = parsed_resume_json.get('skills', {})
    if isinstance(skills_raw, dict):
        for v in skills_raw.values():
            if isinstance(v, list):
                raw_fallback_parts.extend(str(s) for s in v)
            elif isinstance(v, str):
                raw_fallback_parts.append(v)
    elif isinstance(skills_raw, list):
        raw_fallback_parts.extend(str(s) for s in skills_raw)
    raw_fallback = ' '.join(raw_fallback_parts) if raw_fallback_parts else None

    results['projects_relevance'] = calculate_projects_keyword_match(
        resume_projects=resume_projects,
        expected_projects=job_projects_list,
        resume_experience=resume_experience,
        raw_resume_text=raw_fallback
    )
    
    print(f"[DEBUG] Final component scores: {results}")
    
    return results


def calculate_weighted_score(
    component_scores: Dict[str, float],
    weights: Dict[str, float]
) -> float:
    """
    Calculate weighted score using company-configurable weights.
    
    Args:
        component_scores: Dictionary with relevance scores for each component
            {
                'experience_relevance': 95.0,
                'skills_relevance': 88.0,
                'education_relevance': 98.0,
                'projects_relevance': 85.0
            }
        weights: Dictionary with weights (0-100) for each component
            {
                'experience_weight': 40,
                'skills_weight': 30,
                'education_weight': 20,
                'projects_weight': 10
            }
    
    Returns:
        Weighted score (0-100)
    """
    # Convert weights from percentage to decimal
    exp_w = weights.get('experience_weight', 40) / 100
    skills_w = weights.get('skills_weight', 30) / 100
    edu_w = weights.get('education_weight', 20) / 100
    proj_w = weights.get('projects_weight', 10) / 100
    
    # Get scores (default to 0 if not present)
    exp_score = component_scores.get('experience_relevance', 0)
    skills_score = component_scores.get('skills_relevance', 0)
    edu_score = component_scores.get('education_relevance', 0)
    proj_score = component_scores.get('projects_relevance', 0)
    
    # Calculate weighted score
    weighted_score = (
        exp_score * exp_w +
        skills_score * skills_w +
        edu_score * edu_w +
        proj_score * proj_w
    )
    
    return round(weighted_score, 2)


def calculate_hybrid_job_fit_score(
    parsed_resume_json: Dict,
    job_posting: Dict,
    weights: Optional[Dict[str, float]] = None,
    include_breakdown: bool = True
) -> Dict[str, Any]:
    """
    Calculate hybrid job fit score using semantic relevance and company weights.
    This is the main function for company-adaptable scoring!
    
    Args:
        parsed_resume_json: Parsed resume data from GPT extractor
            {
                "experience": [...],
                "skills": {...},
                "education": [...],
                "projects": [...]
            }
        job_posting: Job posting data
            {
                "job_id": "...",
                "title": "...",
                "description": "...",
                "skills": [...],
                "required_education": [...],
                "expected_projects": [...],
                "min_years_experience": 5
            }
        weights: Optional weights for scoring (from scoring_settings)
            {
                "experience_weight": 40,
                "skills_weight": 30,
                "education_weight": 20,
                "projects_weight": 10
            }
        include_breakdown: Whether to include component breakdown in result
    
    Returns:
        Dictionary with:
            - semantic_score: Overall weighted score (0-100)
            - component_scores: Individual relevance scores
            - weights_used: The weights applied
            - fit_category: Category based on score
    """
    # Default weights if not provided
    if weights is None:
        weights = {
            'experience_weight': 40,
            'skills_weight': 30,
            'education_weight': 20,
            'projects_weight': 10
        }
    
    # Calculate component relevance scores using semantic matching
    component_scores = calculate_component_scores(parsed_resume_json, job_posting)
    
    # Calculate weighted score
    weighted_score = calculate_weighted_score(component_scores, weights)
    
    # Determine fit category
    if weighted_score >= 80:
        fit_category = "Excellent Fit"
    elif weighted_score >= 60:
        fit_category = "Good Fit"
    elif weighted_score >= 40:
        fit_category = "Moderate Fit"
    else:
        fit_category = "Low Fit"
    
    # Build result
    result = {
        "job_id": job_posting.get('job_id'),
        "semantic_score": weighted_score,
        "fit_category": fit_category,
        "weights_used": weights,
        "status": "success"
    }
    
    # Include breakdown if requested
    if include_breakdown:
        result["component_scores"] = {
            "experience": component_scores.get('experience_relevance', 0),
            "skills": component_scores.get('skills_relevance', 0),
            "education": component_scores.get('education_relevance', 0),
            "projects": component_scores.get('projects_relevance', 0)
        }
    
    return result


def get_supabase_client():
    """
    Get Supabase client for database operations.
    
    Returns:
        Supabase client instance
    """
    try:
        from supabase import create_client, Client
        
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise ValueError("Supabase credentials not configured")
        
        client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        return client
        
    except ImportError as e:
        raise ImportError(f"Missing supabase library: {e}. Run: pip install supabase>=2.3.0")


def fetch_jobs_from_database(
    limit: int = 100,
    department: Optional[str] = None,
    active_only: bool = True
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from Supabase job_postings table.
    
    Args:
        limit: Maximum number of jobs to fetch
        department: Optional filter by department
        active_only: Whether to fetch only active jobs
        
    Returns:
        List of job dictionaries
    """
    try:
        client = get_supabase_client()
        
        # Build query
        query = client.table("job_postings").select(
            "job_id, title, description, department, skills, keywords"
        )
        
        # Apply filters
        if active_only:
            query = query.eq("is_active", True)
        
        if department:
            query = query.eq("department", department)
        
        # Execute query with limit
        response = query.limit(limit).execute()
        
        if hasattr(response, 'data'):
            return response.data
        return []
        
    except Exception as e:
        print(f"Error fetching jobs from database: {e}")
        return []


def recommend_jobs(
    resume_text: str,
    limit: int = 5,
    department: Optional[str] = None,
    fetch_from_db: bool = True,
    jobs: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Recommend top N matching jobs for a given resume.
    
    Args:
        resume_text: Parsed resume text
        limit: Number of recommendations to return (default 5)
        department: Optional filter by department
        fetch_from_db: Whether to fetch jobs from database (default True)
        jobs: Optional list of job dictionaries (if not fetching from DB)
        
    Returns:
        List of jobs sorted by match score (highest first) with full details
    """
    # Get jobs list - prioritize jobs parameter if provided
    if jobs:
        job_list = jobs
    elif fetch_from_db:
        job_list = fetch_jobs_from_database(limit=100, department=department)
    else:
        print("Error: Either fetch_from_db=True or provide jobs list")
        return []
    
    if not job_list:
        return []
    
    scored_jobs = []
    
    for job in job_list:
        job_desc = job.get("description", "")
        
        # Skip jobs without descriptions
        if not job_desc or not job_desc.strip():
            continue
        
        # Calculate job fit score
        result = calculate_job_fit_score(
            resume_text=resume_text,
            job_description=job_desc,
            job_id=job.get("job_id")
        )
        
        scored_jobs.append({
            "job_id": job.get("job_id"),
            "title": job.get("title"),
            "department": job.get("department"),
            "skills": job.get("skills", []),
            "keywords": job.get("keywords", []),
            "semantic_score": result["semantic_score"],
            "raw_similarity": result["raw_similarity"],
            "fit_category": result["fit_category"],
            "confidence": result["confidence"],
            "confidence_label": result["confidence_label"],
            "score_quality": result["score_quality"],
        })
    
    # Sort by score (descending)
    scored_jobs.sort(key=lambda x: x["semantic_score"], reverse=True)
    
    # Return top N results
    return scored_jobs[:limit]


def test_model():
    """
    Test the model with sample data to verify it's working.
    """
    print("\n" + "="*60)
    print("Testing Enhanced Job Alignment Model (Stage 2)")
    print("="*60)
    
    # Sample resume
    sample_resume = """
    Python Developer with 3 years of experience in web development.
    Skills: Python, Django, Flask, PostgreSQL, Docker, AWS, Git.
    Experience building REST APIs and microservices.
    Bachelor's degree in Computer Science.
    """
    
    # Sample job descriptions
    job1 = """
    Senior Python Developer position. Requirements:
    - 3+ years Python experience
    - Django or Flask framework
    - Database: PostgreSQL or MySQL
    - Cloud platforms (AWS preferred)
    - REST API development
    """
    
    job2 = """
    Marketing Manager position. Requirements:
    - 5+ years marketing experience
    - Social media management
    - Content creation
    - SEO and analytics
    - Team leadership
    """
    
    print("\nSample Resume:")
    print(sample_resume[:100] + "...")
    
    # Test 1: Semantic Similarity with confidence
    print("\n" + "-"*40)
    print("Test 1: calculate_semantic_similarity()")
    print("-"*40)
    
    sim_result = calculate_semantic_similarity(sample_resume, job1)
    print(f"  Similarity: {sim_result['similarity']}")
    print(f"  Confidence: {sim_result['confidence']}")
    print(f"  Status: {sim_result['status']}")
    
    # Test 2: Job Fit Score with breakdown
    print("\n" + "-"*40)
    print("Test 2: calculate_job_fit_score() with job_id")
    print("-"*40)
    
    result1 = calculate_job_fit_score(
        resume_text=sample_resume,
        job_description=job1,
        job_id="JOB_PYTHON_001"
    )
    print(f"  Job ID: {result1['job_id']}")
    print(f"  Score: {result1['semantic_score']}/100")
    print(f"  Category: {result1['fit_category']}")
    print(f"  Confidence: {result1['confidence']} ({result1['confidence_label']})")
    print(f"  Score Quality: {result1['score_quality']}")
    
    print("\nTest 2b: Python Developer Resume vs Marketing Manager Job")
    result2 = calculate_job_fit_score(
        resume_text=sample_resume,
        job_description=job2,
        job_id="JOB_MARKETING_001"
    )
    print(f"  Score: {result2['semantic_score']}/100")
    print(f"  Category: {result2['fit_category']}")
    print(f"  Confidence: {result2['confidence']}")
    
    # Test 3: Edge cases
    print("\n" + "-"*40)
    print("Test 3: Edge Cases")
    print("-"*40)
    
    # Empty text
    edge_result = calculate_semantic_similarity("", job1)
    print(f"  Empty first text: {edge_result['status']} - {edge_result.get('message', '')}")
    
    # Very short text
    edge_result2 = calculate_semantic_similarity("Python", job1)
    print(f"  Short text: {edge_result2['status']} - {edge_result2.get('message', '')}")
    
    # Test 4: Preprocessing
    print("\n" + "-"*40)
    print("Test 4: Text Preprocessing")
    print("-"*40)
    
    raw_text = "  PYTHON   DEVELOPER  with   3+ years  "
    processed = preprocess_text(raw_text)
    print(f"  Raw: '{raw_text}'")
    print(f"  Processed: '{processed}'")
    
    # Test 5: recommend_jobs with mock data
    print("\n" + "-"*40)
    print("Test 5: recommend_jobs() with mock data")
    print("-"*40)
    
    mock_jobs = [
        {
            "job_id": "JOB_PYTHON_001",
            "title": "Senior Python Developer",
            "description": job1,
            "department": "Engineering",
            "skills": ["Python", "Django", "AWS"],
            "keywords": ["backend", "api", "cloud"]
        },
        {
            "job_id": "JOB_MARKETING_001",
            "title": "Marketing Manager",
            "description": job2,
            "department": "Marketing",
            "skills": ["SEO", "Social Media"],
            "keywords": ["marketing", "content"]
        }
    ]
    
    recommendations = recommend_jobs(
        resume_text=sample_resume,
        limit=5,
        fetch_from_db=False,
        jobs=mock_jobs
    )
    
    print(f"  Found {len(recommendations)} recommendations:")
    for i, job in enumerate(recommendations, 1):
        print(f"  {i}. {job['title']} (Score: {job['semantic_score']}, Confidence: {job['confidence_label']})")
    
    print("\n" + "="*60)
    print("Model test complete!")
    print("="*60)
    
    # Verify expected behavior
    if result1['semantic_score'] > result2['semantic_score']:
        print("[PASS] Python job scored higher than Marketing job")
    else:
        print("[WARN] Unexpected scoring results")
    
    if recommendations[0]['job_id'] == "JOB_PYTHON_001":
        print("[PASS] Correct job recommended as top match")
    
    return result1, result2, recommendations


# ============================================
# NEW HYBRID SCORING FUNCTIONS (6-Category)
# Implemented per SCORING_DOCUMENTATION.md
# ============================================


def calculate_traincert_keyword_match(
    resume_traincerts: List[Dict],
    job_traincerts: List[str]
) -> float:
    """
    Calculate trainings & certifications match using keyword matching.

    Returns 50 (neutral) when the job has no requirements — traincerts are
    commonly listed on job postings so a neutral score is appropriate.
    Returns 0 when the job has requirements but the resume has none.
    Uses word-boundary matching to avoid false positives.
    """
    if not job_traincerts:
        return 50.0  # No requirements — neutral credit

    if not resume_traincerts:
        return 0.0

    # Extract training/certification names from resume
    resume_tcert_names = []
    for tc in resume_traincerts:
        if isinstance(tc, dict):
            name = tc.get('name', '') or tc.get('title', '') or tc.get('certification', '')
            if name:
                resume_tcert_names.append(normalize_skill(name))
        elif isinstance(tc, str):
            resume_tcert_names.append(normalize_skill(tc))

    if not resume_tcert_names:
        return 0.0

    required_tc = [normalize_skill(s) for s in job_traincerts if s]
    matched_tc: set = set()

    for req in required_tc:
        for res in resume_tcert_names:
            # Exact match
            if req == res:
                matched_tc.add(req)
                break
            # Word-boundary containment (both sides must be >= 4 chars)
            if len(req) >= 4 and len(res) >= 4:
                try:
                    if re.search(r'\b' + re.escape(req) + r'\b', res) or \
                       re.search(r'\b' + re.escape(res) + r'\b', req):
                        matched_tc.add(req)
                        break
                except re.error:
                    pass

    match_percentage = (len(matched_tc) / len(required_tc)) * 100 if required_tc else 0
    return round(match_percentage, 2)


def get_job_level_preset(job_level: str = None) -> Dict[str, Any]:
    """
    Get the unified scoring profile for all applicants.
    
    NOTE: This function always returns the UNIFIED_SCORING_PROFILE.
    The job_level parameter is kept for backward compatibility but is ignored.
    
    Args:
        job_level: Deprecated parameter (kept for backward compatibility)
    
    Returns:
        Dictionary with unified weights, baselines, and thresholds
    """
    # Always return unified scoring profile - no more level-based differentiation
    return UNIFIED_SCORING_PROFILE


def get_unified_scoring_profile() -> Dict[str, Any]:
    """
    Get the unified scoring profile directly.
    
    This function provides direct access to the unified scoring profile
    that is used for all applicants regardless of their detected career level.
    
    Returns:
        Dictionary with weights, baselines, and thresholds for unified scoring
    """
    return UNIFIED_SCORING_PROFILE


def calculate_requirement_match_score(
    parsed_resume_json: Dict,
    job_posting: Dict,
    weights: Optional[Dict[str, float]] = None,
    job_level: str = None
) -> Dict[str, Any]:
    """
    Calculate the Requirement Match Score (60% of final score).
    This measures how well resume content aligns with job requirements
    across 6 categories: experience, skills, education, projects, traincert.
    
    NOTE: This function now uses UNIFIED scoring for all applicants.
    The job_level parameter is deprecated and ignored.
    
    Args:
        parsed_resume_json: Parsed resume data
        job_posting: Job posting data with requirements
        weights: Optional custom weights (if None, uses unified profile)
        job_level: Deprecated parameter - kept for backward compatibility only
    
    Returns:
        Dictionary with requirement_match_score and breakdown
    """
    # Get unified weights if not provided
    if weights is None:
        unified_profile = get_unified_scoring_profile()
        weights = unified_profile['weights']
    
    # Extract resume data
    resume_skills = parsed_resume_json.get('skills', {})
    resume_experience = parsed_resume_json.get('experience', [])
    resume_education = parsed_resume_json.get('education', [])
    resume_projects = parsed_resume_json.get('projects', [])
    resume_traincerts = parsed_resume_json.get('trainings', []) + parsed_resume_json.get('certifications', [])

    # Normalize resume_skills: resume_parser returns a flat list, GPT extractor returns a dict.
    # calculate_skills_keyword_match expects a dict with an 'all' key (or hard_skills/soft_skills).
    if isinstance(resume_skills, list):
        resume_skills = {'all': resume_skills, 'hard_skills': resume_skills, 'soft_skills': []}
    
    # Extract job requirements
    job_skills = job_posting.get('skills', [])
    job_min_years = job_posting.get('min_years_experience')
    job_title_keywords = job_posting.get('keywords', [])
    job_education = job_posting.get('required_education', [])
    job_projects = job_posting.get('expected_projects', [])
    job_traincerts = job_posting.get('preferred_certifications', [])

    def _ensure_list(val) -> list:
        """Normalize a DB field that may be a list, a JSON string, or a comma-separated string.
        Supabase jsonb columns can arrive as a Python list, a JSON-encoded string, or a
        plain comma-separated string depending on how the row was inserted."""
        if not val:
            return []
        if isinstance(val, list):
            return [str(v).strip() for v in val if str(v).strip()]
        if isinstance(val, str):
            stripped = val.strip()
            if stripped.startswith('['):
                try:
                    import json as _json
                    parsed = _json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(v).strip() for v in parsed if str(v).strip()]
                except Exception:
                    pass
            return [s.strip() for s in stripped.split(',') if s.strip()]
        return []

    job_skills      = _ensure_list(job_skills)
    job_title_keywords = _ensure_list(job_title_keywords)
    job_education   = _ensure_list(job_education)
    job_projects    = _ensure_list(job_projects)
    job_traincerts  = _ensure_list(job_traincerts)

    # Calculate individual category matches
    experience_match = calculate_experience_keyword_match(
        resume_experience, job_min_years, job_title_keywords
    )
    skills_result = calculate_skills_keyword_match(
        resume_skills, job_skills,
        resume_experience=resume_experience
    )
    skills_match = skills_result['score']
    education_match = calculate_education_keyword_match(resume_education, job_education)

    # Build raw text fallback from summary + skills for parsers that don't
    # populate experience bullets (e.g. BERT NER with unusual section formatting)
    _raw_parts = []
    if parsed_resume_json.get('summary'):
        _raw_parts.append(str(parsed_resume_json['summary']))
    _skills_raw = parsed_resume_json.get('skills', {})
    if isinstance(_skills_raw, dict):
        for _v in _skills_raw.values():
            if isinstance(_v, list):
                _raw_parts.extend(str(s) for s in _v)
            elif isinstance(_v, str):
                _raw_parts.append(_v)
    elif isinstance(_skills_raw, list):
        _raw_parts.extend(str(s) for s in _skills_raw)
    _raw_fallback = ' '.join(_raw_parts) if _raw_parts else None

    projects_match = calculate_projects_keyword_match(
        resume_projects, job_projects, resume_experience, _raw_fallback
    )
    traincert_match = calculate_traincert_keyword_match(resume_traincerts, job_traincerts)

    # Calculate weighted requirement match score (5 categories, no achievements)
    requirement_match_score = (
        experience_match * (weights.get('experience_weight', 30) / 100) +
        skills_match     * (weights.get('skills_weight',     30) / 100) +
        education_match  * (weights.get('education_weight',  20) / 100) +
        projects_match   * (weights.get('projects_weight',   10) / 100) +
        traincert_match  * (weights.get('traincert_weight',  10) / 100)
    )

    return {
        'requirement_match_score': round(requirement_match_score, 2),
        'breakdown': {
            'experience': round(experience_match, 2),
            'skills':     round(skills_match, 2),
            'education':  round(education_match, 2),
            'projects':   round(projects_match, 2),
            'traincert':  round(traincert_match, 2),
        },
        'matched_skills': skills_result.get('matched', []),
        'missing_skills': skills_result.get('missing', []),
        'weights_used': weights
    }


def calculate_category_count_score(
    parsed_resume_json: Dict,
    baselines: Optional[Dict[str, float]] = None,
    job_level: str = None,
    job_posting: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Calculate the Count Score (40% of final score).
    This measures whether the applicant meets the expected baseline quantity
    for each of the 6 categories.

    Education fix: when a job_posting is supplied the education count-score is
    replaced by the degree-match score (same logic as the requirement-match side)
    so that a single perfectly-matching degree is not penalised for not having
    two education entries.

    NOTE: This function now uses UNIFIED scoring for all applicants.
    The job_level parameter is deprecated and ignored.
    """
    # Get unified baselines if not provided
    if baselines is None:
        unified_profile = get_unified_scoring_profile()
        baselines = unified_profile['baselines']

    # Get category counts from resume
    experience_list = parsed_resume_json.get('experience', [])
    skills_raw = parsed_resume_json.get('skills', {})

    # Handle skills - can be dict or list
    if isinstance(skills_raw, dict):
        if 'hard_skills' in skills_raw and 'soft_skills' in skills_raw:
            skills_dict = skills_raw
            skills_count = len(skills_dict.get('hard_skills', [])) + len(skills_dict.get('soft_skills', []))
        else:
            all_skills = []
            for key, value in skills_raw.items():
                if isinstance(value, str):
                    skills_list = [s.strip() for s in value.split(',')]
                    all_skills.extend(skills_list)
                elif isinstance(value, list):
                    all_skills.extend(value)
            skills_count = len(all_skills)
    elif isinstance(skills_raw, list):
        skills_count = len(skills_raw)
    else:
        skills_count = 0

    education_list = parsed_resume_json.get('education', [])
    project_list = parsed_resume_json.get('projects', [])
    traincert_list = parsed_resume_json.get('trainings', []) + parsed_resume_json.get('certifications', [])

    # Count items in each category
    experience_count = len(experience_list)
    education_count = len(education_list)
    projects_count = len(project_list)
    traincert_count = len(traincert_list)

    # Calculate category count scores (capped at 100)
    baseline_skills = baselines.get('baseline_skills', 10)
    baseline_edu    = baselines.get('baseline_education', 2)
    baseline_proj   = baselines.get('baseline_projects', 2)
    baseline_tc     = baselines.get('baseline_traincert', 2)

    skills_count_score   = min((skills_count   / baseline_skills) * 100, 100) if baseline_skills > 0 else 0
    projects_count_score = min((projects_count / baseline_proj)   * 100, 100) if baseline_proj   > 0 else 0
    traincert_count_score= min((traincert_count/ baseline_tc)     * 100, 100) if baseline_tc     > 0 else 0

    # Experience count score: driven by the job posting's min_years (same source of
    # truth as the requirement-match side). baseline_experience is no longer used.
    if job_posting is not None:
        job_min_years      = job_posting.get('min_years_experience')
        job_title_keywords = parse_jsonb_field(job_posting.get('keywords', []))
        experience_count_score = calculate_experience_keyword_match(
            experience_list, job_min_years, job_title_keywords
        )
    else:
        experience_count_score = 0.0

    # Education count score: use degree-match when job_posting is available so
    # that a single perfectly-matching degree is not penalised for count < baseline.
    if job_posting is not None:
        job_education = job_posting.get('required_education', [])
        job_edu_list  = parse_jsonb_field(job_education)
        education_count_score = calculate_education_keyword_match(education_list, job_edu_list)
    else:
        education_count_score = min((education_count / baseline_edu) * 100, 100) if baseline_edu > 0 else 0

    # Get weights (same as requirement match)
    preset  = get_job_level_preset(job_level)
    weights = preset['weights']

    # Calculate weighted count score (5 categories, no achievements)
    count_score = (
        experience_count_score * (weights.get('experience_weight', 30) / 100) +
        skills_count_score     * (weights.get('skills_weight',     30) / 100) +
        education_count_score  * (weights.get('education_weight',  20) / 100) +
        projects_count_score   * (weights.get('projects_weight',   10) / 100) +
        traincert_count_score  * (weights.get('traincert_weight',  10) / 100)
    )

    return {
        'count_score': round(count_score, 2),
        'breakdown': {
            'experience': {'count': experience_count, 'score': round(experience_count_score, 2)},
            'skills':     {'count': skills_count,     'score': round(skills_count_score,     2)},
            'education':  {'count': education_count,  'score': round(education_count_score,  2)},
            'projects':   {'count': projects_count,   'score': round(projects_count_score,   2)},
            'traincert':  {'count': traincert_count,  'score': round(traincert_count_score,  2)},
        },
        'baselines_used': baselines
    }


def calculate_final_hybrid_score(
    parsed_resume_json: Dict,
    job_posting: Dict,
    weights: Optional[Dict[str, float]] = None,
    baselines: Optional[Dict[str, float]] = None,
    requirement_weight: float = 0.6,
    count_weight: float = 0.4,
    qualified_threshold: Optional[float] = None,
    review_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calculate the final hybrid score using unified scoring for ALL applicants.
    No special treatment based on job level - all applicants are scored equally.
    
    FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
    
    Args:
        parsed_resume_json: Parsed resume data
        job_posting: Job posting data
        weights: Optional custom weights (optional overrides)
        baselines: Optional custom baselines (optional overrides)
        requirement_weight: Weight for requirement match (default 0.6)
        count_weight: Weight for count score (default 0.4)
    
    Returns:
        Dictionary with final_score, requirement_match_score, count_score,
        decision, and detailed breakdown
    """
    # Always use unified scoring profile for ALL applicants
    unified_profile = get_unified_scoring_profile()
    
    # Use unified thresholds from parameters, or fall back to hardcoded profile values
    # These can be overridden by passing qualified_threshold and review_threshold parameters
    if qualified_threshold is None:
        qualified_threshold = unified_profile['thresholds']['qualified_threshold']
    if review_threshold is None:
        review_threshold = unified_profile['thresholds']['review_threshold']
    
    # Allow HR-configured thresholds to override unified defaults
    if weights:
        if weights.get('qualified_threshold') is not None:
            qualified_threshold = weights['qualified_threshold']
        if weights.get('review_threshold') is not None:
            review_threshold = weights['review_threshold']
    
    # Use unified weights unless custom weights provided
    scoring_weights = weights if weights else unified_profile['weights'].copy()
    
    # Use unified baselines unless custom baselines provided
    scoring_baselines = baselines if baselines else unified_profile['baselines'].copy()
    
    # Calculate Requirement Match Score (60%)
    requirement_result = calculate_requirement_match_score(
        parsed_resume_json=parsed_resume_json,
        job_posting=job_posting,
        weights=scoring_weights
    )
    
    # Calculate Count Score (40%)
    count_result = calculate_category_count_score(
        parsed_resume_json=parsed_resume_json,
        baselines=scoring_baselines,
        job_posting=job_posting
    )
    
    # Calculate final score
    final_score = (
        requirement_result['requirement_match_score'] * requirement_weight +
        count_result['count_score'] * count_weight
    )
    
    # Determine decision based on unified thresholds
    if final_score >= qualified_threshold:
        decision = 'qualified'
    elif final_score >= review_threshold:
        decision = 'needs_review'
    else:
        decision = 'not_recommended'
    
    return {
        'final_score': round(final_score, 2),
        'requirement_match_score': requirement_result['requirement_match_score'],
        'count_score': count_result['count_score'],
        'requirement_weight': requirement_weight,
        'count_weight': count_weight,
        'decision': decision,
        'thresholds': {
            'qualified_threshold': qualified_threshold,
            'review_threshold': review_threshold
        },
        'scoring_type': 'unified',
        'requirement_breakdown': requirement_result['breakdown'],
        'count_breakdown': count_result['breakdown'],
        'matched_skills': requirement_result.get('matched_skills', []),
        'missing_skills': requirement_result.get('missing_skills', []),
        'status': 'success'
    }


if __name__ == "__main__":
    # Run tests when executed directly
    test_model()
