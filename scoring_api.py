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
    print("  GET  /api/health                - Health check")
    print("  POST /api/calculate-fit        - Calculate job fit score (resume vs job)")
    print("  POST /api/calculate-similarity  - Calculate similarity between two texts")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    app.run(host=API_HOST, port=API_PORT, debug=DEBUG_MODE)
