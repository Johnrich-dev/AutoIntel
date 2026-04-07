#!/usr/bin/env python3
"""
Transcription API for AutoIntel
Combines DB orchestration, background worker, and Flask REST endpoints.

Sections:
  1. DB orchestration  - download_video, get_video_duration_ffprobe,
                         process_video_transcription, process_pending_transcriptions,
                         retry_failed_transcriptions
  2. Background worker - poll_for_pending_transcriptions, start/stop worker
  3. Flask REST API    - /api/trigger-transcription, /api/transcription-status,
                         /api/health, /api/worker/start, /api/worker/stop

Run as server:  python transcription_api.py
Run as CLI:     python transcription_api.py --batch 5
                python transcription_api.py --single <assessment_id>
                python transcription_api.py --retry
"""

import os
import sys
import tempfile
import threading
import time
import logging
import argparse
from typing import Optional

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client

from transcription_service import transcribe_video_with_timestamps, process_video_scoring, get_ffmpeg_path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ── Supabase ───────────────────────────────────────────────────────────────────
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not supabase_url or not supabase_key:
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)

# ── Worker config ──────────────────────────────────────────────────────────────
POLL_INTERVAL = 60          # seconds between worker cycles
BATCH_SIZE = 5              # max videos per cycle
MAX_CONCURRENT = 2          # max simultaneous processing jobs
POLLING_INTERVAL_SECONDS = 10  # Flask background worker poll interval

background_worker_running = False
processed_ids: set = set()  # track IDs processed this session


# ── DB orchestration ───────────────────────────────────────────────────────────

def download_video(video_url: str, output_path: str) -> bool:
    """Download a video from a URL to a local file."""
    try:
        print(f"Downloading video from: {video_url[:60]}...")
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        file_size = os.path.getsize(output_path) / (1024 * 1024)
        print(f"Downloaded: {file_size:.2f} MB")
        return True
    except Exception as e:
        print(f"Download failed: {e}")
        return False


def get_video_duration_ffprobe(video_path: str) -> Optional[int]:
    """Return video duration in seconds using ffprobe, or None on failure."""
    import subprocess
    ffmpeg_path = get_ffmpeg_path()
    try:
        result = subprocess.run(
            [ffmpeg_path, "-i", video_path, "-hide_banner"],
            capture_output=True, text=True, timeout=30,
        )
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                duration_str = line.split("Duration:")[1].split(",")[0].strip()
                parts = duration_str.split(":")
                total = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
                return int(total)
        return None
    except Exception as e:
        print(f"Warning: Could not get video duration: {e}")
        return None


def process_video_transcription(
    video_assessment_id: str,
    video_url: str,
    language: str = "en",
) -> bool:
    """
    Full pipeline for one video assessment:
      download -> transcribe -> score -> save to DB.

    Returns True on success.
    """
    print(f"\n{'='*60}\nProcessing: {video_assessment_id}\n{'='*60}\n")
    video_path = None

    try:
        supabase.table("video_assessments").update(
            {"transcription_status": "processing"}
        ).eq("id", video_assessment_id).execute()

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            video_path = tmp.name

        if not download_video(video_url, video_path):
            raise Exception("Failed to download video")

        video_duration = get_video_duration_ffprobe(video_path)
        print(f"Duration: {video_duration}s" if video_duration else "Duration unknown")

        result = transcribe_video_with_timestamps(video_path, language)
        if not result:
            raise Exception("Transcription returned no result")

        segments_json = result.get("segments", [])
        transcript_text = result["text"]

        # Fetch job context for scoring
        job_title = job_description = ""
        job_skills = []
        assessment_resp = supabase.table("video_assessments").select(
            "applicant_id"
        ).eq("id", video_assessment_id).execute()

        if assessment_resp.data:
            applicant_id = assessment_resp.data[0].get("applicant_id")
            if applicant_id:
                app_resp = supabase.table("applicants").select(
                    "applied_job_id"
                ).eq("id", applicant_id).execute()
                if app_resp.data:
                    job_id = app_resp.data[0].get("applied_job_id")
                    if job_id:
                        job_resp = supabase.table("job_postings").select(
                            "title, description, skills"
                        ).eq("job_id", job_id).execute()
                        if job_resp.data:
                            jp = job_resp.data[0]
                            job_title = jp.get("title", "") or ""
                            job_description = jp.get("description", "") or ""
                            job_skills = jp.get("skills", []) or []
                            print(f"Job context: {job_title}")

        scoring_result = process_video_scoring(
            video_assessment_id=video_assessment_id,
            transcript=transcript_text,
            video_duration_seconds=video_duration,
            job_title=job_title,
            job_description=job_description,
            job_skills=job_skills,
        )

        update_data = {
            "transcription": transcript_text,
            "transcription_status": "completed",
            "transcribed_at": "now()",
            "transcription_segments": segments_json or None,
            "video_duration_seconds": video_duration,
            "transcript_word_count": scoring_result.get("word_count", 0),
            "validation_status": scoring_result.get("validation_status", "pending"),
            "validation_message": scoring_result.get("validation_message", ""),
        }

        if scoring_result.get("scored"):
            update_data.update({
                "transcript_score": scoring_result.get("final_score", 0),
                "relevance_score": scoring_result.get("relevance_score", 0),
                "experience_score": scoring_result.get("experience_score", 0),
                "skills_score": scoring_result.get("skills_score", 0),
                "completeness_score": scoring_result.get("completeness_score", 0),
                "scored_at": "now()",
            })
            print(f"Score: {scoring_result.get('final_score', 0)}/10")
        else:
            print(f"Scoring skipped: {scoring_result.get('validation_message')}")

        supabase.table("video_assessments").update(update_data).eq(
            "id", video_assessment_id
        ).execute()
        print(f"Saved. Text: {len(transcript_text)} chars, Segments: {len(segments_json)}")
        return True

    except Exception as e:
        print(f"Failed: {e}")
        supabase.table("video_assessments").update({
            "transcription_status": "failed",
            "transcription_error": str(e)[:500],
        }).eq("id", video_assessment_id).execute()
        return False

    finally:
        if video_path and os.path.exists(video_path):
            os.remove(video_path)


def process_pending_transcriptions(batch_size: int = BATCH_SIZE) -> int:
    """Process up to batch_size pending transcriptions. Returns count processed."""
    print(f"\nFetching up to {batch_size} pending transcriptions...")
    response = supabase.table("video_assessments").select("*").eq(
        "transcription_status", "pending"
    ).limit(batch_size).execute()

    pending = response.data or []
    if not pending:
        print("No pending transcriptions.")
        return 0

    processed = 0
    for item in pending:
        video_url = item.get("video_url")
        if not video_url:
            print(f"Skipping {item['id']}: no video URL")
            continue
        if process_video_transcription(item["id"], video_url, "en"):
            processed += 1

    print(f"Batch complete: {processed}/{len(pending)} successful")
    return processed


def retry_failed_transcriptions(max_retries: int = 3) -> int:
    """Reset and retry up to max_retries failed transcriptions."""
    response = supabase.table("video_assessments").select("*").eq(
        "transcription_status", "failed"
    ).limit(max_retries).execute()

    failed = response.data or []
    if not failed:
        print("No failed transcriptions.")
        return 0

    retried = 0
    for item in failed:
        video_url = item.get("video_url")
        if not video_url:
            continue
        supabase.table("video_assessments").update({
            "transcription_status": "pending",
            "transcription_error": None,
        }).eq("id", item["id"]).execute()
        if process_video_transcription(item["id"], video_url):
            retried += 1
    return retried


# ── Background worker ──────────────────────────────────────────────────────────

def _get_pending_count() -> int:
    try:
        r = supabase.table("video_assessments").select("id", count="exact").eq(
            "transcription_status", "pending"
        ).execute()
        return r.count or 0
    except Exception as e:
        logger.error(f"Error checking pending count: {e}")
        return 0


def _get_processing_count() -> int:
    try:
        r = supabase.table("video_assessments").select("id", count="exact").eq(
            "transcription_status", "processing"
        ).execute()
        return r.count or 0
    except Exception as e:
        logger.error(f"Error checking processing count: {e}")
        return 0


def _poll_loop():
    """Internal loop used by the background worker thread."""
    global processed_ids
    logger.info(f"Background worker started (poll every {POLLING_INTERVAL_SECONDS}s)")

    while background_worker_running:
        try:
            response = supabase.table("video_assessments").select(
                "id, video_url"
            ).eq("transcription_status", "pending").execute()

            for item in (response.data or []):
                assessment_id = item.get("id")
                video_url = item.get("video_url")
                language = "en"

                if assessment_id in processed_ids or not video_url:
                    continue

                logger.info(f"Auto-processing: {assessment_id}")
                processed_ids.add(assessment_id)
                success = process_video_transcription(assessment_id, video_url, language)
                if not success:
                    processed_ids.discard(assessment_id)

        except Exception as e:
            logger.error(f"Worker error: {e}")

        time.sleep(POLLING_INTERVAL_SECONDS)

    logger.info("Background worker stopped")


def start_background_worker():
    global background_worker_running
    if not background_worker_running:
        background_worker_running = True
        threading.Thread(target=_poll_loop, daemon=True).start()
        logger.info("Background worker started")


def stop_background_worker():
    global background_worker_running
    background_worker_running = False


# ── Flask app ──────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)


@app.route("/api/trigger-transcription", methods=["POST"])
def trigger_transcription():
    """Manually trigger transcription for a single assessment."""
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No JSON data provided"}), 400

    assessment_id = data.get("assessment_id")
    language = data.get("language", "en")

    if not assessment_id:
        return jsonify({"success": False, "error": "Missing assessment_id"}), 400

    response = supabase.table("video_assessments").select("*").eq(
        "id", assessment_id
    ).execute()
    if not response.data:
        return jsonify({"success": False, "error": "Assessment not found"}), 404

    assessment = response.data[0]
    video_url = assessment.get("video_url")

    if not video_url:
        return jsonify({"success": False, "error": "No video URL found"}), 400
    if assessment.get("transcription_status") == "processing":
        return jsonify({"success": False, "error": "Transcription already in progress"}), 409
    if assessment.get("transcription_status") == "completed":
        return jsonify({
            "success": True,
            "message": "Transcription already completed",
            "transcription": assessment.get("transcription"),
        })

    success = process_video_transcription(assessment_id, video_url, language)
    if success:
        updated = supabase.table("video_assessments").select("*").eq(
            "id", assessment_id
        ).execute()
        return jsonify({
            "success": True,
            "message": "Transcription completed successfully",
            "transcription": updated.data[0].get("transcription") if updated.data else None,
        })
    return jsonify({"success": False, "error": "Transcription failed"}), 500


@app.route("/api/transcription-status/<assessment_id>", methods=["GET"])
def get_transcription_status(assessment_id: str):
    """Get transcription status for an assessment."""
    response = supabase.table("video_assessments").select(
        "transcription_status, transcription, transcription_error, transcribed_at, "
        "transcript_score, validation_status"
    ).eq("id", assessment_id).execute()

    if not response.data:
        return jsonify({"success": False, "error": "Assessment not found"}), 404
    return jsonify({"success": True, "data": response.data[0]})


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "transcription-api",
        "background_worker": "running" if background_worker_running else "stopped",
    })


@app.route("/api/worker/start", methods=["POST"])
def start_worker():
    start_background_worker()
    return jsonify({"success": True, "message": "Background worker started"})


@app.route("/api/worker/stop", methods=["POST"])
def stop_worker():
    stop_background_worker()
    return jsonify({"success": True, "message": "Background worker stopped"})


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcription API / CLI")
    parser.add_argument("--single", "-s", help="Process single assessment by ID")
    parser.add_argument("--batch", "-b", type=int, default=0, help="Process N pending (CLI mode)")
    parser.add_argument("--retry", "-r", action="store_true", help="Retry failed transcriptions")
    parser.add_argument("--serve", action="store_true", default=True, help="Start Flask server (default)")
    args = parser.parse_args()

    if args.single:
        resp = supabase.table("video_assessments").select("*").eq("id", args.single).execute()
        if not resp.data:
            print(f"Assessment not found: {args.single}")
            sys.exit(1)
        item = resp.data[0]
        success = process_video_transcription(args.single, item.get("video_url", ""))
        sys.exit(0 if success else 1)

    elif args.retry:
        count = retry_failed_transcriptions()
        print(f"Retried {count} transcriptions")

    elif args.batch:
        count = process_pending_transcriptions(batch_size=args.batch)
        print(f"Processed {count} transcriptions")

    else:
        print("Starting Transcription API Server...")
        print("Endpoints:")
        print("  POST /api/trigger-transcription")
        print("  GET  /api/transcription-status/<id>")
        print("  GET  /api/health")
        print("  POST /api/worker/start | /api/worker/stop")
        start_background_worker()
        app.run(host="0.0.0.0", port=5000, debug=False)
