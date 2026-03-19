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
    Schedule an interview and send email notification to applicant.
    
    Request Body:
    {
        "applicant_email": "string (required)",
        "applicant_name": "string (required)",
        "position": "string (required)",
        "interview_date": "string - ISO date format (required)",
        "interview_time": "string - HH:MM format (required)",
        "interview_platform": "string (optional)",
        "interview_notes": "string (optional)"
    }
    
    Response:
    {
        "success": true,
        "message": "Interview scheduled and email sent",
        "status": "success"
    }
    """
    try:
        # Import email service
        try:
            import email_service
        except ImportError as e:
            return jsonify({"error": f"Could not import email_service: {e}"}), 500
        
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract parameters
        applicant_email = data.get('applicant_email')
        applicant_name = data.get('applicant_name')
        position = data.get('position')
        interview_date = data.get('interview_date')
        interview_time = data.get('interview_time')
        interview_platform = data.get('interview_platform', 'Google Meet')
        interview_notes = data.get('interview_notes', '')
        
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
        
        # Format the interview date/time
        try:
            # Parse the date
            date_obj = datetime.fromisoformat(interview_date.replace('Z', '+00:00'))
            formatted_date = date_obj.strftime('%B %d, %Y')
        except:
            formatted_date = interview_date
        
        # Build email content
        subject = f"Interview Scheduled - {position} at AutoIntel"
        
        body_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }}
                .detail-row {{ display: flex; margin-bottom: 10px; }}
                .detail-label {{ font-weight: bold; width: 120px; color: #666; }}
                .detail-value {{ color: #333; }}
                .button {{ display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
                .footer {{ text-align: center; margin-top: 20px; color: #999; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Interview Scheduled! 🎉</h1>
                    <p>AutoIntel Recruitment</p>
                </div>
                <div class="content">
                    <p>Dear <strong>{applicant_name}</strong>,</p>
                    <p>We are pleased to inform you that your interview for the <strong>{position}</strong> position has been scheduled.</p>
                    
                    <div class="details">
                        <div class="detail-row">
                            <span class="detail-label">Date:</span>
                            <span class="detail-value">{formatted_date}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Time:</span>
                            <span class="detail-value">{interview_time}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Platform:</span>
                            <span class="detail-value">{interview_platform}</span>
                        </div>
                        {f'<div class="detail-row"><span class="detail-label">Notes:</span><span class="detail-value">{interview_notes}</span></div>' if interview_notes else ''}
                    </div>
                    
                    <p>Please ensure you:</p>
                    <ul>
                        <li>Test your audio and video before the interview</li>
                        <li>Find a quiet and well-lit location</li>
                        <li>Have your resume ready for reference</li>
                    </ul>
                    
                    <p>We look forward to speaking with you!</p>
                    
                    <div class="footer">
                        <p>This is an automated message from AutoIntel Recruitment System</p>
                        <p>© {datetime.now().year} AutoIntel. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Send the email
        success = email_service.send_email(applicant_email, subject, body_html)
        
        if success:
            return jsonify({
                "success": True,
                "message": "Interview scheduled and email sent successfully",
                "status": "success"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send email. Please check email configuration.",
                "status": "error"
            }), 500
            
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
