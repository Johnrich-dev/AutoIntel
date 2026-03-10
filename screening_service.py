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
    "qualified_threshold": 80,
    "review_threshold": 60,
    "baseline_project_score": 2
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
        result = supabase_client.table("scoring_settings").select("*").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            settings = result.data[0]
            print(f"Loaded scoring settings from database: {settings}")
            return {
                "experience_weight": settings.get("experience_weight", 40),
                "skills_weight": settings.get("skills_weight", 30),
                "education_weight": settings.get("education_weight", 20),
                "projects_weight": settings.get("projects_weight", 10),
                "qualified_threshold": settings.get("qualified_threshold", 80),
                "review_threshold": settings.get("review_threshold", 60),
                "baseline_project_score": settings.get("baseline_project_score", 2)
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
            pass_threshold = scoring_settings.get("qualified_threshold", 80)
        if review_threshold is None:
            review_threshold = scoring_settings.get("review_threshold", 60)
        
        # Step 1: Calculate job fit score using hybrid semantic scoring
        print(f"Calculating hybrid job fit score for applicant {applicant_id}...")
        
        # Prepare weights for hybrid scoring
        weights = {
            "experience_weight": scoring_settings.get("experience_weight", 40),
            "skills_weight": scoring_settings.get("skills_weight", 30),
            "education_weight": scoring_settings.get("education_weight", 20),
            "projects_weight": scoring_settings.get("projects_weight", 10)
        }
        
        # Use parsed_resume_json and job_posting if available, otherwise fallback
        if parsed_resume_json and job_posting:
            # Calculate combined score (60% semantic + 40% count-based)
            combined_result = job_alignment.calculate_combined_score(
                parsed_resume_json=parsed_resume_json,
                job_posting=job_posting,
                weights=weights,
                semantic_weight=0.6,  # 60% semantic, 40% count
                baseline_project_score=scoring_settings.get('baseline_project_score', 2)
            )
            
            # Use combined score as the main score
            score = combined_result.get('combined_score', 0)
            component_scores = {
                'semantic': combined_result.get('semantic_breakdown', {}),
                'count': combined_result.get('count_breakdown', {})
            }
            print(f"Semantic score: {combined_result.get('semantic_score')}")
            print(f"Count score: {combined_result.get('count_score')}")
            print(f"Combined score: {score} (60% semantic + 40% count)")
        else:
            # Fallback to legacy semantic scoring
            print("Warning: Using legacy semantic scoring (no parsed resume data)")
            fit_result = job_alignment.calculate_job_fit_score(
                resume_text=resume_text,
                job_description=job_description,
                job_id=job_id
            )
            component_scores = {
                'semantic': {},
                'count': {}
            }
            score = fit_result.get("semantic_score", 0)
        
        fit_category = get_fit_category(score)
        decision = determine_decision(score, pass_threshold, review_threshold)
        
        print(f"Score: {score:.1f} - Category: {fit_category} - Decision: {decision}")
        print(f"Weights used: {weights}")
        
        # Step 2: Generate access token if passed
        access_token = None
        token_expires = None
        
        if decision == "passed":
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
        if decision == "passed" and access_token:
            email_sent = email_service.send_pass_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score,
                access_token=access_token
            )
        elif decision == "needs_review":
            email_sent = email_service.send_review_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score
            )
        elif decision == "failed":
            email_sent = email_service.send_fail_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score
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
