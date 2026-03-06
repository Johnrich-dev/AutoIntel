#!/usr/bin/env python3
"""
Screening Service for AutoIntel Recruitment System
Orchestrates the automated screening process: score → decide → notify.
"""

import os
import sys
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

# Default thresholds (can be overridden from database)
DEFAULT_PASS_THRESHOLD = 80.0
DEFAULT_REVIEW_THRESHOLD = 60.0


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


def process_applicant_screening(
    applicant_id: str,
    resume_text: str,
    job_id: str,
    job_title: str,
    job_description: str,
    applicant_email: str,
    applicant_name: str,
    supabase_client: Any = None,
    pass_threshold: float = DEFAULT_PASS_THRESHOLD,
    review_threshold: float = DEFAULT_REVIEW_THRESHOLD
) -> Dict[str, Any]:
    """
    Complete screening process for an applicant.
    
    Args:
        applicant_id: UUID of the applicant
        resume_text: Parsed resume text
        job_id: Job posting ID
        job_title: Title of the position
        job_description: Full job description
        applicant_email: Applicant's email
        applicant_name: Applicant's full name
        supabase_client: Optional Supabase client for DB updates
        pass_threshold: Score threshold to pass (default: 80)
        review_threshold: Score threshold for review (default: 60)
    
    Returns:
        Dictionary with screening results
    """
    try:
        # Step 1: Calculate job fit score
        print(f"Calculating job fit score for applicant {applicant_id}...")
        fit_result = job_alignment.calculate_job_fit_score(
            resume_text=resume_text,
            job_description=job_description,
            job_id=job_id
        )
        
        score = fit_result.get("semantic_score", 0)
        fit_category = get_fit_category(score)
        decision = determine_decision(score, pass_threshold, review_threshold)
        
        print(f"Score: {score:.1f} - Category: {fit_category} - Decision: {decision}")
        
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
                update_data["token_expires_at"] = token_expires.isoformat()
            
            supabase_client.table("recruitment_applicants").update(
                update_data
            ).eq("applicant_id", applicant_id).execute()
            
            print(f"Updated applicant status in database")
        
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
            "access_token": access_token,
            "token_expires": token_expires.isoformat() if token_expires else None,
            "email_sent": email_sent,
            "status": f"{decision}_screening" if decision != "passed" else "passed_screening"
        }
        
    except Exception as e:
        print(f"Error processing screening: {str(e)}")
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
        result = supabase_client.table("recruitment_applicants").select(
            "applicant_id, full_name, email, status, token_expires_at, applied_job_id"
        ).eq("access_token", token).execute()
        
        if not result.data or len(result.data) == 0:
            return False, None
        
        applicant = result.data[0]
        
        # Check if token expired
        if applicant.get("token_expires_at"):
            expires_at = datetime.fromisoformat(applicant["token_expires_at"].replace("Z", "+00:00"))
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
        supabase_client.table("recruitment_applicants").update({
            "status": new_status,
            "updated_at": datetime.now().isoformat()
        }).eq("applicant_id", applicant_id).execute()
        
        return True
    except Exception as e:
        print(f"Error updating status: {str(e)}")
        return False


if __name__ == "__main__":
    print("Screening Service for AutoIntel")
    print("=" * 50)
    print("Functions:")
    print("  - process_applicant_screening()")
    print("  - validate_access_token()")
    print("  - update_applicant_status()")
    print("")
    print("Run with Supabase client to process applicants:")
    print("  from screening_service import process_applicant_screening")
    print("  from supabase import create_client")
    print("  client = create_client(SUPABASE_URL, SUPABASE_KEY)")
    print("  result = process_applicant_screening(...)")
