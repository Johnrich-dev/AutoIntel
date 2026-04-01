#!/usr/bin/env python3
"""
Scoring API for AutoIntel Recruitment System
Exposes job alignment functions via REST API using Flask.

This API allows the frontend to call semantic scoring functions over HTTP.

Usage:
    python scoring_api.py

The server will start on http://localhost:5000
"""

import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Dict, Any, List, Optional
from datetime import datetime

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import job alignment module
try:
    import job_alignment
except ImportError as e:
    print(f"ERROR: Could not import job_alignment: {e}")
    print("Make sure job_alignment.py is in the project root")
    sys.exit(1)

# Initialize Flask app
app = Flask(__name__)

# Enable CORS for frontend communication
CORS(app)

# Configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "5000"))
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "AutoIntel Scoring API",
        "model": job_alignment.MODEL_NAME
    })


@app.route('/api/calculate-fit', methods=['POST'])
def calculate_fit():
    """
    Calculate semantic job fit score between resume and job description.
    
    Request Body:
    {
        "resume_text": "string (required)",
        "job_description": "string (required)",
        "job_id": "string (optional)"
    }
    
    Response:
    {
        "semantic_score": 79.2,
        "raw_similarity": 0.792,
        "fit_category": "Good Fit",
        "confidence": 0.65,
        "confidence_label": "Medium",
        "score_quality": "reliable",
        "job_id": "string or null",
        "status": "success"
    }
    """
    try:
        # Get request data
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        resume_text = data.get('resume_text', '')
        job_description = data.get('job_description', '')
        job_id = data.get('job_id')
        
        # Validate required fields
        if not resume_text:
            return jsonify({"error": "resume_text is required"}), 400
        if not job_description:
            return jsonify({"error": "job_description is required"}), 400
        
        # Calculate job fit score
        result = job_alignment.calculate_job_fit_score(
            resume_text=resume_text,
            job_description=job_description,
            job_id=job_id
        )
        
        # Add job_id to response if provided
        if job_id:
            result['job_id'] = job_id
        
        result['status'] = 'success'
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/calculate-similarity', methods=['POST'])
def calculate_similarity():
    """
    Calculate semantic similarity between two texts.
    
    Request Body:
    {
        "text1": "string (required)",
        "text2": "string (required)"
    }
    
    Response:
    {
        "similarity": 0.792,
        "confidence": 0.65,
        "confidence_label": "Medium",
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        text1 = data.get('text1', '')
        text2 = data.get('text2', '')
        
        if not text1:
            return jsonify({"error": "text1 is required"}), 400
        if not text2:
            return jsonify({"error": "text2 is required"}), 400
        
        result = job_alignment.calculate_semantic_similarity(text1, text2)
        result['status'] = 'success'
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/calculate-hybrid-fit', methods=['POST'])
def calculate_hybrid_fit():
    """
    Calculate hybrid job fit score using semantic relevance and company weights.
    
    This endpoint supports company-adaptable scoring with customizable weights!
    
    Request Body:
    {
        "parsed_resume_json": {              // Required: parsed resume data
            "experience": [...],
            "skills": {...},
            "education": [...],
            "projects": [...]
        },
        "job_posting": {                      // Required: job posting data
            "job_id": "string",
            "title": "string",
            "skills": ["Python", "Django"],
            "required_education": ["Bachelor's CS"],
            "expected_projects": ["API Development"],
            "min_years_experience": 5
        },
        "weights": {                          // Optional: custom weights
            "experience_weight": 40,
            "skills_weight": 30,
            "education_weight": 20,
            "projects_weight": 10
        }
    }
    
    Response:
    {
        "semantic_score": 85.5,
        "fit_category": "Excellent Fit",
        "weights_used": {
            "experience_weight": 40,
            "skills_weight": 30,
            "education_weight": 20,
            "projects_weight": 10
        },
        "component_scores": {
            "experience": 95.0,
            "skills": 88.0,
            "education": 98.0,
            "projects": 85.0
        },
        "job_id": "string",
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        parsed_resume_json = data.get('parsed_resume_json')
        job_posting = data.get('job_posting')
        weights = data.get('weights')
        
        # Validate required fields
        if not parsed_resume_json:
            return jsonify({"error": "parsed_resume_json is required"}), 400
        if not job_posting:
            return jsonify({"error": "job_posting is required"}), 400
        
        # Calculate hybrid job fit score
        result = job_alignment.calculate_hybrid_job_fit_score(
            parsed_resume_json=parsed_resume_json,
            job_posting=job_posting,
            weights=weights,
            include_breakdown=True
        )
        
        result['status'] = 'success'
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/get-component-scores', methods=['POST'])
def get_component_scores():
    """
    Get semantic relevance scores for each resume component vs job requirements.
    
    Request Body:
    {
        "parsed_resume_json": {...},
        "job_posting": {...}
    }
    
    Response:
    {
        "experience_relevance": 95.0,
        "skills_relevance": 88.0,
        "education_relevance": 98.0,
        "projects_relevance": 85.0,
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        parsed_resume_json = data.get('parsed_resume_json')
        job_posting = data.get('job_posting')
        
        if not parsed_resume_json:
            return jsonify({"error": "parsed_resume_json is required"}), 400
        if not job_posting:
            return jsonify({"error": "job_posting is required"}), 400
        
        # Calculate component scores
        component_scores = job_alignment.calculate_component_scores(
            parsed_resume_json=parsed_resume_json,
            job_posting=job_posting
        )
        
        return jsonify({
            **component_scores,
            'status': 'success'
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/calculate-final-hybrid', methods=['POST'])
def calculate_final_hybrid():
    """
    Calculate the final hybrid score using the formula from SCORING_DOCUMENTATION.md:
    
    FINAL SCORE = (Requirement Match Score × 0.6) + (Count Score × 0.4)
    
    This is the main endpoint for 6-category hybrid scoring with job level support.
    
    Request Body:
    {
        "parsed_resume_json": {              // Required: parsed resume data
            "experience": [...],
            "skills": {...},
            "education": [...],
            "projects": [...],
            "trainings": [...],
            "certifications": [...],
            "achievements": [...]
        },
        "job_posting": {                      // Required: job posting data
            "job_id": "string",
            "title": "string",
            "skills": ["Python", "Django"],
            "required_education": ["Bachelor's CS"],
            "expected_projects": ["API Development"],
            "preferred_certifications": ["AWS"],
            "preferred_achievements": ["Dean\'s List"],
            "min_years_experience": 5
        },
        "weights": {                          // Optional: custom weights (overrides job_level)
            "experience_weight": 28,
            "skills_weight": 30,
            "education_weight": 18,
            "projects_weight": 14,
            "traincert_weight": 6,
            "achievements_weight": 4
        },
        "baselines": {                        // Optional: custom baselines
            "baseline_experience": 2,
            "baseline_skills": 10,
            "baseline_education": 2,
            "baseline_projects": 2,
            "baseline_traincert": 2,
            "baseline_achievements": 1
        },
        "requirement_weight": 0.6,           // Optional: default 0.6
        "count_weight": 0.4                   // Optional: default 0.4
    }
    
    Response:
    {
        "final_score": 72.0,
        "requirement_match_score": 55.67,
        "count_score": 96.50,
        "requirement_weight": 0.6,
        "count_weight": 0.4,
        "decision": "needs_review",
        "thresholds": {
            "qualified_threshold": 78,
            "review_threshold": 65
        },
        "job_level": "entry_level",
        "requirement_breakdown": {
            "experience": 50.0,
            "skills": 66.7,
            "education": 66.7,
            "projects": 33.3,
            "traincert": 50.0,
            "achievements": 50.0
        },
        "count_breakdown": {
            "experience": {"count": 1, "score": 50.0},
            "skills": {"count": 12, "score": 100.0},
            "education": {"count": 2, "score": 100.0},
            "projects": {"count": 4, "score": 100.0},
            "traincert": {"count": 1, "score": 50.0},
            "achievements": {"count": 1, "score": 100.0}
        },
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        parsed_resume_json = data.get('parsed_resume_json')
        job_posting = data.get('job_posting')
        weights = data.get('weights')
        baselines = data.get('baselines')
        requirement_weight = data.get('requirement_weight', 0.6)
        count_weight = data.get('count_weight', 0.4)
        
        # Validate required fields
        if not parsed_resume_json:
            return jsonify({"error": "parsed_resume_json is required"}), 400
        if not job_posting:
            return jsonify({"error": "job_posting is required"}), 400
        
        # Calculate final hybrid score using unified scoring for all applicants
        result = job_alignment.calculate_final_hybrid_score(
            parsed_resume_json=parsed_resume_json,
            job_posting=job_posting,
            weights=weights,
            baselines=baselines,
            requirement_weight=requirement_weight,
            count_weight=count_weight
        )
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/get-job-level-presets', methods=['GET'])
def get_job_level_presets():
    """
    Get the unified scoring profile (used for all applicants).
    
    Response:
    {
        "presets": UNIFIED_SCORING_PROFILE,
        "status": "success"
    }
    """
    try:
        return jsonify({
            "presets": job_alignment.UNIFIED_SCORING_PROFILE,
            "status": "success"
        }), 200
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/schedule-interview', methods=['POST'])
def schedule_interview():
    """
    Schedule an interview, create Google Calendar event, and send email notification to applicant.
    Schedule an interview, create Google Calendar event, and send email notification to applicant.
    
    Request Body:
    {
        "applicant_email": "string (required)",
        "applicant_name": "string (required)",
        "position": "string (required)",
        "interview_date": "string - ISO date format (required)",
        "interview_time": "string - HH:MM format (required)",
        "interview_type": "string - 'online' or 'in-person' (required)",
        "meeting_link": "string (optional)",
        "location": "string (optional for in-person)",
        "interviewer_name": "string (optional)",
        "interviewer_email": "string (optional)",
        "interview_notes": "string (optional)",
        "duration_minutes": "int (optional, default: 60)"
    }
    
    Response:
    {
        "success": true,
        "message": "Interview scheduled successfully",
        "calendar_event_id": "string",
        "calendar_event_link": "string",
        "meet_link": "string (if online)",
        "email_sent": true,
        "status": "success"
    }
    """
    try:
        # Import services
        try:
            import email_service
        except ImportError as e:
            return jsonify({"error": f"Could not import email_service: {e}"}), 500
        
        try:
            import calendar_service
        except ImportError as e:
            print(f"Warning: Could not import calendar_service: {e}")
            calendar_service = None
        
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        applicant_email = data.get('applicant_email')
        applicant_name = data.get('applicant_name')
        position = data.get('position')
        interview_date = data.get('interview_date')
        interview_time = data.get('interview_time')
        interview_type = data.get('interview_type', 'online')
        meeting_link = data.get('meeting_link', '')
        meeting_passcode = data.get('meeting_passcode', '')
        location = data.get('location', '')
        interviewer_name = data.get('interviewer_name', '')
        interviewer_email = data.get('interviewer_email', '')
        interview_notes = data.get('interview_notes', '')
        duration_minutes = data.get('duration_minutes', 60)
        
        # Validate required fields
        if not applicant_email:
            return jsonify({"error": "applicant_email is required"}), 400
        if not applicant_name:
            return jsonify({"error": "applicant_name is required"}), 400
        if not position:
            return jsonify({"error": "position is required"}), 400
        if not interview_date:
            return jsonify({"error": "interview_date is required"}), 400
        if not interview_time:
            return jsonify({"error": "interview_time is required"}), 400
        if not interview_type:
            return jsonify({"error": "interview_type is required (online or in-person)"}), 400
        
        # Track results
        calendar_event_id = None
        calendar_event_link = None
        meet_link = None
        email_sent = False
        calendar_created = False
        
        # For online interviews, meeting link must be provided manually
        teams_meeting_link = meeting_link
        if interview_type == "online" and not meeting_link:
            return jsonify({
                "success": False,
                "error": "Meeting link is required for online interviews. Please paste the Teams meeting link."
            }), 400
        
        # Step 1: Create Google Calendar event with Teams meeting link
        if calendar_service:
            calendar_result = calendar_service.create_interview_event(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=position,
                interview_date=interview_date,
                interview_time=interview_time,
                interview_type=interview_type,
                meeting_link=teams_meeting_link if teams_meeting_link else None,
                location=location if location else None,
                interviewer_name=interviewer_name if interviewer_name else None,
                interviewer_email=interviewer_email if interviewer_email else None,
                notes=interview_notes if interview_notes else None,
                duration_minutes=duration_minutes
            )
            
            if calendar_result.get("success"):
                calendar_created = True
                calendar_event_id = calendar_result.get("event_id")
                calendar_event_link = calendar_result.get("event_link")
                meet_link = calendar_result.get("meet_link") or teams_meeting_link
                print(f"Calendar event created: {calendar_event_id}")
            else:
                print(f"Calendar creation failed: {calendar_result.get('error')}")
        else:
            print("Calendar service not available - skipping calendar event creation")
        
        # Step 2: Send email notification to applicant with Teams meeting link
        email_result = email_service.send_interview_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=position,
            interview_date=interview_date,
            interview_time=interview_time,
            interview_type=interview_type,
            meeting_link=teams_meeting_link if teams_meeting_link else None,
            meeting_passcode=meeting_passcode if meeting_passcode else None,
            location=location if location else None,
            interviewer_name=interviewer_name if interviewer_name else None,
            notes=interview_notes if interview_notes else None
        )
        
        email_sent = email_result
        
        # Step 3: Send email notification to interviewer/manager (if provided)
        interviewer_email_sent = False
        if interviewer_email:
            interviewer_result = email_service.send_interviewer_notification(
                interviewer_name=interviewer_name if interviewer_name else 'Interviewer',
                interviewer_email=interviewer_email,
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=position,
                interview_date=interview_date,
                interview_time=interview_time,
                interview_type=interview_type,
                meeting_link=teams_meeting_link if teams_meeting_link else None,
                meeting_passcode=meeting_passcode if meeting_passcode else None,
                location=location if location else None,
                notes=interview_notes if interview_notes else None
            )
            interviewer_email_sent = interviewer_result
            print(f"Interviewer email sent: {interviewer_email_sent}")
        else:
            print("No interviewer email provided - skipping interviewer notification")
        
        # Determine success message
        if calendar_created and email_sent:
            message = "Interview scheduled, calendar event created, and email sent successfully"
            status_code = 200
        elif calendar_created and not email_sent:
            message = "Calendar event created but email failed to send"
            status_code = 200
        elif not calendar_created and email_sent:
            message = "Email sent but calendar event creation failed"
            status_code = 200
        else:
            message = "Failed to schedule interview - both calendar and email failed"
            status_code = 500
        
        return jsonify({
            "success": calendar_created or email_sent,
            "message": message,
            "calendar_event_id": calendar_event_id,
            "calendar_event_link": calendar_event_link,
            "meet_link": meet_link,
            "email_sent": email_sent,
            "interviewer_email_sent": interviewer_email_sent,
            "calendar_created": calendar_created,
            "status": "success" if (calendar_created or email_sent) else "error"
        }), status_code
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/grant-access', methods=['POST'])
def grant_access():
    """
    Grant access to an applicant and send email notification with access token.
    
    Request Body:
    {
        "applicant_id": "string (required)",
        "applicant_email": "string (required)",
        "applicant_name": "string (required)",
        "position": "string (required)",
        "overall_score": 85.5,
        "skills_score": 90.0,
        "experience_score": 80.0,
        "education_score": 85.0,
        "requirement_match_score": 75.0,
        "count_score": 95.0,
        "requirement_breakdown": {...},
        "count_breakdown": {...},
        "weights_used": {...}
    }
    
    Response:
    {
        "success": true,
        "message": "Access granted and email sent successfully",
        "access_token": "newly-generated-uuid",
        "token_expires_at": "2026-03-27T16:59:00Z",
        "email_sent": true,
        "status": "success"
    }
    """
    try:
        # Import required modules
        import email_service
        from datetime import datetime, timedelta
        from dotenv import load_dotenv
        load_dotenv()
        
        # Get Supabase client
        from supabase import create_client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            return jsonify({"error": "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"}), 500
        
        supabase = create_client(supabase_url, supabase_key)
        
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract required fields
        applicant_id = data.get('applicant_id')
        applicant_email = data.get('applicant_email')
        applicant_name = data.get('applicant_name')
        position = data.get('position')
        
        # Validate required fields
        if not applicant_id:
            return jsonify({"error": "applicant_id is required"}), 400
        if not applicant_email:
            return jsonify({"error": "applicant_email is required"}), 400
        if not applicant_name:
            return jsonify({"error": "applicant_name is required"}), 400
        if not position:
            return jsonify({"error": "position is required"}), 400
        
        # Extract optional score fields
        overall_score = data.get('overall_score', 0)
        skills_score = data.get('skills_score', 0)
        experience_score = data.get('experience_score', 0)
        education_score = data.get('education_score', 0)
        requirement_match_score = data.get('requirement_match_score')
        count_score = data.get('count_score')
        requirement_breakdown = data.get('requirement_breakdown')
        count_breakdown = data.get('count_breakdown')
        weights_used = data.get('weights_used')
        
        # Generate access token
        access_token = email_service.generate_access_token()
        token_expiry_hours = int(os.getenv("TOKEN_EXPIRY_HOURS", "24"))
        token_expires = datetime.now() + timedelta(hours=token_expiry_hours)
        
        # Update database
        update_data = {
            "screening_status": "passed",
            "screening_stage": "shortlisted",
            "access_token": access_token,
            "access_expires_at": token_expires.isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        print(f"Attempting to update applicant {applicant_id} with data: {update_data}")
        
        try:
            result = supabase.table("applicants").update(update_data).eq("id", applicant_id).execute()
            print(f"Database update result: {result}")
            print(f"Result data: {result.data}")
            print(f"Result count: {result.count}")
            
            if not result.data:
                print(f"WARNING: No rows were updated for applicant {applicant_id}")
                return jsonify({"error": "Database update failed - no rows affected"}), 500
                
        except Exception as db_error:
            print(f"Database update error: {db_error}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Database update failed: {str(db_error)}"}), 500
        
        # Send email notification
        email_sent = email_service.send_pass_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=position,
            score=overall_score,
            access_token=access_token,
            requirement_match_score=requirement_match_score,
            count_score=count_score,
            requirement_breakdown=requirement_breakdown,
            count_breakdown=count_breakdown,
            weights_used=weights_used
        )
        
        return jsonify({
            "success": True,
            "message": "Access granted and email sent successfully",
            "access_token": access_token,
            "token_expires_at": token_expires.isoformat(),
            "email_sent": email_sent,
            "status": "success"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/reject-applicant', methods=['POST'])
def reject_applicant():
    """
    Reject an applicant and send email notification.
    
    Request Body:
    {
        "applicant_id": "string (required)",
        "applicant_email": "string (required)",
        "applicant_name": "string (required)",
        "position": "string (required)",
        "overall_score": 85.5,
        "skills_score": 90.0,
        "experience_score": 80.0,
        "education_score": 85.0,
        "requirement_match_score": 75.0,
        "count_score": 95.0,
        "requirement_breakdown": {...},
        "count_breakdown": {...},
        "weights_used": {...}
    }
    
    Response:
    {
        "success": true,
        "message": "Applicant rejected and email sent successfully",
        "email_sent": true,
        "status": "success"
    }
    """
    try:
        # Import required modules
        import email_service
        from datetime import datetime
        from dotenv import load_dotenv
        load_dotenv()
        
        # Get Supabase client
        from supabase import create_client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            return jsonify({"error": "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"}), 500
        
        supabase = create_client(supabase_url, supabase_key)
        
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract required fields
        applicant_id = data.get('applicant_id')
        applicant_email = data.get('applicant_email')
        applicant_name = data.get('applicant_name')
        position = data.get('position')
        
        # Validate required fields
        if not applicant_id:
            return jsonify({"error": "applicant_id is required"}), 400
        if not applicant_email:
            return jsonify({"error": "applicant_email is required"}), 400
        if not applicant_name:
            return jsonify({"error": "applicant_name is required"}), 400
        if not position:
            return jsonify({"error": "position is required"}), 400
        
        # Extract optional score fields
        overall_score = data.get('overall_score', 0)
        skills_score = data.get('skills_score', 0)
        experience_score = data.get('experience_score', 0)
        education_score = data.get('education_score', 0)
        requirement_match_score = data.get('requirement_match_score')
        count_score = data.get('count_score')
        requirement_breakdown = data.get('requirement_breakdown')
        count_breakdown = data.get('count_breakdown')
        weights_used = data.get('weights_used')
        
        # Update database
        update_data = {
            "screening_status": "failed",
            "screening_stage": "screened",
            "updated_at": datetime.now().isoformat()
        }
        
        print(f"Attempting to update applicant {applicant_id} with data: {update_data}")
        
        try:
            result = supabase.table("applicants").update(update_data).eq("id", applicant_id).execute()
            print(f"Database update result: {result}")
            print(f"Result data: {result.data}")
            print(f"Result count: {result.count}")
            
            if not result.data:
                print(f"WARNING: No rows were updated for applicant {applicant_id}")
                return jsonify({"error": "Database update failed - no rows affected"}), 500
                
        except Exception as db_error:
            print(f"Database update error: {db_error}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Database update failed: {str(db_error)}"}), 500
        
        # Send email notification
        email_sent = email_service.send_fail_notification(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=position,
            score=overall_score,
            requirement_match_score=requirement_match_score,
            count_score=count_score,
            requirement_breakdown=requirement_breakdown,
            count_breakdown=count_breakdown,
            weights_used=weights_used
        )
        
        return jsonify({
            "success": True,
            "message": "Applicant rejected and email sent successfully",
            "email_sent": email_sent,
            "status": "success"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/video-verification', methods=['POST', 'OPTIONS'])
def video_verification():
    """
    Handle video verification decision (Verified or Mismatch).
    
    Request Body:
    {
        "applicant_id": "string (required)",
        "applicant_email": "string (required)",
        "applicant_name": "string (required)",
        "position": "string (required)",
        "verification_status": "verified" or "mismatch" (required)
    }
    
    Response:
    {
        "success": true,
        "message": "Applicant verified and moved to shortlisted" or "Rejection email sent",
        "email_sent": true,
        "status": "success"
    }
    """
    # Handle OPTIONS request for CORS preflight
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        # Import required modules
        import email_service
        from datetime import datetime
        from dotenv import load_dotenv
        load_dotenv()
        
        # Get Supabase client
        from supabase import create_client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            return jsonify({"error": "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"}), 500
        
        supabase = create_client(supabase_url, supabase_key)
        
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract required fields
        applicant_id = data.get('applicant_id')
        applicant_email = data.get('applicant_email')
        applicant_name = data.get('applicant_name')
        position = data.get('position')
        verification_status = data.get('verification_status')
        
        # Validate required fields
        if not applicant_id:
            return jsonify({"error": "applicant_id is required"}), 400
        if not applicant_email:
            return jsonify({"error": "applicant_email is required"}), 400
        if not applicant_name:
            return jsonify({"error": "applicant_name is required"}), 400
        if not position:
            return jsonify({"error": "position is required"}), 400
        if not verification_status:
            return jsonify({"error": "verification_status is required"}), 400
        
        if verification_status not in ['verified', 'mismatch']:
            return jsonify({"error": "verification_status must be 'verified' or 'mismatch'"}), 400
        
        email_sent = False
        
        if verification_status == 'verified':
            # Update database to shortlisted status
            update_data = {
                "status": "shortlisted",
                "screening_status": "passed",
                "screening_stage": "video_verified",
                "updated_at": datetime.now().isoformat()
            }
            
            print(f"Attempting to update applicant {applicant_id} to shortlisted with data: {update_data}")
            
            try:
                result = supabase.table("applicants").update(update_data).eq("id", applicant_id).execute()
                print(f"Database update result: {result}")
                print(f"Result data: {result.data}")
                print(f"Result count: {result.count}")
                
                if not result.data:
                    print(f"WARNING: No rows were updated for applicant {applicant_id}")
                    return jsonify({"error": "Database update failed - no rows affected"}), 500
                    
            except Exception as db_error:
                print(f"Database update error: {db_error}")
                import traceback
                traceback.print_exc()
                return jsonify({"error": f"Database update failed: {str(db_error)}"}), 500
            
            return jsonify({
                "success": True,
                "message": "Applicant verified and moved to shortlisted",
                "email_sent": False,
                "status": "success"
            }), 200
            
        else:  # verification_status == 'mismatch'
            # Update database to rejected status
            update_data = {
                "status": "rejected",
                "screening_status": "failed",
                "screening_stage": "video_mismatch",
                "updated_at": datetime.now().isoformat()
            }
            
            print(f"Attempting to update applicant {applicant_id} to rejected with data: {update_data}")
            
            try:
                result = supabase.table("applicants").update(update_data).eq("id", applicant_id).execute()
                print(f"Database update result: {result}")
                print(f"Result data: {result.data}")
                print(f"Result count: {result.count}")
                
                if not result.data:
                    print(f"WARNING: No rows were updated for applicant {applicant_id}")
                    return jsonify({"error": "Database update failed - no rows affected"}), 500
                    
            except Exception as db_error:
                print(f"Database update error: {db_error}")
                import traceback
                traceback.print_exc()
                return jsonify({"error": f"Database update failed: {str(db_error)}"}), 500
            
            # Send formal rejection email for video mismatch
            rejection_subject = f"Update on Your Application for {position}"
            rejection_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 32px 40px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">AutoIntel Recruitment</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px;">
            <h2 style="margin: 0 0 24px 0; color: #111827; font-size: 20px; font-weight: 600;">Application Status Update</h2>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear {applicant_name},</p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Thank you for your interest in the <strong>{position}</strong> position and for taking the time to complete our video assessment.</p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">After careful review, we identified a discrepancy between your uploaded profile photo and the video you submitted. As part of our commitment to maintaining the integrity of our recruitment process, we require all applicants to complete identity verification.</p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Unfortunately, due to this discrepancy, we are unable to advance your application to the next stage of our selection process.</p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">We encourage you to apply for future opportunities that match your qualifications and experience.</p>
            
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">We wish you the best in your career endeavors.</p>
            
            <p style="margin: 0 0 24px 0; color: #374151; font-size: 15px; line-height: 1.6;">Best regards,</p>
            
            <p style="margin: 0; color: #111827; font-size: 15px; font-weight: 600;">The AutoIntel Recruitment Team</p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 24px 40px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">This is an automated message. Please do not reply to this email.</p>
            <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px; text-align: center;">© {datetime.now().year} AutoIntel. All rights reserved.</p>
        </div>
    </div>
</body>
</html>"""
            
            email_sent = email_service.send_email(
                to_email=applicant_email,
                subject=rejection_subject,
                body=rejection_body
            )
            
            return jsonify({
                "success": True,
                "message": "Rejection email sent successfully",
                "email_sent": email_sent,
                "status": "success"
            }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


# Import work style scorer
try:
    import work_style_scorer
    WORK_STYLE_SCORER_AVAILABLE = True
except ImportError as e:
    print(f"WARNING: Could not import work_style_scorer: {e}")
    WORK_STYLE_SCORER_AVAILABLE = False


@app.route('/api/workstyle/score', methods=['POST'])
def score_work_style():
    """
    Score Work Style Assessment using semantic scoring
    
    This endpoint uses a hybrid approach:
    - Sentence embeddings (all-MiniLM-L6-v2) for structured Likert responses
    - GPT-4o Mini for essay evaluation (if essay provided)
    - Combined scoring with role-based alignment
    
    Request Body:
    {
        "answers": [               // Required: Array of {question: int, answer: int}
            {"question": 1, "answer": 5},
            {"question": 2, "answer": 3},
            ... (20 questions)
        ],
        "essay": "string",        // Optional: Essay response for question 21
        "job_title": "string",    // Required: Job title for role detection
        "use_gpt": true           // Optional: Whether to use GPT for essay (default: true)
    }
    
    Response:
    {
        "overall_alignment_score": 82.5,
        "dimension_scores": [
            {
                "dimension": "collaboration",
                "likert_score": 85.0,
                "embedding_score": 88.2,
                "essay_score": null,
                "hybrid_score": 86.4,
                "reasoning": ""
            },
            ... (15 dimensions)
        ],
        "matched_role_family": "development",
        "matched_role_display_name": "Software Development",
        "strong_areas": ["collaboration", "problem_solving", ...],
        "moderate_areas": [...],
        "development_areas": [...],
        "essay_insights": "Narrative summary from essay...",
        "scoring_method": "semantic" | "hybrid",
        "timestamp": "2026-03-18T12:00:00.000000",
        "status": "success"
    }
    """
    if not WORK_STYLE_SCORER_AVAILABLE:
        return jsonify({
            "error": "Work style scorer not available. Please install required dependencies.",
            "status": "error"
        }), 500
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        answers = data.get('answers', [])
        essay = data.get('essay', '')
        job_title = data.get('job_title', 'Software Developer')
        use_gpt = data.get('use_gpt', True)
        
        # Validate required fields
        if not answers:
            return jsonify({"error": "answers is required"}), 400
        if not job_title:
            return jsonify({"error": "job_title is required"}), 400
        
        # Check answer format
        if not isinstance(answers, list):
            return jsonify({"error": "answers must be an array"}), 400
        
        # Skip GPT if disabled or no essay provided
        if not use_gpt or not essay:
            essay = None
        
        # Score the assessment
        result = work_style_scorer.score_work_style(
            answers=answers,
            essay=essay,
            job_title=job_title
        )
        
        result['status'] = 'success'
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/workstyle/role-families', methods=['GET'])
def get_role_families():
    """
    Get available role families and their dimension weight profiles
    
    Response:
    {
        "role_families": [
            {
                "key": "development",
                "displayName": "Software Development",
                "description": "Software development and engineering roles",
                "weights": {
                    "collaboration": "medium",
                    "independence": "medium_high",
                    ...
                }
            },
            ...
        ],
        "status": "success"
    }
    """
    # Import the config
    try:
        import sys
        import os
        # We can't import TypeScript, so we'll return the Python config
        from work_style_scorer import ROLE_FAMILY_WEIGHTS
        
        role_family_info = {
            "development": {"displayName": "Software Development", "description": "Software development and engineering roles"},
            "data": {"displayName": "Data & AI", "description": "Data analysis, science and AI/ML roles"},
            "design": {"displayName": "Design", "description": "UI/UX and graphic design roles"},
            "security": {"displayName": "Cybersecurity", "description": "Security and information assurance roles"},
            "network": {"displayName": "Network & Infrastructure", "description": "Network and IT infrastructure roles"},
            "cloud": {"displayName": "Cloud & DevOps", "description": "Cloud engineering and DevOps roles"},
            "marketing": {"displayName": "Marketing & Content", "description": "Marketing, content and digital media roles"},
            "business": {"displayName": "Business & Product", "description": "Business analysis and product roles"},
            "qa": {"displayName": "Quality Assurance", "description": "QA, testing and quality roles"},
            "default": {"displayName": "General", "description": "Default profile for unmatched roles"}
        }
        
        role_families = []
        for key, info in role_family_info.items():
            weights = ROLE_FAMILY_WEIGHTS.get(key, ROLE_FAMILY_WEIGHTS["default"])
            
            # Convert numeric weights to labels
            weight_labels = {}
            for dim, w in weights.items():
                if w >= 1.0:
                    weight_labels[dim] = "high"
                elif w >= 0.85:
                    weight_labels[dim] = "medium_high"
                elif w >= 0.7:
                    weight_labels[dim] = "medium"
                elif w >= 0.55:
                    weight_labels[dim] = "low_medium"
                else:
                    weight_labels[dim] = "low"
            
            role_families.append({
                "key": key,
                "displayName": info["displayName"],
                "description": info["description"],
                "weights": weight_labels
            })
        
        return jsonify({
            "role_families": role_families,
            "status": "success"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/workstyle/detect-role', methods=['POST'])
def detect_role():
    """
    Detect role family from job title
    
    Request Body:
    {
        "job_title": "string"  // Required: Job title to analyze
    }
    
    Response:
    {
        "role_family": "development",
        "display_name": "Software Development",
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        job_title = data.get('job_title', '')
        
        if not job_title:
            return jsonify({"error": "job_title is required"}), 400
        
        # Use the scorer to detect role
        scorer = work_style_scorer.WorkStyleScorer()
        role_family, display_name = scorer._detect_role_family(job_title)
        
        return jsonify({
            "role_family": role_family,
            "display_name": display_name,
            "status": "success"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({"error": "Endpoint not found", "status": "error"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({"error": "Internal server error", "status": "error"}), 500


@app.route('/api/generate-ai-insights', methods=['POST'])
def generate_ai_insights():
    """
    Generate AI insights and suggestions for an applicant based on their assessment data.
    
    Request Body:
    {
        "applicant_id": "string (required)",
        "overall_score": 85.5,
        "skills_score": 90.0,
        "experience_score": 80.0,
        "education_score": 85.0,
        "projects_score": 75.0,
        "video_score": 88.0,
        "work_style_score": 82.0,
        "matched_skills": ["Python", "SQL", "React"],
        "missing_skills": ["AWS", "Docker"],
        "position": "Software Developer"
    }
    
    Response:
    {
        "insights": [
            {
                "type": "strength|weakness|opportunity",
                "title": "Strong Technical Skills",
                "description": "Candidate demonstrates excellent proficiency in required skills",
                "icon": "check|alert|trending"
            }
        ],
        "suggestions": [
            {
                "action": "Schedule technical interview",
                "reason": "Strong skill match but needs validation of practical experience",
                "priority": "high|medium|low"
            }
        ],
        "summary": "Candidate shows strong potential with excellent technical skills...",
        "status": "success"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract applicant data
        applicant_id = data.get('applicant_id')
        overall_score = data.get('overall_score', 0)
        skills_score = data.get('skills_score', 0)
        experience_score = data.get('experience_score', 0)
        education_score = data.get('education_score', 0)
        projects_score = data.get('projects_score', 0)
        video_score = data.get('video_score', 0)
        work_style_score = data.get('work_style_score', 0)
        matched_skills = data.get('matched_skills', [])
        missing_skills = data.get('missing_skills', [])
        position = data.get('position', 'the position')
        
        # Validate required fields
        if not applicant_id:
            return jsonify({"error": "applicant_id is required"}), 400
        
        # Initialize lists
        insights = []
        suggestions = []
        
        # Generate personalized insights based on scores
        # Skills insight
        if skills_score >= 85:
            insights.append({
                "type": "strength",
                "title": "Exceptional Technical Skills",
                "description": f"Candidate demonstrates outstanding proficiency with {len(matched_skills)} matched skills including {', '.join(matched_skills[:3])}",
                "icon": "check"
            })
        elif skills_score >= 70:
            insights.append({
                "type": "strength",
                "title": "Strong Technical Foundation",
                "description": f"Candidate shows solid technical capabilities with {len(matched_skills)} matched skills",
                "icon": "check"
            })
        elif skills_score >= 50:
            insights.append({
                "type": "opportunity",
                "title": "Moderate Technical Skills",
                "description": f"Candidate has {len(matched_skills)} matched skills but may need development in {len(missing_skills)} areas",
                "icon": "trending"
            })
        else:
            insights.append({
                "type": "weakness",
                "title": "Technical Skills Gap",
                "description": f"Candidate lacks {len(missing_skills)} key skills required for this role",
                "icon": "alert"
            })
        
        # Experience insight
        if experience_score >= 80:
            insights.append({
                "type": "strength",
                "title": "Relevant Experience",
                "description": "Candidate's experience aligns well with the role requirements",
                "icon": "check"
            })
        elif experience_score >= 60:
            insights.append({
                "type": "opportunity",
                "title": "Growing Experience",
                "description": "Candidate shows potential but may benefit from mentorship",
                "icon": "trending"
            })
        else:
            insights.append({
                "type": "weakness",
                "title": "Experience Development Needed",
                "description": "Candidate may require additional training or supervision",
                "icon": "alert"
            })
        
        # Video assessment insight
        if video_score >= 85:
            insights.append({
                "type": "strength",
                "title": "Excellent Communication",
                "description": "Candidate demonstrates strong communication and presentation skills",
                "icon": "check"
            })
        elif video_score >= 70:
            insights.append({
                "type": "strength",
                "title": "Good Communication",
                "description": "Candidate communicates effectively in video assessment",
                "icon": "check"
            })
        elif video_score >= 50:
            insights.append({
                "type": "opportunity",
                "title": "Communication Skills",
                "description": "Candidate's communication could be further developed",
                "icon": "trending"
            })
        elif video_score > 0:
            insights.append({
                "type": "weakness",
                "title": "Communication Concerns",
                "description": "Video assessment indicates areas for improvement",
                "icon": "alert"
            })
        
        # Work style insight
        if work_style_score >= 80:
            insights.append({
                "type": "strength",
                "title": "Strong Work Style Fit",
                "description": "Candidate's work style aligns well with the role",
                "icon": "check"
            })
        elif work_style_score >= 60:
            insights.append({
                "type": "opportunity",
                "title": "Work Style Alignment",
                "description": "Candidate shows good potential for role adaptation",
                "icon": "trending"
            })
        
        # Education insight
        if education_score >= 80:
            insights.append({
                "type": "strength",
                "title": "Strong Educational Background",
                "description": "Candidate's education supports the role requirements",
                "icon": "check"
            })
        
        # Projects insight
        if projects_score >= 75:
            insights.append({
                "type": "strength",
                "title": "Relevant Project Experience",
                "description": "Candidate has demonstrated practical application of skills",
                "icon": "check"
            })
        elif projects_score >= 50:
            insights.append({
                "type": "opportunity",
                "title": "Project Development",
                "description": "Candidate could benefit from more hands-on project work",
                "icon": "trending"
            })
        
        # Generate personalized suggestions
        if overall_score >= 78:
            suggestions.append({
                "action": "Schedule final interview",
                "reason": "Candidate meets all qualification thresholds",
                "priority": "high"
            })
        elif overall_score >= 65:
            suggestions.append({
                "action": "Schedule technical interview",
                "reason": "Strong potential but needs validation of practical skills",
                "priority": "high"
            })
            
            if len(missing_skills) > 0:
                suggestions.append({
                    "action": f"Assess {', '.join(missing_skills[:2])} skills",
                    "reason": f"Candidate lacks {len(missing_skills)} key qualifications",
                    "priority": "medium"
                })
        else:
            suggestions.append({
                "action": "Request additional documentation",
                "reason": "Score below threshold - need more information to evaluate",
                "priority": "medium"
            })
        
        # Add video review suggestion if video score exists
        if video_score > 0:
            suggestions.append({
                "action": "Review video assessment",
                "reason": "Evaluate communication and presentation skills",
                "priority": "medium"
            })
        
        # Generate personalized summary
        if overall_score >= 78:
            summary = f"Candidate shows strong potential with an overall score of {overall_score}%. They demonstrate excellent qualifications and are recommended for the next stage."
        elif overall_score >= 65:
            summary = f"Candidate shows promise with an overall score of {overall_score}%. They have solid foundations but may benefit from additional evaluation in specific areas."
        else:
            summary = f"Candidate has an overall score of {overall_score}%. While they show some potential, significant gaps exist that require further assessment."
        
        return jsonify({
            "insights": insights,
            "suggestions": suggestions,
            "summary": summary,
            "status": "success"
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


@app.route('/api/hr/decision', methods=['POST'])
def hr_decision():
    """
    Handle HR decision for applicants in 'in_review' status.
    
    Request body:
    {
        "applicant_id": "uuid",
        "decision": "approved" | "rejected",
        "applicant_name": "string",
        "applicant_email": "string",
        "job_title": "string",
        "score": float
    }
    
    Returns:
    {
        "success": true/false,
        "message": "...",
        "status": "success" | "error"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "message": "No data provided",
                "status": "error"
            }), 400
        
        applicant_id = data.get('applicant_id')
        decision = data.get('decision')
        applicant_name = data.get('applicant_name', 'Applicant')
        applicant_email = data.get('applicant_email')
        job_title = data.get('job_title', 'the position')
        score = data.get('score', 0)
        
        if not applicant_id or not decision:
            return jsonify({
                "success": False,
                "message": "Missing required fields: applicant_id and decision",
                "status": "error"
            }), 400
        
        if decision not in ['approved', 'rejected']:
            return jsonify({
                "success": False,
                "message": "Invalid decision. Must be 'approved' or 'rejected'",
                "status": "error"
            }), 400
        
        # Import email service
        try:
            import email_service
        except ImportError as e:
            return jsonify({
                "success": False,
                "message": f"Could not import email_service: {e}",
                "status": "error"
            }), 500
        
        if decision == 'approved':
            # Generate access token and send pass notification
            access_token = email_service.generate_access_token()
            TOKEN_EXPIRY_HOURS = 72
            expiry_time = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
            expiry_str = expiry_time.strftime("%B %d, %Y at %I:%M %p")
            
            # Send approval email with access token
            email_sent = email_service.send_pass_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score,
                access_token=access_token
            )
            
            # Update database status to 'passed'
            # Note: This would require Supabase client in Python
            # For now, we just send the email
            
            if email_sent:
                return jsonify({
                    "success": True,
                    "message": f"Access granted and notification sent to {applicant_email}",
                    "status": "success"
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send approval email",
                    "status": "error"
                }), 500
                
        elif decision == 'rejected':
            # Send rejection notification
            email_sent = email_service.send_fail_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=score
            )
            
            if email_sent:
                return jsonify({
                    "success": True,
                    "message": f"Rejection notification sent to {applicant_email}",
                    "status": "success"
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send rejection email",
                    "status": "error"
                }), 500
                
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "status": "error"
        }), 500


if __name__ == "__main__":
    print("=" * 60)
    print("AutoIntel Scoring API")
    print("=" * 60)
    print(f"Starting server on {API_HOST}:{API_PORT}")
    print(f"Debug mode: {DEBUG_MODE}")
    print("")
    print("Endpoints:")
    print("  GET  /api/health                   - Health check")
    print("  POST /api/calculate-fit            - Legacy job fit score")
    print("  POST /api/calculate-similarity     - Semantic similarity")
    print("  POST /api/calculate-hybrid-fit     - Hybrid scoring with weights")
    print("  POST /api/get-component-scores    - Component relevance scores")
    print("")
    print("Hybrid Scoring Features:")
    print("  - Company-adaptable weights (experience, skills, education, projects)")
    print("  - Semantic relevance scoring (not quantity!)")
    print("  - Component breakdown in response")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    app.run(host=API_HOST, port=API_PORT, debug=DEBUG_MODE)
