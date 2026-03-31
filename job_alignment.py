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
    'experience_weight': 28,
    'skills_weight': 30,
    'education_weight': 18,
    'projects_weight': 14,
    'traincert_weight': 6,
    'achievements_weight': 4
}

# Default baselines for hybrid scoring (UNIFIED - used for all applicants)
DEFAULT_HYBRID_BASELINES = {
    'baseline_experience': 2,
    'baseline_skills': 10,
    'baseline_education': 2,
    'baseline_projects': 2,
    'baseline_traincert': 2,
    'baseline_achievements': 1
}

# Unified scoring profile - used for ALL applicants (no special treatment)
UNIFIED_SCORING_PROFILE = {
    'weights': DEFAULT_HYBRID_WEIGHTS.copy(),
    'baselines': DEFAULT_HYBRID_BASELINES.copy(),
    'thresholds': {
        'qualified_threshold': 78,
        'review_threshold': 65
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
        if exp.get('summary'):
            parts.append(str(exp['summary']))
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
    
    Args:
        skill: Raw skill string
    
    Returns:
        Normalized skill string
    """
    # Convert to lowercase
    skill = skill.lower().strip()
    
    # Remove common prefixes/suffixes
    for prefix in ['senior', 'junior', 'lead', 'principal', 'staff']:
        skill = skill.replace(prefix, '')
    
    # Remove special characters and normalize
    skill = re.sub(r'[^\w#+\.]', ' ', skill)
    skill = re.sub(r'\s+', ' ', skill).strip()
    
    return skill


def calculate_skills_keyword_match(
    resume_skills: Dict[str, List[str]],
    job_skills: List[str]
) -> float:
    """
    Calculate skills match using keyword overlap.
    This is the FIX for the BERT string similarity problem!
    
    Args:
        resume_skills: Dictionary with hard_skills and soft_skills from resume
        job_skills: List of required skills from job posting
    
    Returns:
        Match score from 0-100 (percentage of job skills matched)
    """
    if not job_skills:
        return 50.0  # No requirements, give half credit
    
    # Extract all resume skills
    all_resume_skills = []
    if isinstance(resume_skills, dict):
        all_resume_skills = resume_skills.get('hard_skills', []) + resume_skills.get('soft_skills', [])
    elif isinstance(resume_skills, list):
        all_resume_skills = resume_skills
    
    if not all_resume_skills:
        return 0.0
    
    # Normalize skills for comparison
    normalized_job_skills = {normalize_skill(s): s for s in job_skills if s}
    normalized_resume_skills = [normalize_skill(s) for s in all_resume_skills if s]
    
    # Count matches
    matched_skills = set()
    required_skills = set(normalized_job_skills.keys())
    
    for resume_skill in normalized_resume_skills:
        for req_skill in required_skills:
            # Exact match
            if resume_skill == req_skill:
                matched_skills.add(req_skill)
            # Partial match (e.g., "python" in "python developer" or vice versa)
            elif resume_skill in req_skill or req_skill in resume_skill:
                matched_skills.add(req_skill)
            # Handle common variations
            elif resume_skill.replace('#', 'sharp') == req_skill.replace('#', 'sharp'):
                matched_skills.add(req_skill)
            elif resume_skill.replace('++', 'pp') == req_skill.replace('++', 'pp'):
                matched_skills.add(req_skill)
    
    # Calculate percentage
    match_percentage = (len(matched_skills) / len(required_skills)) * 100 if required_skills else 0
    
    # Debug output
    print(f"[DEBUG] Skills match: {len(matched_skills)}/{len(required_skills)} = {match_percentage:.1f}%")
    print(f"[DEBUG]   Required: {list(required_skills)}")
    print(f"[DEBUG]   Matched: {matched_skills}")
    
    return round(match_percentage, 2)






def calculate_experience_keyword_match(
    resume_experience: List[Dict],
    min_years: Optional[float],
    job_title_keywords: List[str]
) -> float:
    """
    Calculate experience relevance using keyword matching.
    
    Args:
        resume_experience: List of experience entries from resume
        min_years: Minimum years required from job
        job_title_keywords: Keywords from job title (e.g., ["python", "developer"])
    
    Returns:
        Match score from 0-100
    """
    if not resume_experience:
        return 0.0
    
    score = 0.0
    best_match = 0.0
    
    # Parse years from experience
    for exp in resume_experience:
        exp_text = extract_experience_text([exp])
        exp_lower = exp_text.lower()
        
        # Extract years from text
        years_match = re.search(r'(\d+)\s*(?:years?|yrs?)', exp_lower)
        if years_match:
            years = int(years_match.group(1))
        else:
            years = 0
        
        # Check if years requirement is met
        years_score = 0.0
        if min_years:
            if years >= min_years:
                years_score = 100.0
            elif years > 0:
                years_score = (years / min_years) * 100
        else:
            years_score = 50.0 if years > 0 else 0.0
        
        # Check keyword match with job title
        keyword_score = 0.0
        if job_title_keywords:
            matched_keywords = 0
            for kw in job_title_keywords:
                if kw.lower() in exp_lower:
                    matched_keywords += 1
            keyword_score = (matched_keywords / len(job_title_keywords)) * 100
        
        # Combine scores (50% years, 50% keyword match)
        exp_score = (years_score * 0.5) + (keyword_score * 0.5)
        best_match = max(best_match, exp_score)
    
    return round(best_match, 2)


def calculate_projects_keyword_match(
    resume_projects: List[Dict],
    expected_projects: List[str]
) -> float:
    """
    Calculate projects relevance using keyword matching.
    
    Args:
        resume_projects: List of project entries from resume
        expected_projects: List of expected project types from job
    
    Returns:
        Match score from 0-100
    """
    if not expected_projects:
        return 50.0  # No requirements, give half credit
    
    if not resume_projects:
        return 0.0
    
    # Extract project texts - check both name AND details
    matched_project_types = set()
    
    for proj in resume_projects:
        # Combine name and details - handle None values
        name = str(proj.get('name') or '').lower()
        details = str(proj.get('details') or '').lower()
        full_text = f"{name} {details}"
        
        for expected in expected_projects:
            expected_normalized = expected.lower()
            # Split compound terms like "API Development"
            expected_words = expected_normalized.split()
            
            # Check if any key word from expected matches in project text
            for word in expected_words:
                if len(word) > 2 and word in full_text:  # Skip short words
                    matched_project_types.add(expected_normalized)
                    break
            
            # Also try partial matching (remove spaces/hyphens)
            if expected_normalized.replace(' ', '') in full_text.replace(' ', '').replace('-', ''):
                matched_project_types.add(expected_normalized)
    
    # Calculate percentage
    match_percentage = (len(matched_project_types) / len(expected_projects)) * 100 if expected_projects else 0
    
    print(f"[DEBUG] Projects match: {len(matched_project_types)}/{len(expected_projects)} = {match_percentage:.1f}%")
    print(f"[DEBUG]   Expected: {expected_projects}")
    print(f"[DEBUG]   Matched: {matched_project_types}")
    print(f"[DEBUG]   Resume projects: {resume_projects}")
    
    return round(match_percentage, 2)


def calculate_education_keyword_match(
    resume_education: List[Dict],
    required_education: List[str]
) -> float:
    """
    Calculate education relevance using keyword matching.
    
    Args:
        resume_education: List of education entries from resume
        required_education: List of required education from job
    
    Returns:
        Match score from 0-100
    """
    if not required_education:
        return 50.0  # No requirements, give half credit
    
    if not resume_education:
        return 0.0
    
    # Extract education texts and check each entry
    matched_edu = set()
    
    for edu in resume_education:
        # Get all fields from education entry - handle both field name variations and None values
        school = str(edu.get('school') or '').lower()
        # Handle both 'course' and 'course_or_strand' field names
        course = edu.get('course') or edu.get('course_or_strand') or ''
        course = course.lower() if course else ''
        degree = str(edu.get('degree') or '').lower()
        # Combine all fields for matching
        edu_text = f"{school} {course} {degree}"
        
        for req in required_education:
            req_normalized = req.lower()
            
            # Check if requirement is mentioned anywhere in the education text
            # 1. Direct match (e.g., "Computer Science" appears in course)
            if req_normalized in edu_text:
                matched_edu.add(req_normalized)
                continue
            
            # 2. Check for degree type matches
            if 'bachelor' in req_normalized:
                if 'bachelor' in degree or 'bs' in degree or 'ba' in degree or 'b.s' in degree or 'b.a' in degree:
                    matched_edu.add(req_normalized)
            elif 'master' in req_normalized:
                if 'master' in degree or 'ms' in degree or 'ma' in degree or 'm.s' in degree or 'm.a' in degree:
                    matched_edu.add(req_normalized)
            # 3. Check if major field matches (e.g., "Computer Science" course matches "Computer Science" requirement)
            elif 'computer' in req_normalized:
                if 'computer' in course:
                    matched_edu.add(req_normalized)
            elif 'science' in req_normalized:
                if 'science' in course:
                    matched_edu.add(req_normalized)
            elif 'engineering' in req_normalized:
                if 'engineering' in course:
                    matched_edu.add(req_normalized)
    
    # Calculate percentage
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
    results['skills_relevance'] = calculate_skills_keyword_match(
        resume_skills=resume_skills,
        job_skills=job_skills_list
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
    results['projects_relevance'] = calculate_projects_keyword_match(
        resume_projects=resume_projects,
        expected_projects=job_projects_list
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


def calculate_count_based_score(
    parsed_resume_json: Dict,
    weights: Optional[Dict[str, float]] = None,
    baseline_project_score: int = 2
) -> Dict[str, Any]:
    """
    Calculate count-based score from parsed resume data.
    Uses unified baselines for all applicants (no special treatment by job level).
    
    Args:
        parsed_resume_json: Parsed resume data with skills, experience, education, projects
        weights: Optional weights for scoring
        baseline_project_score: Minimum projects for full score (default: 2)
    
    Returns:
        Dictionary with count-based score and breakdown
    """
    if weights is None:
        weights = DEFAULT_COUNT_WEIGHTS.copy()
    
    # Unified baselines for all applicants
    baseline_skills = 20
    baseline_experience = 5
    baseline_projects = baseline_project_score
    
    # Calculate raw scores for each category (0-100 scale)
    # Skills: Based on number of skills
    skills_dict = parsed_resume_json.get('skills', {})
    total_skills = len(skills_dict.get('hard_skills', [])) + len(skills_dict.get('soft_skills', []))
    skills_score = min((total_skills / baseline_skills) * 100, 100)
    
    # Experience: Based on number of experiences
    experience_list = parsed_resume_json.get('experience', [])
    experience_score = min((len(experience_list) / baseline_experience) * 100, 100)
    
    # Education: Based on number of education entries (max 3 = 100 points)
    education_list = parsed_resume_json.get('education', [])
    education_score = min((len(education_list) / 3) * 100, 100)
    
    # Projects: Based on number of projects relative to baseline
    project_list = parsed_resume_json.get('projects', [])
    project_count = len(project_list)
    if project_count >= baseline_projects:
        projects_score = min((project_count / baseline_projects) * 100, 100)
    else:
        # Proportional score below baseline
        projects_score = (project_count / baseline_projects) * 100
    
    # Calculate weighted total using weights
    count_score = (
        skills_score * (weights.get('skills_weight', 30) / 100) +
        experience_score * (weights.get('experience_weight', 40) / 100) +
        education_score * (weights.get('education_weight', 20) / 100) +
        projects_score * (weights.get('projects_weight', 10) / 100)
    )
    
    return {
        'count_score': round(count_score, 2),
        'baselines_used': {
            'skills': baseline_skills,
            'experience': baseline_experience,
            'projects': baseline_projects
        },
        'breakdown': {
            'skills': round(skills_score, 2),
            'experience': round(experience_score, 2),
            'education': round(education_score, 2),
            'projects': round(projects_score, 2)
        }
    }


def calculate_combined_score(
    parsed_resume_json: Dict,
    job_posting: Dict,
    weights: Optional[Dict[str, float]] = None,
    semantic_weight: float = 0.6,
    baseline_project_score: int = 2
) -> Dict[str, Any]:
    """
    Calculate combined score using both semantic and count-based methods.
    Now includes fresh grad auto-detection with adjusted baselines.
    
    Args:
        parsed_resume_json: Parsed resume data
        job_posting: Job posting data
        weights: Optional weights for scoring
        semantic_weight: Weight for semantic score (0-1), count weight = 1 - semantic_weight
        baseline_project_score: Minimum projects for full count score
    
    Returns:
        Dictionary with combined score and breakdown
    """
    if weights is None:
        weights = DEFAULT_COUNT_WEIGHTS.copy()
    
    # Calculate semantic score (0-100)
    semantic_result = calculate_hybrid_job_fit_score(
        parsed_resume_json=parsed_resume_json,
        job_posting=job_posting,
        weights=weights,
        include_breakdown=True
    )
    semantic_score = semantic_result.get('semantic_score', 0)
    
    # Calculate count-based score (0-100) with unified baselines
    count_result = calculate_count_based_score(
        parsed_resume_json=parsed_resume_json,
        weights=weights,
        baseline_project_score=baseline_project_score
    )
    count_score = count_result.get('count_score', 0)
    
    # Combine scores (60% semantic + 40% count)
    count_weight = 1 - semantic_weight
    combined_score = (semantic_score * semantic_weight) + (count_score * count_weight)
    
    return {
        'semantic_score': semantic_score,
        'count_score': count_score,
        'combined_score': round(combined_score, 2),
        'semantic_weight': semantic_weight,
        'count_weight': count_weight,
        'baselines_used': count_result.get('baselines_used', {}),
        'semantic_breakdown': semantic_result.get('component_scores', {}),
        'count_breakdown': count_result.get('breakdown', {}),
        'weights_used': weights
    }


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
    
    Args:
        resume_traincerts: List of training/certification entries from resume
        job_traincerts: List of expected trainings/certifications from job posting
    
    Returns:
        Match score from 0-100 (percentage of job requirements matched)
    """
    if not job_traincerts:
        return 50.0  # No requirements, give half credit
    
    if not resume_traincerts:
        return 0.0
    
    # Extract training/certification names from resume
    resume_tcert_names = []
    for tc in resume_traincerts:
        if isinstance(tc, dict):
            name = tc.get('name', '') or tc.get('title', '') or tc.get('certification', '')
            if name:
                resume_tcert_names.append(name.lower())
        elif isinstance(tc, str):
            resume_tcert_names.append(tc.lower())
    
    if not resume_tcert_names:
        return 0.0
    
    # Normalize job requirements
    normalized_job_tc = {normalize_skill(s): s for s in job_traincerts if s}
    required_tc = set(normalized_job_tc.keys())
    
    # Count matches
    matched_tc = set()
    
    for resume_tc in resume_tcert_names:
        for req_tc in required_tc:
            # Exact match
            if resume_tc == req_tc:
                matched_tc.add(req_tc)
            # Partial match
            elif resume_tc in req_tc or req_tc in resume_tc:
                matched_tc.add(req_tc)
    
    # Calculate percentage
    match_percentage = (len(matched_tc) / len(required_tc)) * 100 if required_tc else 0
    
    return round(match_percentage, 2)


def calculate_achievement_keyword_match(
    resume_achievements: List[Dict],
    job_achievements: List[str]
) -> float:
    """
    Calculate achievements match using keyword matching.
    
    Args:
        resume_achievements: List of achievement entries from resume
        job_achievements: List of expected achievements from job posting
    
    Returns:
        Match score from 0-100 (percentage of job requirements matched)
    """
    if not job_achievements:
        return 50.0  # No requirements, give half credit
    
    if not resume_achievements:
        return 0.0
    
    # Extract achievement names from resume
    resume_achievement_names = []
    for ach in resume_achievements:
        if isinstance(ach, dict):
            name = ach.get('name', '') or ach.get('title', '') or ach.get('award', '')
            if name:
                resume_achievement_names.append(name.lower())
        elif isinstance(ach, str):
            resume_achievement_names.append(ach.lower())
    
    if not resume_achievement_names:
        return 0.0
    
    # Normalize job requirements
    normalized_job_ach = {normalize_skill(s): s for s in job_achievements if s}
    required_ach = set(normalized_job_ach.keys())
    
    # Count matches
    matched_ach = set()
    
    for resume_ach in resume_achievement_names:
        for req_ach in required_ach:
            # Exact match
            if resume_ach == req_ach:
                matched_ach.add(req_ach)
            # Partial match
            elif resume_ach in req_ach or req_ach in resume_ach:
                matched_ach.add(req_ach)
    
    # Calculate percentage
    match_percentage = (len(matched_ach) / len(required_ach)) * 100 if required_ach else 0
    
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
    across 6 categories: experience, skills, education, projects, traincert, achievements.
    
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
    resume_achievements = parsed_resume_json.get('achievements', [])
    
    # Extract job requirements
    job_skills = job_posting.get('skills', [])
    job_min_years = job_posting.get('min_years_experience')
    job_title_keywords = job_posting.get('keywords', [])
    job_education = job_posting.get('required_education', [])
    job_projects = job_posting.get('expected_projects', [])
    job_traincerts = job_posting.get('preferred_certifications', [])
    job_achievements = job_posting.get('preferred_achievements', [])
    
    # Calculate individual category matches
    experience_match = calculate_experience_keyword_match(
        resume_experience, job_min_years, job_title_keywords
    )
    skills_match = calculate_skills_keyword_match(resume_skills, job_skills)
    education_match = calculate_education_keyword_match(resume_education, job_education)
    projects_match = calculate_projects_keyword_match(resume_projects, job_projects)
    traincert_match = calculate_traincert_keyword_match(resume_traincerts, job_traincerts)
    achievement_match = calculate_achievement_keyword_match(resume_achievements, job_achievements)
    
    # Calculate weighted requirement match score
    requirement_match_score = (
        experience_match * (weights.get('experience_weight', 28) / 100) +
        skills_match * (weights.get('skills_weight', 30) / 100) +
        education_match * (weights.get('education_weight', 18) / 100) +
        projects_match * (weights.get('projects_weight', 14) / 100) +
        traincert_match * (weights.get('traincert_weight', 6) / 100) +
        achievement_match * (weights.get('achievements_weight', 4) / 100)
    )
    
    return {
        'requirement_match_score': round(requirement_match_score, 2),
        'breakdown': {
            'experience': round(experience_match, 2),
            'skills': round(skills_match, 2),
            'education': round(education_match, 2),
            'projects': round(projects_match, 2),
            'traincert': round(traincert_match, 2),
            'achievements': round(achievement_match, 2)
        },
        'weights_used': weights
    }


def calculate_category_count_score(
    parsed_resume_json: Dict,
    baselines: Optional[Dict[str, float]] = None,
    job_level: str = None
) -> Dict[str, Any]:
    """
    Calculate the Count Score (40% of final score).
    This measures whether the applicant meets the expected baseline quantity
    for each of the 6 categories.
    
    NOTE: This function now uses UNIFIED scoring for all applicants.
    The job_level parameter is deprecated and ignored.
    
    Args:
        parsed_resume_json: Parsed resume data
        baselines: Optional custom baselines (if None, uses unified profile)
        job_level: Deprecated parameter - kept for backward compatibility only
    
    Returns:
        Dictionary with count_score and breakdown
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
        # NER returns skills as dict with categories: {'Languages': 'PHP, C++', ...}
        # Try to extract hard/soft skills from dict structure
        if 'hard_skills' in skills_raw and 'soft_skills' in skills_raw:
            skills_dict = skills_raw
            skills_count = len(skills_dict.get('hard_skills', [])) + len(skills_dict.get('soft_skills', []))
        else:
            # Convert category-based dict to list
            all_skills = []
            for key, value in skills_raw.items():
                if isinstance(value, str):
                    # Split comma-separated values
                    skills_list = [s.strip() for s in value.split(',')]
                    all_skills.extend(skills_list)
                elif isinstance(value, list):
                    all_skills.extend(value)
            skills_count = len(all_skills)
    elif isinstance(skills_raw, list):
        # Skills is already a list
        skills_count = len(skills_raw)
    else:
        skills_count = 0
    
    education_list = parsed_resume_json.get('education', [])
    project_list = parsed_resume_json.get('projects', [])
    traincert_list = parsed_resume_json.get('trainings', []) + parsed_resume_json.get('certifications', [])
    achievement_list = parsed_resume_json.get('achievements', [])
    
    # Count items in each category
    experience_count = len(experience_list)
    education_count = len(education_list)
    projects_count = len(project_list)
    traincert_count = len(traincert_list)
    achievements_count = len(achievement_list)
    
    # Calculate category count scores (capped at 100)
    baseline_exp = baselines.get('baseline_experience', 2)
    baseline_skills = baselines.get('baseline_skills', 10)
    baseline_edu = baselines.get('baseline_education', 2)
    baseline_proj = baselines.get('baseline_projects', 2)
    baseline_tc = baselines.get('baseline_traincert', 2)
    baseline_ach = baselines.get('baseline_achievements', 1)
    
    experience_count_score = min((experience_count / baseline_exp) * 100, 100) if baseline_exp > 0 else 0
    skills_count_score = min((skills_count / baseline_skills) * 100, 100) if baseline_skills > 0 else 0
    education_count_score = min((education_count / baseline_edu) * 100, 100) if baseline_edu > 0 else 0
    projects_count_score = min((projects_count / baseline_proj) * 100, 100) if baseline_proj > 0 else 0
    traincert_count_score = min((traincert_count / baseline_tc) * 100, 100) if baseline_tc > 0 else 0
    achievements_count_score = min((achievements_count / baseline_ach) * 100, 100) if baseline_ach > 0 else 0
    
    # Get weights (same as requirement match)
    preset = get_job_level_preset(job_level)
    weights = preset['weights']
    
    # Calculate weighted count score
    count_score = (
        experience_count_score * (weights.get('experience_weight', 28) / 100) +
        skills_count_score * (weights.get('skills_weight', 30) / 100) +
        education_count_score * (weights.get('education_weight', 18) / 100) +
        projects_count_score * (weights.get('projects_weight', 14) / 100) +
        traincert_count_score * (weights.get('traincert_weight', 6) / 100) +
        achievements_count_score * (weights.get('achievements_weight', 4) / 100)
    )
    
    return {
        'count_score': round(count_score, 2),
        'breakdown': {
            'experience': {'count': experience_count, 'score': round(experience_count_score, 2)},
            'skills': {'count': skills_count, 'score': round(skills_count_score, 2)},
            'education': {'count': education_count, 'score': round(education_count_score, 2)},
            'projects': {'count': projects_count, 'score': round(projects_count_score, 2)},
            'traincert': {'count': traincert_count, 'score': round(traincert_count_score, 2)},
            'achievements': {'count': achievements_count, 'score': round(achievements_count_score, 2)}
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
        baselines=scoring_baselines
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
        'scoring_type': 'unified',  # Indicates unified scoring is being used
        'requirement_breakdown': requirement_result['breakdown'],
        'count_breakdown': count_result['breakdown'],
        'status': 'success'
    }


if __name__ == "__main__":
    # Run tests when executed directly
    test_model()
