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


def build_job_requirements_text(job_posting: Dict) -> Dict[str, str]:
    """
    Build requirement texts from job posting for semantic matching.
    
    Args:
        job_posting: Job posting dictionary
    
    Returns:
        Dictionary with requirement texts for each component
    """
    def parse_jsonb_field(value: Any) -> List[str]:
        """Parse jsonb field from Supabase, handling various formats."""
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


def calculate_component_scores(
    parsed_resume_json: Dict,
    job_posting: Dict
) -> Dict[str, float]:
    """
    Calculate semantic relevance scores for each resume component vs job requirements.
    This uses BERT embeddings to measure relevance, NOT quantity!
    
    Args:
        parsed_resume_json: Parsed resume data dictionary
        job_posting: Job posting data dictionary
    
    Returns:
        Dictionary with relevance scores (0-100) for each component
    """
    # Build requirement texts from job
    job_reqs = build_job_requirements_text(job_posting)
    
    # Debug: Print job requirements
    print(f"[DEBUG] Job requirements: {job_reqs}")
    
    # Extract texts from resume
    exp_text = extract_experience_text(parsed_resume_json.get('experience', []))
    skills_text = extract_skills_text(parsed_resume_json.get('skills', {}))
    edu_text = extract_education_text(parsed_resume_json.get('education', []))
    proj_text = extract_projects_text(parsed_resume_json.get('projects', []))
    
    # Debug: Print resume texts
    print(f"[DEBUG] Resume exp_text length: {len(exp_text)}, skills_text length: {len(skills_text)}, edu_text length: {len(edu_text)}, proj_text length: {len(proj_text)}")
    
    # Calculate semantic relevance for each component
    results = {}
    
    # Experience relevance
    if exp_text and job_reqs['experience']:
        exp_result = calculate_semantic_similarity(exp_text, job_reqs['experience'])
        results['experience_relevance'] = round(exp_result.get('similarity', 0) * 100, 2)
    else:
        results['experience_relevance'] = 0.0
    
    # Skills relevance
    if skills_text and job_reqs['skills']:
        skills_result = calculate_semantic_similarity(skills_text, job_reqs['skills'])
        results['skills_relevance'] = round(skills_result.get('similarity', 0) * 100, 2)
    else:
        results['skills_relevance'] = 0.0
    
    # Education relevance
    if edu_text and job_reqs['education']:
        edu_result = calculate_semantic_similarity(edu_text, job_reqs['education'])
        results['education_relevance'] = round(edu_result.get('similarity', 0) * 100, 2)
    else:
        results['education_relevance'] = 0.0
    
    # Projects relevance
    if proj_text and job_reqs['projects']:
        proj_result = calculate_semantic_similarity(proj_text, job_reqs['projects'])
        results['projects_relevance'] = round(proj_result.get('similarity', 0) * 100, 2)
    else:
        results['projects_relevance'] = 0.0
    
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
    This is similar to the frontend scoring logic.
    
    Args:
        parsed_resume_json: Parsed resume data with skills, experience, education, projects
        weights: Optional weights for scoring
        baseline_project_score: Minimum projects for full score (default: 2)
    
    Returns:
        Dictionary with count-based score and breakdown
    """
    if weights is None:
        weights = DEFAULT_COUNT_WEIGHTS.copy()
    
    # Calculate raw scores for each category (0-100 scale)
    # Skills: Based on number of skills (max 20 = 100 points)
    skills_dict = parsed_resume_json.get('skills', {})
    total_skills = len(skills_dict.get('hard_skills', [])) + len(skills_dict.get('soft_skills', []))
    skills_score = min((total_skills / 20) * 100, 100)
    
    # Experience: Based on number of experiences (max 5 = 100 points)
    experience_list = parsed_resume_json.get('experience', [])
    experience_score = min((len(experience_list) / 5) * 100, 100)
    
    # Education: Based on number of education entries (max 3 = 100 points)
    education_list = parsed_resume_json.get('education', [])
    education_score = min((len(education_list) / 3) * 100, 100)
    
    # Projects: Based on number of projects relative to baseline
    project_list = parsed_resume_json.get('projects', [])
    project_count = len(project_list)
    if project_count >= baseline_project_score:
        projects_score = min((project_count / baseline_project_score) * 100, 100)
    else:
        projects_score = (project_count / baseline_project_score) * 50
    
    # Calculate weighted total using weights
    count_score = (
        skills_score * (weights.get('skills_weight', 30) / 100) +
        experience_score * (weights.get('experience_weight', 40) / 100) +
        education_score * (weights.get('education_weight', 20) / 100) +
        projects_score * (weights.get('projects_weight', 10) / 100)
    )
    
    return {
        'count_score': round(count_score, 2),
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
    
    # Calculate count-based score (0-100)
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
    role_family: Optional[str] = None,
    active_only: bool = True
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from Supabase job_postings table.
    
    Args:
        limit: Maximum number of jobs to fetch
        role_family: Optional filter by role family
        active_only: Whether to fetch only active jobs
        
    Returns:
        List of job dictionaries
    """
    try:
        client = get_supabase_client()
        
        # Build query
        query = client.table("job_postings").select(
            "job_id, title, description, role_family, skills, keywords"
        )
        
        # Apply filters
        if active_only:
            query = query.eq("is_active", True)
        
        if role_family:
            query = query.eq("role_family", role_family)
        
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
    role_family: Optional[str] = None,
    fetch_from_db: bool = True,
    jobs: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Recommend top N matching jobs for a given resume.
    
    Args:
        resume_text: Parsed resume text
        limit: Number of recommendations to return (default 5)
        role_family: Optional filter by role family
        fetch_from_db: Whether to fetch jobs from database (default True)
        jobs: Optional list of job dictionaries (if not fetching from DB)
        
    Returns:
        List of jobs sorted by match score (highest first) with full details
    """
    # Get jobs list - prioritize jobs parameter if provided
    if jobs:
        job_list = jobs
    elif fetch_from_db:
        job_list = fetch_jobs_from_database(limit=100, role_family=role_family)
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
            "role_family": job.get("role_family"),
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
            "role_family": "Engineering",
            "skills": ["Python", "Django", "AWS"],
            "keywords": ["backend", "api", "cloud"]
        },
        {
            "job_id": "JOB_MARKETING_001",
            "title": "Marketing Manager",
            "description": job2,
            "role_family": "Marketing",
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


if __name__ == "__main__":
    # Run tests when executed directly
    test_model()
