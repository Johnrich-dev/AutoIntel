"""
API endpoint to trigger transcription processing.
Can be called from frontend or integrated into web framework.

Features:
- REST API for manual triggering
- Background worker that automatically polls for pending transcriptions
- Supabase Realtime subscription for instant notifications
"""

import os
import sys
import threading
import time
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from process_transcription import process_video_transcription
from supabase import create_client, create_client as supabase_client
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)

# Background worker settings
POLLING_INTERVAL_SECONDS = 10  # Check for pending transcriptions every 10 seconds
background_worker_running = False
processed_ids = set()  # Track already processed IDs in this session


def poll_for_pending_transcriptions():
    """
    Background worker that polls the database for pending transcriptions
    and automatically processes them.
    """
    global processed_ids
    
    print(f"[Background Worker] Starting transcription poller (interval: {POLLING_INTERVAL_SECONDS}s)")
    
    while background_worker_running:
        try:
            # Query for pending transcriptions
            response = supabase.table("video_assessments").select(
                "id, video_url, applicant_id, language"
            ).eq("transcription_status", "pending").execute()
            
            pending = response.data if response.data else []
            
            if pending:
                print(f"[Background Worker] Found {len(pending)} pending transcription(s)")
                
                for item in pending:
                    assessment_id = item.get("id")
                    video_url = item.get("video_url")
                    language = item.get("language", "en")
                    
                    # Skip if already processed in this session
                    if assessment_id in processed_ids:
                        continue
                    
                    # Skip if no video URL
                    if not video_url:
                        print(f"[Background Worker] Skipping {assessment_id}: No video URL")
                        continue
                    
                    print(f"[Background Worker] Auto-processing: {assessment_id}")
                    
                    # Mark as processed to avoid duplicates
                    processed_ids.add(assessment_id)
                    
                    # Process the transcription
                    success = process_video_transcription(assessment_id, video_url, language)
                    
                    if success:
                        print(f"[Background Worker] ✓ Completed: {assessment_id}")
                    else:
                        print(f"[Background Worker] ✗ Failed: {assessment_id}")
                        # Remove from processed set so it can be retried
                        processed_ids.discard(assessment_id)
            
        except Exception as e:
            print(f"[Background Worker] Error: {e}")
        
        # Wait before next poll
        time.sleep(POLLING_INTERVAL_SECONDS)
    
    print("[Background Worker] Stopped")


def start_background_worker():
    """Start the background worker in a separate thread."""
    global background_worker_running
    
    if not background_worker_running:
        background_worker_running = True
        worker_thread = threading.Thread(target=poll_for_pending_transcriptions, daemon=True)
        worker_thread.start()
        print("[Background Worker] Started")


def stop_background_worker():
    """Stop the background worker."""
    global background_worker_running
    background_worker_running = False


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
            "transcription_status", "transcription", "transcription_error", "transcribed_at",
            "transcript_score", "validation_status"
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
        'service': 'transcription-api',
        'background_worker': 'running' if background_worker_running else 'stopped'
    })


@app.route('/api/worker/start', methods=['POST'])
def start_worker():
    """Manually start the background worker."""
    start_background_worker()
    return jsonify({
        'success': True,
        'message': 'Background worker started'
    })


@app.route('/api/worker/stop', methods=['POST'])
def stop_worker():
    """Manually stop the background worker."""
    stop_background_worker()
    return jsonify({
        'success': True,
        'message': 'Background worker stopped'
    })


if __name__ == '__main__':
    print("Starting Transcription API Server...")
    print("Features:")
    print("  - REST API for manual transcription triggering")
    print("  - Background worker that auto-processes pending transcriptions")
    print("  - Polls every 10 seconds for new pending transcriptions")
    print("\nEndpoints:")
    print("  POST /api/trigger-transcription")
    print("  GET  /api/transcription-status/<id>")
    print("  GET  /api/health")
    print("  POST /api/worker/start")
    print("  POST /api/worker/stop")
    print("\nServer running on http://localhost:5000")
    
    # Start background worker automatically
    start_background_worker()
    
    app.run(host='0.0.0.0', port=5000, debug=False)
