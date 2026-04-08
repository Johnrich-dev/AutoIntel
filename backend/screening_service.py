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
# These match the UNIFIED_SCORING_PROFILE in job_alignment.py exactly.
# No job-level differentiation — all applicants are scored against the same criteria.
DEFAULT_SCORING_SETTINGS = {
    "experience_weight": 28,
    "skills_weight": 30,
    "education_weight": 18,
    "projects_weight": 14,
    "traincert_weight": 6,
    "achievements_weight": 4,
    "qualified_threshold": 65,
    "review_threshold": 55,
    "baseline_experience": 2,
    "baseline_skills": 10,
    "baseline_education": 2,
    "baseline_projects": 2,
    "baseline_traincert": 2,
    "baseline_achievements": 1,
    "scoring_type": "hybrid",
    "requirement_weight": 0.6,
    "count_weight": 0.4,
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
            
            # Always use unified scoring - no special treatment based on job level
            qualified_threshold = settings.get("qualified_threshold")
            review_threshold = settings.get("review_threshold")
            
            print(f"[DEBUG] UNIFIED: Using base columns - qualified_threshold={qualified_threshold}, review_threshold={review_threshold}")
            
            # Use base weights from settings
            return {
                "experience_weight": settings.get("experience_weight", 28),
                "skills_weight": settings.get("skills_weight", 30),
                "education_weight": settings.get("education_weight", 18),
                "projects_weight": settings.get("projects_weight", 14),
                "traincert_weight": settings.get("traincert_weight", 6),
                "achievements_weight": settings.get("achievements_weight", 4),
                "qualified_threshold": qualified_threshold if qualified_threshold is not None else 78,
                "review_threshold": review_threshold if review_threshold is not None else 65,
                "baseline_experience": settings.get("baseline_experience", 2),
                "baseline_skills": settings.get("baseline_skills", 10),
                "baseline_education": settings.get("baseline_education", 2),
                "baseline_projects": settings.get("baseline_projects", 2),
                "baseline_traincert": settings.get("baseline_traincert", 2),
                "baseline_achievements": settings.get("baseline_achievements", 1),
                "scoring_type": settings.get("scoring_type", "hybrid"),
                # Resume formula split (stored as 0-100 in DB, used as 0.0-1.0 in scoring)
                "requirement_weight": (settings.get("requirement_weight") or 60) / 100,
                "count_weight": (settings.get("count_weight") or 40) / 100,
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
        
        # Use provided thresholds or fall back to settings
        if pass_threshold is None:
            pass_threshold = scoring_settings.get("qualified_threshold", 78)
        if review_threshold is None:
            review_threshold = scoring_settings.get("review_threshold", 65)
        
        # Step 1: Calculate job fit score using 6-category hybrid scoring
        print(f"Calculating 6-category hybrid job fit score for applicant {applicant_id}...")
        
        # Always use unified scoring for all applicants - no special treatment
        unified_profile = job_alignment.get_unified_scoring_profile()
        
        # Get unified weights
        weights = {
            'experience_weight': scoring_settings.get("experience_weight") or unified_profile['weights'].get('experience_weight', 28),
            'skills_weight': scoring_settings.get("skills_weight") or unified_profile['weights'].get('skills_weight', 30),
            'education_weight': scoring_settings.get("education_weight") or unified_profile['weights'].get('education_weight', 18),
            'projects_weight': scoring_settings.get("projects_weight") or unified_profile['weights'].get('projects_weight', 14),
            'traincert_weight': scoring_settings.get("traincert_weight") or unified_profile['weights'].get('traincert_weight', 6),
            'achievements_weight': scoring_settings.get("achievements_weight") or unified_profile['weights'].get('achievements_weight', 4)
        }
        
        # Get unified baselines
        baselines = {
            'baseline_experience': scoring_settings.get("baseline_experience") or unified_profile['baselines'].get('baseline_experience', 2),
            'baseline_skills': scoring_settings.get("baseline_skills") or unified_profile['baselines'].get('baseline_skills', 10),
            'baseline_education': scoring_settings.get("baseline_education") or unified_profile['baselines'].get('baseline_education', 2),
            'baseline_projects': scoring_settings.get("baseline_projects") or unified_profile['baselines'].get('baseline_projects', 2),
            'baseline_traincert': scoring_settings.get("baseline_traincert") or unified_profile['baselines'].get('baseline_traincert', 2),
            'baseline_achievements': scoring_settings.get("baseline_achievements") or unified_profile['baselines'].get('baseline_achievements', 1)
        }
        
        # Get unified thresholds
        qualified_threshold = scoring_settings.get("qualified_threshold") or unified_profile['thresholds'].get('qualified_threshold', 78)
        review_threshold = scoring_settings.get("review_threshold") or unified_profile['thresholds'].get('review_threshold', 65)
        
        # Allow override via function parameters
        if pass_threshold is not None:
            qualified_threshold = pass_threshold
        if review_threshold is not None:
            review_threshold = review_threshold
        
        print(f"[DEBUG] Using UNIFIED scoring for all applicants")
        print(f"[DEBUG] Using qualified_threshold: {qualified_threshold}, review_threshold: {review_threshold}")
        print(f"[DEBUG] Using weights: {weights}")
        print(f"[DEBUG] Using baselines: {baselines}")
        
        # Initialize variables for score breakdown (to be used in email)
        requirement_match_score = None
        count_score = None
        requirement_weight = scoring_settings.get("requirement_weight", 0.6)
        count_weight = scoring_settings.get("count_weight", 0.4)
        
        if parsed_resume_json and job_posting:
            # Calculate final hybrid score using UNIFIED scoring for all applicants
            # Formula: FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
            hybrid_result = job_alignment.calculate_final_hybrid_score(
                parsed_resume_json=parsed_resume_json,
                job_posting=job_posting,
                weights=weights,
                baselines=baselines,
                requirement_weight=requirement_weight,
                count_weight=count_weight,
                qualified_threshold=qualified_threshold,
                review_threshold=review_threshold
            )
            
            # Use final_score as the main score
            score = hybrid_result.get('final_score', 0)
            requirement_match_score = hybrid_result.get('requirement_match_score', 0)
            count_score = hybrid_result.get('count_score', 0)
            decision = hybrid_result.get('decision', 'not_recommended')

            req_breakdown = hybrid_result.get('requirement_breakdown', {})
            count_breakdown_data = hybrid_result.get('count_breakdown', {})
            component_scores = {
                'requirement_match': req_breakdown,
                'count': count_breakdown_data,
                'experience': req_breakdown.get('experience', count_breakdown_data.get('experience', {}).get('score', 0) if isinstance(count_breakdown_data.get('experience'), dict) else count_breakdown_data.get('experience', 0)),
                'skills': req_breakdown.get('skills', count_breakdown_data.get('skills', {}).get('score', 0) if isinstance(count_breakdown_data.get('skills'), dict) else count_breakdown_data.get('skills', 0)),
                'education': req_breakdown.get('education', count_breakdown_data.get('education', {}).get('score', 0) if isinstance(count_breakdown_data.get('education'), dict) else count_breakdown_data.get('education', 0)),
                'projects': req_breakdown.get('projects', count_breakdown_data.get('projects', {}).get('score', 0) if isinstance(count_breakdown_data.get('projects'), dict) else count_breakdown_data.get('projects', 0)),
                'matched_skills': hybrid_result.get('matched_skills', []),
                'missing_skills': hybrid_result.get('missing_skills', []),
            }
            
            print(f"Scoring Type: {hybrid_result.get('scoring_type', 'unified')}")
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
            # Map decision to screening_status values expected by the frontend
            # 'qualified'/'passed' → 'passed', 'needs_review' → 'in_review', else → 'failed'
            if decision in ('passed', 'qualified'):
                screening_status_value = 'passed'
            elif decision == 'needs_review':
                screening_status_value = 'in_review'
            else:
                screening_status_value = 'failed'

            update_data = {
                "screening_score": score,
                "screening_status": screening_status_value,
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
                        "fit_category": fit_category,
                        "matched_skills": component_scores.get("matched_skills", []),
                        "missing_skills": component_scores.get("missing_skills", []),
                        "requirement_match_score": requirement_match_score,
                        "count_score": count_score,
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
            "id, name, email, status, access_expires_at, applied_job_id, role"
        ).eq("access_token", token).execute()
        
        if not result.data or len(result.data) == 0:
            return False, None
        
        applicant = result.data[0]
        
        # Enforce role: only applicant tokens are valid here
        # If the role column exists and is set, it must be 'applicant'
        applicant_role = applicant.get("role")
        if applicant_role and applicant_role != "applicant":
            return False, {"error": f"Invalid role: {applicant_role}"}
        
        # Check if token expired
        if applicant.get("access_expires_at"):
            expires_at = datetime.fromisoformat(applicant["access_expires_at"].replace("Z", "+00:00"))
            if datetime.now(expires_at.tzinfo) > expires_at:
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
