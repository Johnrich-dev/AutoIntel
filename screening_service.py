#!/usr/bin/env python3
"""
Screening Service for AutoIntel Recruitment System
Orchestrates the automated screening process: score → decide → notify.

Now uses company-adaptable hybrid semantic scoring with customizable weights!
"""

import os
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import modules
try:
    import job_alignment
    import email_service
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

# Load environment variables
load_dotenv()

# Configuration
TOKEN_EXPIRY_HOURS = int(os.getenv("TOKEN_EXPIRY_HOURS", "24"))

# Default scoring settings (fallback if database not available)
DEFAULT_SCORING_SETTINGS = {
    "experience_weight": 40,
    "skills_weight": 30,
    "education_weight": 20,
    "projects_weight": 10,
    "traincert_weight": 6,
    "achievements_weight": 4,
    "qualified_threshold": 78,
    "review_threshold": 65,
    "baseline_experience": 2,
    "baseline_skills": 10,
    "baseline_education": 2,
    "baseline_projects": 2,
    "baseline_traincert": 2,
    "baseline_achievements": 1,
    "job_level": "entry_level",
    "scoring_type": "hybrid"
}


def load_scoring_settings(supabase_client: Any) -> Dict[str, Any]:
    """
    Load scoring settings from the database.
    
    Args:
        supabase_client: Supabase client
        
    Returns:
        Dictionary with scoring settings (weights and thresholds)
    """
    try:
        # Simply get the first row (no ordering to avoid syntax issues)
        result = supabase_client.table("scoring_settings").select("*").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            settings = result.data[0]
            print(f"Loaded scoring settings from database: {settings}")
            
            # Get the job_level from settings to determine which thresholds to use
            job_level = settings.get("job_level", "entry_level")
            
            # Get thresholds from the appropriate job level columns
            if job_level == "fresh_grad":
                qualified_threshold = settings.get("fresh_grad_qualified_threshold")
                review_threshold = settings.get("fresh_grad_review_threshold")
            elif job_level == "mid_level":
                qualified_threshold = settings.get("mid_level_qualified_threshold")
                review_threshold = settings.get("mid_level_review_threshold")
            else:  # entry_level (default)
                qualified_threshold = settings.get("entry_level_qualified_threshold")
                review_threshold = settings.get("entry_level_review_threshold")
            
            # Get weights from the appropriate job level JSONB column
            if job_level == "fresh_grad":
                weights_json = settings.get("fresh_grad_weights") or {}
            elif job_level == "mid_level":
                weights_json = settings.get("mid_level_weights") or {}
            else:
                weights_json = settings.get("entry_level_weights") or {}
            
            print(f"[DEBUG] Using job_level: {job_level}, qualified_threshold: {qualified_threshold}, review_threshold: {review_threshold}")
            print(f"[DEBUG] Using weights: {weights_json}")
            
            # Use values from the new columns, fall back to old columns or defaults
            # Also include all job-level specific keys for auto-detection later
            return {
                "experience_weight": weights_json.get("experience_weight") or settings.get("experience_weight", 28),
                "skills_weight": weights_json.get("skills_weight") or settings.get("skills_weight", 30),
                "education_weight": weights_json.get("education_weight") or settings.get("education_weight", 18),
                "projects_weight": weights_json.get("projects_weight") or settings.get("projects_weight", 14),
                "traincert_weight": weights_json.get("traincert_weight") or settings.get("traincert_weight", 6),
                "achievements_weight": weights_json.get("achievements_weight") or settings.get("achievements_weight", 4),
                "qualified_threshold": qualified_threshold if qualified_threshold is not None else 78,
                "review_threshold": review_threshold if review_threshold is not None else 65,
                "baseline_experience": weights_json.get("baseline_experience") or settings.get("baseline_experience", 2),
                "baseline_skills": weights_json.get("baseline_skills") or settings.get("baseline_skills", 10),
                "baseline_education": weights_json.get("baseline_education") or settings.get("baseline_education", 2),
                "baseline_projects": weights_json.get("baseline_projects") or settings.get("baseline_projects", 2),
                "baseline_traincert": weights_json.get("baseline_traincert") or settings.get("baseline_traincert", 2),
                "baseline_achievements": weights_json.get("baseline_achievements") or settings.get("baseline_achievements", 1),
                "job_level": job_level,
                "scoring_type": settings.get("scoring_type", "hybrid"),
                # Include all job-level specific thresholds for auto-detection
                "weights_by_level": settings.get("weights_by_level"),
                "baselines_by_level": settings.get("baselines_by_level"),
                "fresh_grad_qualified_threshold": settings.get("fresh_grad_qualified_threshold"),
                "fresh_grad_review_threshold": settings.get("fresh_grad_review_threshold"),
                "mid_level_qualified_threshold": settings.get("mid_level_qualified_threshold"),
                "mid_level_review_threshold": settings.get("mid_level_review_threshold"),
                "entry_level_qualified_threshold": settings.get("entry_level_qualified_threshold"),
                "entry_level_review_threshold": settings.get("entry_level_review_threshold"),
                "fresh_grad_weights": settings.get("fresh_grad_weights"),
                "mid_level_weights": settings.get("mid_level_weights"),
                "entry_level_weights": settings.get("entry_level_weights"),
            }
    except Exception as e:
        print(f"Warning: Could not load scoring settings from database: {e}")
        print("Using default settings")
    
    return DEFAULT_SCORING_SETTINGS


def get_fit_category(score: float) -> str:
    """Determine fit category based on score."""
    if score >= 90:
        return "Excellent Fit"
    elif score >= 80:
        return "Very Good Fit"
    elif score >= 70:
        return "Good Fit"
    elif score >= 60:
        return "Fair Fit"
    else:
        return "Poor Fit"


def determine_decision(score: float, pass_threshold: float, review_threshold: float) -> str:
    """Determine the screening decision based on score."""
    if score >= pass_threshold:
        return "passed"
    elif score >= review_threshold:
        return "needs_review"
    else:
        return "failed"


def parse_resume_json(parsed_resume_json: Any) -> Dict[str, Any]:
    """
    Parse the parsed_resume_json field from the database.
    Handles both JSON string and dict formats.
    
    Args:
        parsed_resume_json: Raw parsed resume data (string or dict)
        
    Returns:
        Parsed resume dictionary
    """
    if not parsed_resume_json:
        return {}
    
    if isinstance(parsed_resume_json, dict):
        return parsed_resume_json
    
    if isinstance(parsed_resume_json, str):
        try:
            return json.loads(parsed_resume_json)
        except json.JSONDecodeError:
            print(f"Warning: Could not parse resume JSON: {parsed_resume_json[:100]}...")
            return {}
    
    return {}


def process_applicant_screening(
    applicant_id: str,
    resume_text: str,
    job_id: str,
    job_title: str,
    job_description: str,
    applicant_email: str,
    applicant_name: str,
    supabase_client: Any = None,
    parsed_resume_json: Optional[Dict[str, Any]] = None,
    job_posting: Optional[Dict[str, Any]] = None,
    pass_threshold: Optional[float] = None,
    review_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Complete screening process for an applicant using hybrid semantic scoring.
    
    This function now uses company-adaptable weights from the scoring_settings table!
    
    Args:
        applicant_id: UUID of the applicant
        resume_text: Raw resume text (fallback)
        job_id: Job posting ID
        job_title: Title of the position
        job_description: Full job description
        applicant_email: Applicant's email
        applicant_name: Applicant's full name
        supabase_client: Optional Supabase client for DB updates
        parsed_resume_json: Parsed resume data (from GPT extractor)
        job_posting: Job posting data with structured requirements
        pass_threshold: Score threshold to pass (optional, loads from DB if not provided)
        review_threshold: Score threshold for review (optional, loads from DB if not provided)
    
    Returns:
        Dictionary with screening results
    """
    try:
        # Step 0: Load scoring settings from database (or use provided/fallback)
        scoring_settings = DEFAULT_SCORING_SETTINGS.copy()
        
        if supabase_client:
            # Try to load from database
            db_settings = load_scoring_settings(supabase_client)
            scoring_settings.update(db_settings)
            print(f"Using scoring settings: weights={scoring_settings}")
        
        # Get job level
        job_level = scoring_settings.get("job_level", "entry_level")
        
        # Use provided thresholds or fall back to settings
        if pass_threshold is None:
            pass_threshold = scoring_settings.get("qualified_threshold", 78)
        if review_threshold is None:
            review_threshold = scoring_settings.get("review_threshold", 65)
        
        # Step 1: Calculate job fit score using 6-category hybrid scoring
        print(f"Calculating 6-category hybrid job fit score for applicant {applicant_id}...")
        
        # Prepare weights for 6-category hybrid scoring
        weights = {
            "experience_weight": scoring_settings.get("experience_weight", 28),
            "skills_weight": scoring_settings.get("skills_weight", 30),
            "education_weight": scoring_settings.get("education_weight", 18),
            "projects_weight": scoring_settings.get("projects_weight", 14),
            "traincert_weight": scoring_settings.get("traincert_weight", 6),
            "achievements_weight": scoring_settings.get("achievements_weight", 4)
        }
        
        # Prepare baselines
        baselines = {
            "baseline_experience": scoring_settings.get("baseline_experience", 2),
            "baseline_skills": scoring_settings.get("baseline_skills", 10),
            "baseline_education": scoring_settings.get("baseline_education", 2),
            "baseline_projects": scoring_settings.get("baseline_projects", 2),
            "baseline_traincert": scoring_settings.get("baseline_traincert", 2),
            "baseline_achievements": scoring_settings.get("baseline_achievements", 1)
        }
        
        # Always auto-detect applicant level from resume
        # This is independent of HR's job level selection (which defines job requirements)
        # The applicant level determines which scoring profile to apply
        detected_job_level = 'entry_level'  # Default
        
        # Try to auto-detect from parsed resume first
        if parsed_resume_json:
            # Use parsed resume to detect job level
            detected_level = job_alignment.detect_job_level_from_resume(parsed_resume_json)
            print(f"[INFO] Auto-detected applicant level from parsed resume: {detected_level}")
            detected_job_level = detected_level
        elif resume_text:
            # Use raw resume text to detect job level (when NER not complete)
            detected_level = job_alignment.detect_job_level_from_raw_text(resume_text)
            print(f"[INFO] Auto-detected applicant level from raw text: {detected_level}")
            detected_job_level = detected_level
        else:
            print(f"[WARNING] No resume data available, using default entry_level")
        
        # Load the appropriate weights and thresholds based on detected job level
        print(f"[DEBUG] Before job-level override - weights_by_level: {scoring_settings.get('weights_by_level')}")
        print(f"[DEBUG] fresh_grad_qualified_threshold top-level: {scoring_settings.get('fresh_grad_qualified_threshold')}")
        print(f"[DEBUG] weights_by_level.fresh_grad.qualified_threshold: {scoring_settings.get('weights_by_level', {}).get('fresh_grad', {}).get('qualified_threshold') if scoring_settings.get('weights_by_level') else None}")
        if detected_job_level == 'fresh_grad':
            # Check top-level columns FIRST (new format), then fall back to weights_by_level (old format)
            weights_by_level = scoring_settings.get('weights_by_level') or {}
            fresh_grad_data = weights_by_level.get('fresh_grad', {}) if weights_by_level else {}
            qualified_threshold = scoring_settings.get('fresh_grad_qualified_threshold') or fresh_grad_data.get('qualified_threshold') or 75
            review_threshold = scoring_settings.get('fresh_grad_review_threshold') or fresh_grad_data.get('review_threshold') or 60
            fresh_grad_weights = scoring_settings.get('fresh_grad_weights') or {}
            weights = {
                'experience_weight': fresh_grad_weights.get('experience_weight', 18),
                'skills_weight': fresh_grad_weights.get('skills_weight', 30),
                'education_weight': fresh_grad_weights.get('education_weight', 22),
                'projects_weight': fresh_grad_weights.get('projects_weight', 18),
                'traincert_weight': fresh_grad_weights.get('traincert_weight', 7),
                'achievements_weight': fresh_grad_weights.get('achievements_weight', 5),
                'qualified_threshold': qualified_threshold,
                'review_threshold': review_threshold,
            }
            baselines = {
                'baseline_experience': fresh_grad_weights.get('baseline_experience', 1),
                'baseline_skills': fresh_grad_weights.get('baseline_skills', 8),
                'baseline_education': fresh_grad_weights.get('baseline_education', 2),
                'baseline_projects': fresh_grad_weights.get('baseline_projects', 2),
                'baseline_traincert': fresh_grad_weights.get('baseline_traincert', 2),
                'baseline_achievements': fresh_grad_weights.get('baseline_achievements', 1)
            }
        elif detected_job_level == 'mid_level':
            # Check top-level columns FIRST (new format), then fall back to weights_by_level (old format)
            weights_by_level = scoring_settings.get('weights_by_level') or {}
            mid_level_data = weights_by_level.get('mid_level', {}) if weights_by_level else {}
            qualified_threshold = scoring_settings.get('mid_level_qualified_threshold') or mid_level_data.get('qualified_threshold') or 80
            review_threshold = scoring_settings.get('mid_level_review_threshold') or mid_level_data.get('review_threshold') or 68
            mid_level_weights = scoring_settings.get('mid_level_weights') or {}
            weights = {
                'experience_weight': mid_level_weights.get('experience_weight', 42),
                'skills_weight': mid_level_weights.get('skills_weight', 28),
                'education_weight': mid_level_weights.get('education_weight', 14),
                'projects_weight': mid_level_weights.get('projects_weight', 8),
                'traincert_weight': mid_level_weights.get('traincert_weight', 5),
                'achievements_weight': mid_level_weights.get('achievements_weight', 3),
                'qualified_threshold': qualified_threshold,
                'review_threshold': review_threshold,
            }
            baselines = {
                'baseline_experience': mid_level_weights.get('baseline_experience', 4),
                'baseline_skills': mid_level_weights.get('baseline_skills', 12),
                'baseline_education': mid_level_weights.get('baseline_education', 2),
                'baseline_projects': mid_level_weights.get('baseline_projects', 2),
                'baseline_traincert': mid_level_weights.get('baseline_traincert', 2),
                'baseline_achievements': mid_level_weights.get('baseline_achievements', 1)
            }
        else:  # entry_level (default)
            # Check top-level columns FIRST (new format), then fall back to weights_by_level (old format)
            weights_by_level = scoring_settings.get('weights_by_level') or {}
            entry_level_data = weights_by_level.get('entry_level', {}) if weights_by_level else {}
            qualified_threshold = scoring_settings.get('entry_level_qualified_threshold') or entry_level_data.get('qualified_threshold') or 78
            review_threshold = scoring_settings.get('entry_level_review_threshold') or entry_level_data.get('review_threshold') or 65
            entry_level_weights = scoring_settings.get('entry_level_weights') or {}
            weights = {
                'experience_weight': entry_level_weights.get('experience_weight', 28),
                'skills_weight': entry_level_weights.get('skills_weight', 30),
                'education_weight': entry_level_weights.get('education_weight', 18),
                'projects_weight': entry_level_weights.get('projects_weight', 14),
                'traincert_weight': entry_level_weights.get('traincert_weight', 6),
                'achievements_weight': entry_level_weights.get('achievements_weight', 4),
                'qualified_threshold': qualified_threshold,
                'review_threshold': review_threshold,
            }
            baselines = {
                'baseline_experience': entry_level_weights.get('baseline_experience', 2),
                'baseline_skills': entry_level_weights.get('baseline_skills', 10),
                'baseline_education': entry_level_weights.get('baseline_education', 2),
                'baseline_projects': entry_level_weights.get('baseline_projects', 2),
                'baseline_traincert': entry_level_weights.get('baseline_traincert', 2),
                'baseline_achievements': entry_level_weights.get('baseline_achievements', 1)
            }
        
        print(f"[DEBUG] Using detected job level: {detected_job_level}, qualified_threshold: {qualified_threshold}, review_threshold: {review_threshold}")
        
        # Initialize variables for score breakdown (to be used in email)
        requirement_match_score = None
        count_score = None
        requirement_weight = 0.6
        count_weight = 0.4
        
        if parsed_resume_json and job_posting:
            # Calculate final hybrid score using the new 6-category scoring
            # Formula: FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
            # Use the detected job level
            hybrid_result = job_alignment.calculate_final_hybrid_score(
                parsed_resume_json=parsed_resume_json,
                job_posting=job_posting,
                job_level=detected_job_level,
                weights=weights,
                baselines=baselines,
                requirement_weight=0.6,
                count_weight=0.4,
                auto_detect_job_level=False  # Already detected above
            )
            
            # Use final_score as the main score
            score = hybrid_result.get('final_score', 0)
            requirement_match_score = hybrid_result.get('requirement_match_score', 0)
            count_score = hybrid_result.get('count_score', 0)
            decision = hybrid_result.get('decision', 'not_recommended')
            
            component_scores = {
                'requirement_match': hybrid_result.get('requirement_breakdown', {}),
                'count': hybrid_result.get('count_breakdown', {})
            }
            
            print(f"Job Level Used: {hybrid_result.get('job_level', 'N/A')}")
            print(f"Requirement Match Score: {requirement_match_score}")
            print(f"Count Score: {count_score}")
            print(f"Final Score: {score} (60% requirement + 40% count)")
            print(f"Decision: {decision}")
        else:
            # Fallback to legacy semantic scoring
            print("Warning: Using legacy semantic scoring (no parsed resume data)")
            fit_result = job_alignment.calculate_job_fit_score(
                resume_text=resume_text,
                job_description=job_description,
                job_id=job_id
            )
            component_scores = {
                'requirement_match': {},
                'count': {}
            }
            score = fit_result.get("semantic_score", 0)
            # Use the detected job level's thresholds for decision
            decision = determine_decision(score, qualified_threshold, review_threshold)
        
        fit_category = get_fit_category(score)
        
        print(f"Score: {score:.1f} - Category: {fit_category} - Decision: {decision}")
        print(f"Weights used: {weights}")
        print(f"Baselines used: {baselines}")
        
        # Step 2: Generate access token if passed or qualified
        access_token = None
        token_expires = None
        
        if decision in ("passed", "qualified"):
            access_token = email_service.generate_access_token()
            token_expires = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
            print(f"Generated access token: {access_token}")
        
        # Step 3: Update database if client provided
        if supabase_client:
            update_data = {
                "screening_score": score,
                "screening_fit_category": fit_category,
                "status": f"{decision}_screening" if decision != "passed" else "passed_screening",
                "updated_at": datetime.now().isoformat()
            }
            
            if access_token:
                update_data["access_token"] = access_token
                update_data["access_expires_at"] = token_expires.isoformat()
            
            supabase_client.table("applicants").update(
                update_data
            ).eq("id", applicant_id).execute()
            
            print(f"Updated applicant status in database")
            
            # Also update resume_scores table with component breakdown if it exists
            try:
                # Check if resume_scores table exists and has the applicant
                scores_data = {
                    "applicant_id": applicant_id,
                    "job_id": job_id,
                    "experience_score": component_scores.get("experience", 0),
                    "skills_score": component_scores.get("skills", 0),
                    "education_score": component_scores.get("education", 0),
                    "project_score": component_scores.get("projects", 0),
                    "final_score": score,
                    "status": "pending",
                    "match_explain": json.dumps({
                        "weights_used": weights,
                        "component_breakdown": component_scores,
                        "fit_category": fit_category
                    })
                }
                
                # Try to insert or update
                supabase_client.table("resume_scores").upsert(scores_data).execute()
                print(f"Updated resume_scores with component breakdown")
            except Exception as e:
                print(f"Warning: Could not update resume_scores: {e}")
        
        # Step 4: Send appropriate email notification
        email_sent = False
        
        # Extract score breakdown for email (use values already extracted in scoring section)
        requirement_breakdown = component_scores.get('requirement_match', {}) if component_scores else {}
        count_breakdown = component_scores.get('count', {}) if component_scores else {}
        
        # Add requirement/count weights to weights dict for email display
        weights_with_components = dict(weights) if weights else {}
        weights_with_components['requirement_weight'] = requirement_weight
        weights_with_components['count_weight'] = count_weight
        
        # Handle both "passed" (old) and "qualified" (new hybrid scoring) decisions
        if decision in ("passed", "qualified") and access_token:
            email_sent = email_service.send_pass_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score,
                access_token=access_token,
                requirement_match_score=requirement_match_score,
                count_score=count_score,
                requirement_breakdown=requirement_breakdown,
                count_breakdown=count_breakdown,
                weights_used=weights_with_components
            )
        elif decision == "needs_review":
            email_sent = email_service.send_review_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score,
                requirement_match_score=requirement_match_score,
                count_score=count_score,
                requirement_breakdown=requirement_breakdown,
                count_breakdown=count_breakdown,
                weights_used=weights_with_components
            )
        elif decision == "failed" or decision == "not_recommended":
            email_sent = email_service.send_fail_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score,
                requirement_match_score=requirement_match_score,
                count_score=count_score,
                requirement_breakdown=requirement_breakdown,
                count_breakdown=count_breakdown,
                weights_used=weights_with_components
            )
        
        # Step 5: Return comprehensive result
        return {
            "success": True,
            "applicant_id": applicant_id,
            "score": score,
            "fit_category": fit_category,
            "decision": decision,
            "weights_used": weights,
            "component_scores": component_scores,
            "access_token": access_token,
            "token_expires": token_expires.isoformat() if token_expires else None,
            "email_sent": email_sent,
            "status": f"{decision}_screening" if decision != "passed" else "passed_screening"
        }
        
    except Exception as e:
        print(f"Error processing screening: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "applicant_id": applicant_id,
            "error": str(e)
        }


def validate_access_token(
    token: str,
    supabase_client: Any
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Validate an applicant's access token.
    
    Args:
        token: The access token to validate
        supabase_client: Supabase client
    
    Returns:
        Tuple of (is_valid, applicant_data)
    """
    try:
        result = supabase_client.table("applicants").select(
            "id, name, email, status, access_expires_at, applied_job_id"
        ).eq("access_token", token).execute()
        
        if not result.data or len(result.data) == 0:
            return False, None
        
        applicant = result.data[0]
        
        # Check if token expired
        if applicant.get("access_expires_at"):
            expires_at = datetime.fromisoformat(applicant["access_expires_at"].replace("Z", "+00:00"))
            if datetime.now() > expires_at:
                return False, {"error": "Token expired", "applicant": applicant}
        
        # Check if status allows login
        allowed_statuses = ["passed_screening", "video_in_progress", "video_completed", 
                           "exam_in_progress", "exam_completed", "assessments_done"]
        
        if applicant.get("status") not in allowed_statuses:
            return False, {"error": f"Invalid status: {applicant.get('status')}", 
                          "applicant": applicant}
        
        return True, applicant
        
    except Exception as e:
        print(f"Error validating token: {str(e)}")
        return False, None


def update_applicant_status(
    applicant_id: str,
    new_status: str,
    supabase_client: Any
) -> bool:
    """
    Update applicant's workflow status.
    
    Args:
        applicant_id: UUID of the applicant
        new_status: New status value
        supabase_client: Supabase client
    
    Returns:
        True if successful
    """
    try:
        supabase_client.table("applicants").update({
            "status": new_status,
            "updated_at": datetime.now().isoformat()
        }).eq("id", applicant_id).execute()
        
        return True
    except Exception as e:
        print(f"Error updating status: {str(e)}")
        return False


if __name__ == "__main__":
    print("Screening Service for AutoIntel")
    print("=" * 50)
    print("Features:")
    print("  - Hybrid semantic scoring with company-adaptable weights")
    print("  - Component relevance scoring (experience, skills, education, projects)")
    print("  - Configurable thresholds from database")
    print("")
    print("Functions:")
    print("  - process_applicant_screening()")
    print("  - validate_access_token()")
    print("  - update_applicant_status()")
    print("  - load_scoring_settings()")
    print("")
    print("Run with Supabase client to process applicants:")
    print("  from screening_service import process_applicant_screening")
    print("  from supabase import create_client")
    print("  client = create_client(SUPABASE_URL, SUPABASE_KEY)")
    print("  result = process_applicant_screening(...)")
