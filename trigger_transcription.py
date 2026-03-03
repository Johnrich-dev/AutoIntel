"""
API endpoint to trigger transcription processing.
Can be called from frontend or integrated into web framework.
"""

import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from process_transcription import process_video_transcription
from supabase import create_client

app = Flask(__name__)
CORS(app)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)


@app.route('/api/trigger-transcription', methods=['POST'])
def trigger_transcription():
    """
    Trigger transcription for a video assessment.
    
    Request body:
        - assessment_id: ID of the video assessment
        - language: Language code (default: "en")
    
    Returns:
        JSON with status and message
    """
    try:
        data = request.get_json()
        assessment_id = data.get('assessment_id')
        language = data.get('language', 'en')
        
        if not assessment_id:
            return jsonify({
                'success': False,
                'error': 'Missing assessment_id'
            }), 400
        
        # Get video assessment
        response = supabase.table("video_assessments").select("*").eq(
            "id", assessment_id
        ).execute()
        
        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Assessment not found'
            }), 404
        
        assessment = response.data[0]
        video_url = assessment.get('video_url')
        
        if not video_url:
            return jsonify({
                'success': False,
                'error': 'No video URL found'
            }), 400
        
        # Check if already processing
        if assessment.get('transcription_status') == 'processing':
            return jsonify({
                'success': False,
                'error': 'Transcription already in progress'
            }), 409
        
        # Check if already completed
        if assessment.get('transcription_status') == 'completed':
            return jsonify({
                'success': True,
                'message': 'Transcription already completed',
                'transcription': assessment.get('transcription')
            })
        
        # Process transcription (this runs synchronously - consider async for production)
        print(f"Starting transcription for: {assessment_id}")
        success = process_video_transcription(assessment_id, video_url, language)
        
        if success:
            # Get updated assessment
            updated = supabase.table("video_assessments").select("*").eq(
                "id", assessment_id
            ).execute()
            
            return jsonify({
                'success': True,
                'message': 'Transcription completed successfully',
                'transcription': updated.data[0].get('transcription') if updated.data else None
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Transcription failed'
            }), 500
            
    except Exception as e:
        print(f"API error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/transcription-status/<assessment_id>', methods=['GET'])
def get_transcription_status(assessment_id: str):
    """Get transcription status for an assessment."""
    try:
        response = supabase.table("video_assessments").select(
            "transcription_status", "transcription", "transcription_error", "transcribed_at"
        ).eq("id", assessment_id).execute()
        
        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Assessment not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': response.data[0]
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'transcription-api'
    })


if __name__ == '__main__':
    print("Starting Transcription API Server...")
    print("Endpoints:")
    print("  POST /api/trigger-transcription")
    print("  GET  /api/transcription-status/<id>")
    print("  GET  /api/health")
    print("\nServer running on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
