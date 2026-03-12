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
        "job_level": "entry_level",           // Optional: fresh_grad, entry_level, mid_level
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
        job_level = data.get('job_level', 'entry_level')
        auto_detect_job_level = data.get('auto_detect_job_level', True)  # Default to True
        weights = data.get('weights')
        baselines = data.get('baselines')
        requirement_weight = data.get('requirement_weight', 0.6)
        count_weight = data.get('count_weight', 0.4)
        
        # Validate required fields
        if not parsed_resume_json:
            return jsonify({"error": "parsed_resume_json is required"}), 400
        if not job_posting:
            return jsonify({"error": "job_posting is required"}), 400
        
        # Calculate final hybrid score
        result = job_alignment.calculate_final_hybrid_score(
            parsed_resume_json=parsed_resume_json,
            job_posting=job_posting,
            job_level=job_level,
            weights=weights,
            baselines=baselines,
            requirement_weight=requirement_weight,
            count_weight=count_weight,
            auto_detect_job_level=auto_detect_job_level
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
    Get the preset weights, baselines, and thresholds for all job levels.
    
    Response:
    {
        "fresh_grad": {
            "weights": {...},
            "baselines": {...},
            "thresholds": {...}
        },
        "entry_level": {...},
        "mid_level": {...},
        "status": "success"
    }
    """
    try:
        return jsonify({
            "presets": job_alignment.JOB_LEVEL_PRESETS,
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
