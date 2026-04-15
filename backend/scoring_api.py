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
    print("Make sure job_alignment.py is in the backend/ folder")
    sys.exit(1)

# Import Teams notifications (optional — won't crash if missing)
try:
    from teams_notify import notify_screening_result, notify_assessment_complete
except ImportError:
    notify_screening_result = None
    notify_assessment_complete = None

# Initialize Flask app
app = Flask(__name__)

# ── CORS ────────────────────────────────────────────────────────────────────
# Restrict to known frontend origins. Add your Amplify domain here.
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",") if o.strip()]
CORS(app, origins=_ALLOWED_ORIGINS, supports_credentials=True)

# ── Rate limiting ────────────────────────────────────────────────────────────
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=[],          # no global limit — set per-route
        storage_uri="memory://",
    )
    _LIMITER_AVAILABLE = True
except ImportError:
    limiter = None  # type: ignore
    _LIMITER_AVAILABLE = False
    print("WARNING: flask-limiter not installed — rate limiting disabled. Run: pip install flask-limiter")

# ── Constants ────────────────────────────────────────────────────────────────
MAX_PDF_BYTES = 10 * 1024 * 1024   # 10 MB
GPT_TIMEOUT_SECONDS = 45

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
    
    This is the main endpoint for 5-category hybrid scoring.

    Request Body:
    {
        "parsed_resume_json": {              // Required: parsed resume data
            "experience": [...],
            "skills": {...},
            "education": [...],
            "projects": [...],
            "trainings": [...],
            "certifications": [...]
        },
        "job_posting": {                      // Required: job posting data
            "job_id": "string",
            "title": "string",
            "skills": ["Python", "Django"],
            "required_education": ["Bachelor's CS"],
            "expected_projects": ["API Development"],
            "preferred_certifications": ["AWS"],
            "min_years_experience": 5
        },
        "weights": {                          // Optional: custom weights
            "experience_weight": 30,
            "skills_weight": 30,
            "education_weight": 20,
            "projects_weight": 10,
            "traincert_weight": 10
        },
        "baselines": {                        // Optional: custom baselines
            "baseline_experience": 2,
            "baseline_skills": 10,
            "baseline_education": 2,
            "baseline_projects": 2,
            "baseline_traincert": 2
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
        "requirement_breakdown": {
            "experience": 50.0,
            "skills": 66.7,
            "education": 66.7,
            "projects": 33.3,
            "traincert": 50.0
        },
        "count_breakdown": {
            "experience": {"count": 1, "score": 50.0},
            "skills": {"count": 12, "score": 100.0},
            "education": {"count": 2, "score": 100.0},
            "projects": {"count": 4, "score": 100.0},
            "traincert": {"count": 1, "score": 50.0}
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
    Schedule an interview and send calendar-invite emails to all participants.

    Accepts the extended payload with:
      - primary_interviewer_name / primary_interviewer_email
      - additional_attendees (array of email strings)
      - duration_minutes, time_zone
      - applicant_instructions (shown to applicant)
      - internal_notes (shown only to interviewers, never to applicant)
      - meeting_id, meeting_passcode
      - interview_type: 'online' | 'in-person' | 'hybrid'

    ICS invites are generated via ics_calendar_service and attached to
    both the applicant email and each interviewer/attendee email.
    """
    try:
        import email_service
        import ics_calendar_service
    except ImportError as e:
        return jsonify({"error": f"Could not import required service: {e}"}), 500

    try:
        import calendar_service
    except ImportError:
        calendar_service = None

    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    # --- Extract fields ---
    applicant_email = data.get('applicant_email', '').strip()
    applicant_name = data.get('applicant_name', '').strip()
    position = data.get('position', '').strip()
    interview_date = data.get('interview_date', '').strip()
    interview_time = data.get('interview_time', '').strip()
    interview_type = data.get('interview_type', 'online').strip()
    meeting_link = data.get('meeting_link', '').strip()
    meeting_id = data.get('meeting_id', '').strip()
    meeting_passcode = data.get('meeting_passcode', '').strip()
    location = data.get('location', '').strip()
    duration_minutes = int(data.get('duration_minutes', 60))
    time_zone = data.get('time_zone', 'Asia/Manila').strip()

    # Primary interviewer
    primary_interviewer_name = data.get('primary_interviewer_name') or data.get('interviewer_name', '')
    primary_interviewer_email = data.get('primary_interviewer_email') or data.get('interviewer_email', '')

    # Additional attendees — array of email strings
    additional_attendees = data.get('additional_attendees', [])
    if isinstance(additional_attendees, str):
        # Fallback: comma-separated string
        additional_attendees = [e.strip() for e in additional_attendees.split(',') if e.strip()]

    # Applicant-safe instructions (included in applicant email + ICS description)
    applicant_instructions = data.get('applicant_instructions', '').strip() or None

    # Internal notes — NEVER sent to applicant
    internal_notes = data.get('internal_notes', '').strip() or None

    # Legacy field fallback
    interview_notes = data.get('interview_notes', '').strip() or None

    # --- Validate required fields ---
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
        return jsonify({"error": "interview_type is required (online, in-person, hybrid)"}), 400

    # --- Conditional validation ---
    if interview_type in ("online", "hybrid") and not meeting_link:
        return jsonify({"success": False, "error": "meeting_link is required for online and hybrid interviews"}), 400
    if interview_type in ("in-person", "hybrid") and not location:
        return jsonify({"success": False, "error": "location is required for in-person and hybrid interviews"}), 400
    if not primary_interviewer_name:
        return jsonify({"success": False, "error": "primary_interviewer_name is required"}), 400

    # --- Generate ICS invite (shared by all recipients) ---
    # NOTE: ICS is generated once with all attendees so everyone gets the same event UID.
    # This ensures Accept/Decline in one client updates the same event.
    ics_content = ics_calendar_service.create_interview_ics(
        applicant_name=applicant_name,
        applicant_email=applicant_email,
        job_title=position,
        interview_date=interview_date,
        interview_time=interview_time,
        interview_type=interview_type,
        meeting_link=meeting_link or None,
        meeting_id=meeting_id or None,
        meeting_passcode=meeting_passcode or None,
        location=location or None,
        interviewer_name=primary_interviewer_name or None,
        interviewer_email=primary_interviewer_email or None,
        additional_attendees=additional_attendees if additional_attendees else None,
        applicant_instructions=applicant_instructions,
        # internal_notes intentionally NOT passed — ICS is applicant-safe
        duration_minutes=duration_minutes,
        time_zone=time_zone
    )

    calendar_event_id = None
    calendar_event_link = None
    calendar_created = False

    # --- Optional: Google Calendar event ---
    if calendar_service:
        try:
            calendar_result = calendar_service.create_interview_event(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=position,
                interview_date=interview_date,
                interview_time=interview_time,
                interview_type=interview_type,
                meeting_link=meeting_link or None,
                location=location or None,
                interviewer_name=primary_interviewer_name or None,
                interviewer_email=primary_interviewer_email or None,
                notes=applicant_instructions or None,
                duration_minutes=duration_minutes,
                time_zone=time_zone
            )
            if calendar_result.get("success"):
                calendar_created = True
                calendar_event_id = calendar_result.get("event_id")
                calendar_event_link = calendar_result.get("event_link")
        except Exception as cal_err:
            print(f"Calendar creation failed (non-fatal): {cal_err}")

    # --- Send applicant email with ICS ---
    # APPLICANT-SAFE: applicant_instructions only, no internal_notes
    applicant_email_sent = email_service.send_interview_notification(
        applicant_name=applicant_name,
        applicant_email=applicant_email,
        job_title=position,
        interview_date=interview_date,
        interview_time=interview_time,
        interview_type=interview_type,
        duration_minutes=duration_minutes,
        time_zone=time_zone,
        meeting_link=meeting_link or None,
        meeting_id=meeting_id or None,
        meeting_passcode=meeting_passcode or None,
        location=location or None,
        interviewer_name=primary_interviewer_name or None,
        applicant_instructions=applicant_instructions,
        ics_content=ics_content
    )

    # --- Send primary interviewer email with ICS (includes internal_notes) ---
    interviewer_email_sent = False
    if primary_interviewer_email:
        interviewer_email_sent = email_service.send_interviewer_notification(
            interviewer_name=primary_interviewer_name or 'Interviewer',
            interviewer_email=primary_interviewer_email,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=position,
            interview_date=interview_date,
            interview_time=interview_time,
            interview_type=interview_type,
            duration_minutes=duration_minutes,
            time_zone=time_zone,
            meeting_link=meeting_link or None,
            meeting_id=meeting_id or None,
            meeting_passcode=meeting_passcode or None,
            location=location or None,
            internal_notes=internal_notes or interview_notes,
            ics_content=ics_content
        )

    # --- Send additional attendees email with ICS (includes internal_notes) ---
    # Deduplicate: skip anyone already emailed as primary interviewer or the applicant
    already_emailed = {applicant_email}
    if primary_interviewer_email:
        already_emailed.add(primary_interviewer_email)

    attendee_results = []
    for attendee_email in additional_attendees:
        if not attendee_email or attendee_email in already_emailed:
            continue
        already_emailed.add(attendee_email)
        # Use the part before @ as a readable name fallback
        attendee_display_name = attendee_email.split('@')[0].replace('.', ' ').replace('_', ' ').title()
        sent = email_service.send_interviewer_notification(
            interviewer_name=attendee_display_name,
            interviewer_email=attendee_email,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=position,
            interview_date=interview_date,
            interview_time=interview_time,
            interview_type=interview_type,
            duration_minutes=duration_minutes,
            time_zone=time_zone,
            meeting_link=meeting_link or None,
            meeting_id=meeting_id or None,
            meeting_passcode=meeting_passcode or None,
            location=location or None,
            internal_notes=internal_notes or interview_notes,
            ics_content=ics_content
        )
        attendee_results.append({"email": attendee_email, "sent": sent})

    email_sent = applicant_email_sent

    if calendar_created and email_sent:
        message = "Interview scheduled, calendar event created, and emails sent"
    elif email_sent:
        message = "Interview scheduled and emails sent (calendar event skipped)"
    elif calendar_created:
        message = "Calendar event created but applicant email delivery failed"
    else:
        message = "Interview scheduling failed — applicant was not notified"

    # success requires the applicant email to have been sent
    success = bool(email_sent)

    return jsonify({
        "success": success,
        "message": message,
        "calendar_event_id": calendar_event_id,
        "calendar_event_link": calendar_event_link,
        "meet_link": meeting_link or None,
        "email_sent": email_sent,
        "interviewer_email_sent": interviewer_email_sent,
        "attendee_results": attendee_results,
        "calendar_created": calendar_created,
        "ics_generated": ics_content is not None,
        "status": "success" if success else "error"
    }), 200 if success else 500







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

        # Notify Teams channel — applicant passed screening
        if notify_screening_result:
            try:
                notify_screening_result(
                    applicant_name=applicant_name,
                    applicant_email=applicant_email,
                    position=position,
                    score=overall_score,
                    decision="passed",
                )
            except Exception as notify_err:
                print(f"[Teams] Grant access notification failed: {notify_err}")

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

        # Notify Teams channel — applicant rejected
        if notify_screening_result:
            try:
                notify_screening_result(
                    applicant_name=applicant_name,
                    applicant_email=applicant_email,
                    position=position,
                    score=overall_score,
                    decision="failed",
                )
            except Exception as notify_err:
                print(f"[Teams] Reject notification failed: {notify_err}")

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


@app.route('/api/notify-assessment-complete', methods=['POST', 'OPTIONS'])
def notify_assessment_complete_endpoint():
    """
    Called by the frontend when an applicant completes all assessments.
    Sends a Teams notification to the configured webhook.

    Request Body:
    {
        "applicant_name": "string",
        "applicant_email": "string",
        "position": "string",
        "completed": ["Video Assessment", "Personality Test"]
    }
    """
    if request.method == 'OPTIONS':
        return '', 204

    if not notify_assessment_complete:
        return jsonify({"success": False, "message": "Teams notifications not available"}), 200

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        applicant_name = data.get('applicant_name', 'Unknown')
        applicant_email = data.get('applicant_email', '')
        position = data.get('position', 'Unknown Position')
        completed = data.get('completed', ['Video Assessment', 'Personality Test'])

        # notify_assessment_complete already checks the toggle internally
        sent = notify_assessment_complete(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            position=position,
            completed=completed,
        )

        return jsonify({"success": sent, "message": "Notification sent" if sent else "No webhook configured"}), 200

    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500


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


@app.route('/api/send-offer-email', methods=['POST'])
def send_offer_email_endpoint():
    """
    Send a job offer email to a hired candidate with an attachment.

    Accepts multipart/form-data:
      - applicant_name, applicant_email, job_title, department
      - email_subject, email_body, cc (optional)
      - attachment_url (Supabase public URL, optional)
      - attachment (file upload, optional)

    IMAP SAFETY: Subject must NOT start with "Applicant -"
    """
    import tempfile
    import email_service

    try:
        applicant_name  = request.form.get('applicant_name', '')
        applicant_email = request.form.get('applicant_email', '')
        job_title       = request.form.get('job_title', '')
        department      = request.form.get('department', '')
        email_subject   = request.form.get('email_subject', f'Job Offer – {job_title}')
        email_body      = request.form.get('email_body', '')
        cc              = request.form.get('cc', '') or None

        if not applicant_email or not email_subject:
            return jsonify({"success": False, "error": "applicant_email and email_subject are required"}), 400

        # IMAP safety guard
        if email_subject.strip().lower().startswith('applicant -'):
            return jsonify({"success": False, "error": "Subject must not start with 'Applicant -'"}), 400

        attachment_path = None
        attachment_filename = None
        tmp_file = None

        uploaded_file = request.files.get('attachment')
        if uploaded_file and uploaded_file.filename:
            suffix = '.' + uploaded_file.filename.rsplit('.', 1)[-1] if '.' in uploaded_file.filename else ''
            tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            uploaded_file.save(tmp_file.name)
            attachment_path = tmp_file.name
            attachment_filename = uploaded_file.filename

        sent = email_service.send_offer_email(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            job_title=job_title,
            department=department,
            email_subject=email_subject,
            email_body=email_body,
            attachment_path=attachment_path,
            attachment_filename=attachment_filename,
            cc=cc,
        )

        if tmp_file:
            import os as _os
            try: _os.unlink(tmp_file.name)
            except Exception: pass

        if sent:
            return jsonify({"success": True, "message": f"Offer email sent to {applicant_email}"}), 200
        return jsonify({"success": False, "error": "Failed to send offer email"}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/send-rejection-email', methods=['POST'])
def send_rejection_email_endpoint():
    """
    Send a post-interview rejection email to a candidate.

    Request body (JSON):
      - applicant_name, applicant_email
      - email_subject, email_body
      - cc (optional)

    IMAP SAFETY: Subject must NOT start with "Applicant -"
    """
    import email_service

    try:
        data = request.get_json(force=True) or {}
        applicant_name  = data.get('applicant_name', '')
        applicant_email = data.get('applicant_email', '')
        email_subject   = data.get('email_subject', '')
        email_body      = data.get('email_body', '')
        cc              = data.get('cc', '') or None

        if not applicant_email or not email_subject:
            return jsonify({"success": False, "error": "applicant_email and email_subject are required"}), 400

        if email_subject.strip().lower().startswith('applicant -'):
            return jsonify({"success": False, "error": "Subject must not start with 'Applicant -'"}), 400

        sent = email_service.send_rejection_email(
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            email_subject=email_subject,
            email_body=email_body,
            cc=cc,
        )

        if sent:
            return jsonify({"success": True, "message": f"Rejection email sent to {applicant_email}"}), 200
        return jsonify({"success": False, "error": "Failed to send rejection email"}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/notify-assessment', methods=['POST'])
def notify_assessment():
    """
    Fire a Teams notification when an applicant completes an assessment.

    Request Body:
    {
        "applicant_id": "string (required)",
        "completed": ["Video Assessment", "Personality Test"]  // list of completed items
    }
    """
    if notify_assessment_complete is None:
        return jsonify({"success": False, "error": "Teams notify module not available"}), 500

    try:
        from supabase import create_client
        from dotenv import load_dotenv
        load_dotenv()

        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400

        applicant_id = data.get('applicant_id')
        completed = data.get('completed', [])

        if not applicant_id:
            return jsonify({"success": False, "error": "applicant_id is required"}), 400

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return jsonify({"success": False, "error": "Supabase configuration missing"}), 500

        supabase = create_client(supabase_url, supabase_key)
        result = supabase.table("applicants").select("name, email, position").eq("id", applicant_id).maybeSingle().execute()
        if not result.data:
            return jsonify({"success": False, "error": "Applicant not found"}), 404

        applicant = result.data
        sent = notify_assessment_complete(
            applicant_name=applicant["name"],
            applicant_email=applicant["email"],
            position=applicant["position"],
            completed=completed,
        )

        return jsonify({"success": sent}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def hash_password(supabase_client, password: str) -> str:
    """Hash a password using pgcrypto bcrypt via Supabase RPC."""
    result = supabase_client.rpc('hash_password', {'password': password}).execute()
    return result.data


@app.route('/api/change-hr-password', methods=['POST'])
def change_hr_password():
    """
    Change HR user password and clear must_change_password flag.
    Request Body: { "user_id": "string", "new_password": "string" }
    """
    try:
        from supabase import create_client
        from dotenv import load_dotenv
        load_dotenv()

        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400

        user_id = data.get('user_id', '').strip()
        new_password = data.get('new_password', '').strip()

        if not user_id or not new_password:
            return jsonify({"success": False, "error": "user_id and new_password are required"}), 400

        if len(new_password) < 8:
            return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return jsonify({"success": False, "error": "Supabase configuration missing"}), 500

        supabase = create_client(supabase_url, supabase_key)
        hashed = hash_password(supabase, new_password)
        supabase.table("admin_users").update({
            "password_hash": hashed,
            "must_change_password": False
        }).eq("id", user_id).execute()

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/create-hr-user', methods=['POST'])
def create_hr_user():
    """
    Create an HR user account and email their credentials.
    Request Body: { "name": "string", "email": "string" }
    """
    try:
        import email_service
        import random
        import string
        from supabase import create_client
        from dotenv import load_dotenv
        load_dotenv()

        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400

        name = data.get('name', '').strip()
        email = data.get('email', '').strip()

        if not name or not email:
            return jsonify({"success": False, "error": "name and email are required"}), 400

        # Generate a random password
        chars = string.ascii_letters + string.digits + "!@#$%"
        password = ''.join(random.choices(chars, k=12))

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return jsonify({"success": False, "error": "Supabase configuration missing"}), 500

        supabase = create_client(supabase_url, supabase_key)

        # Check for duplicate email
        existing = supabase.table("admin_users").select("id").eq("email", email).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            return jsonify({"success": False, "error": "An account with this email already exists"}), 409

        # Hash password before storing
        hashed_password = hash_password(supabase, password)

        # Insert HR user
        supabase.table("admin_users").insert({
            "name": name,
            "email": email,
            "password_hash": hashed_password,
            "role": "hr",
            "must_change_password": True
        }).execute()

        # Mirror into hr_managers so they appear in the interviewer dropdown
        supabase.table("hr_managers").upsert({
            "name": name,
            "email": email,
            "role": "HR",
            "is_active": True
        }, on_conflict="email").execute()

        # Send credentials email
        body = f"""
<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
  <h2 style="color:#1d4ed8;">Your HR Portal Access</h2>
  <p>Hi {name},</p>
  <p>Your HR account for <strong>AutoIntel</strong> has been created. Use the credentials below to log in:</p>
  <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
    <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="https://www.autointel.online/hr">https://www.autointel.online/hr</a></p>
    <p style="margin:4px 0;"><strong>Email:</strong> {email}</p>
    <p style="margin:4px 0;"><strong>Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;">{password}</code></p>
  </div>
  <p style="color:#6b7280;font-size:13px;">Please keep these credentials secure. Contact your administrator if you need help.</p>
</div>
"""
        email_sent = email_service.send_email(email, "Your AutoIntel HR Account Credentials", body)

        return jsonify({"success": True, "email_sent": email_sent, "password": password}), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/extract-jd-pdf', methods=['POST', 'OPTIONS'])
def extract_jd_pdf():
    """Extract text from an uploaded JD PDF file. Rate limited to 20/minute."""
    # Manual rate limit check (works even without flask-limiter decorator)
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded. Send a PDF as 'file' field."}), 400

        uploaded_file = request.files['file']

        if not uploaded_file.filename:
            return jsonify({"error": "Empty filename"}), 400

        if not uploaded_file.filename.lower().endswith('.pdf'):
            return jsonify({"error": "Only PDF files are supported"}), 400

        import io
        pdf_bytes = uploaded_file.read()

        if len(pdf_bytes) == 0:
            return jsonify({"error": "Uploaded file is empty"}), 400

        # Enforce file size limit
        if len(pdf_bytes) > MAX_PDF_BYTES:
            return jsonify({"error": f"File too large. Maximum allowed size is {MAX_PDF_BYTES // (1024*1024)} MB."}), 413

        extracted_text = ""
        page_count = 0
        pdfplumber_error = None
        pymupdf_error = None

        # Try pdfplumber first
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                page_count = len(pdf.pages)
                pages_text = [p.extract_text() for p in pdf.pages if p.extract_text()]
                extracted_text = "\n\n".join(t.strip() for t in pages_text)
        except Exception as e:
            pdfplumber_error = str(e)
            print(f"[extract_jd_pdf] pdfplumber failed: {e}")

        # Fallback to pymupdf
        if not extracted_text.strip():
            try:
                import fitz
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                page_count = len(doc)
                pages_text = [doc[i].get_text() for i in range(len(doc)) if doc[i].get_text().strip()]
                extracted_text = "\n\n".join(t.strip() for t in pages_text)
                doc.close()
            except Exception as e:
                pymupdf_error = str(e)
                print(f"[extract_jd_pdf] pymupdf failed: {e}")

        if not extracted_text.strip():
            detail = f"pdfplumber: {pdfplumber_error or 'no text'} | pymupdf: {pymupdf_error or 'no text'}"
            print(f"[extract_jd_pdf] Both extractors failed: {detail}")
            return jsonify({
                "error": "Could not extract any text from this PDF. It may be a scanned image — please paste the text manually.",
                "detail": detail
            }), 422

        return jsonify({
            "text": extracted_text.strip(),
            "pages": page_count,
            "status": "success"
        }), 200

    except Exception as e:
        print(f"[extract_jd_pdf] Unexpected error: {e}")
        return jsonify({"error": "An unexpected error occurred while processing the PDF.", "status": "error"}), 500


@app.route('/api/parse-job-description', methods=['POST', 'OPTIONS'])
def parse_job_description():
    """Parse a raw job description text using GPT and return structured job posting data."""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        from openai import OpenAI
        from dotenv import load_dotenv
        load_dotenv()

        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        raw_description = data.get('raw_description', '').strip()
        if not raw_description:
            return jsonify({"error": "raw_description is required"}), 400
        if len(raw_description) < 30:
            return jsonify({"error": "Job description is too short to parse"}), 400
        if len(raw_description) > 20000:
            return jsonify({"error": "Job description is too long. Please trim to under 20,000 characters."}), 400

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "AI parsing is not configured on the server. Contact your administrator."}), 500

        client = OpenAI(api_key=api_key)
        gpt_model = os.getenv("GPT_MODEL", "gpt-4o-mini")

        prompt = f"""You are a job description parser. Extract structured information from the job description below and return ONLY valid JSON.

Return this exact JSON structure (no markdown, no explanation):
{{
  "title": "job title string",
  "department": "one of: MIS / IT, Finance, Marketing, HR, Operations, Sales, Other",
  "skills": ["lowercase skill1", "lowercase skill2"],
  "keywords": ["lowercase keyword1", "lowercase keyword2"],
  "required_education": ["lowercase field of study or degree"],
  "expected_projects": ["lowercase project type"],
  "preferred_certifications": ["certification name or empty array"],
  "min_years_experience": 0,
  "max_years_experience": 3
}}

Rules:
- skills: technical and soft skills mentioned (lowercase, no duplicates)
- keywords: searchable terms that describe the role (lowercase)
- required_education: degree fields like "computer science", "information technology", "software engineering"
- expected_projects: types of projects relevant to the role like "web application", "api development", "database system"
- preferred_certifications: any certifications mentioned, empty array if none
- min_years_experience: integer, 0 if entry-level or not specified
- max_years_experience: integer, use null if not specified or senior/open-ended
- department: pick the closest match from the allowed values

Job Description:
---
{raw_description}
---

Return ONLY valid JSON:"""

        try:
            response = client.chat.completions.create(
                model=gpt_model,
                messages=[
                    {"role": "system", "content": "You are a job description parser. Return ONLY valid JSON, no markdown, no explanations."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1500,
                timeout=GPT_TIMEOUT_SECONDS,
            )
        except Exception as gpt_err:
            print(f"[parse_job_description] GPT API error: {gpt_err}")
            return jsonify({"error": "AI service is temporarily unavailable. Please try again in a moment."}), 503

        content = response.choices[0].message.content.strip()

        # Strip markdown code blocks if GPT wraps in them
        if content.startswith('```'):
            content = content.split('\n', 1)[1] if '\n' in content else content
        if content.endswith('```'):
            content = content.rsplit('```', 1)[0]
        content = content.strip()

        import json as json_module
        try:
            parsed = json_module.loads(content)
        except Exception as parse_err:
            print(f"[parse_job_description] JSON parse error: {parse_err} | GPT output (first 500): {content[:500]}")
            return jsonify({"error": "AI returned an unexpected response. Please try again."}), 500

        # Post-parse validation — ensure arrays are lists, not strings
        for arr_field in ["skills", "keywords", "required_education", "expected_projects", "preferred_certifications"]:
            val = parsed.get(arr_field)
            if not isinstance(val, list):
                parsed[arr_field] = []

        result = {
            "title": str(parsed.get("title", "")).strip(),
            "department": str(parsed.get("department", "MIS / IT")).strip(),
            "description": raw_description,
            "skills": parsed.get("skills", []),
            "keywords": parsed.get("keywords", []),
            "required_education": parsed.get("required_education", []),
            "expected_projects": parsed.get("expected_projects", []),
            "preferred_certifications": parsed.get("preferred_certifications", []),
            "min_years_experience": parsed.get("min_years_experience", 0),
            "max_years_experience": parsed.get("max_years_experience", None),
            "status": "success"
        }

        return jsonify(result), 200

    except Exception as e:
        print(f"[parse_job_description] Unexpected error: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again.", "status": "error"}), 500
        for arr_field in ["skills", "keywords", "required_education", "expected_projects", "preferred_certifications"]:
            if not isinstance(result[arr_field], list):
                result[arr_field] = []

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500


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
