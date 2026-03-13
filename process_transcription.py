"""
Background processing script for video transcription using whisper-small.
Run this to process pending transcriptions or integrate into a job queue.
"""

import os
import sys
import tempfile
import requests
from typing import Optional
from supabase import create_client
from transcription_service import transcribe_video_with_timestamps
from transcript_scoring_service import process_video_scoring

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("[OK] Loaded environment variables from .env file")
except ImportError:
    print("[WARNING] python-dotenv not installed, using system environment variables")

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)


def download_video(video_url: str, output_path: str) -> bool:
    """Download video from URL to local file."""
    try:
        print(f"Downloading video from: {video_url[:60]}...")
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # MB
        print(f"✓ Downloaded: {file_size:.2f} MB")
        return True
    except Exception as e:
        print(f"✗ Download failed: {str(e)}")
        return False


def get_video_duration_ffprobe(video_path: str) -> Optional[int]:
    """
    Get video duration using ffprobe.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        Duration in seconds or None if failed
    """
    import subprocess
    
    ffmpeg_path = get_ffmpeg_path()
    
    try:
        result = subprocess.run(
            [ffmpeg_path, '-i', video_path, '-hide_banner'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # Parse duration from output
        output = result.stderr
        for line in output.split('\n'):
            if 'Duration:' in line:
                # Format: Duration: 00:02:30.50
                duration_str = line.split('Duration:')[1].split(',')[0].strip()
                parts = duration_str.split(':')
                hours = int(parts[0])
                minutes = int(parts[1])
                seconds = float(parts[2])
                total_seconds = int(hours * 3600 + minutes * 60 + seconds)
                return total_seconds
        
        return None
    except Exception as e:
        print(f"Warning: Could not get video duration: {e}")
        return None


def get_ffmpeg_path() -> str:
    """Get the path to ffmpeg executable."""
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    return "ffmpeg"


def process_video_transcription(
    video_assessment_id: str, 
    video_url: str, 
    language: str = "en"
) -> bool:
    """
    Process transcription for a submitted video.
    
    Args:
        video_assessment_id: The ID of the video assessment record
        video_url: URL to the video file
        language: Language code (default: "en")
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n{'='*60}")
    print(f"Processing: {video_assessment_id}")
    print(f"{'='*60}\n")
    
    video_path = None
    
    try:
        # Update status to processing
        print("Setting status to 'processing'...")
        supabase.table("video_assessments").update({
            "transcription_status": "processing"
        }).eq("id", video_assessment_id).execute()
        
        # Create temporary file for video
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            video_path = tmp.name
        
        # Download video
        if not download_video(video_url, video_path):
            raise Exception("Failed to download video")
        
        # Get video duration
        print("Getting video duration...")
        video_duration = get_video_duration_ffprobe(video_path)
        print(f"Video duration: {video_duration} seconds" if video_duration else "Could not determine duration")
        
        # Transcribe
        print("\nStarting transcription...")
        result = transcribe_video_with_timestamps(video_path, language)
        
        if result:
            # Prepare segments for database
            segments_json = result.get("segments", [])
            transcript_text = result["text"]
            
            # Get job context for scoring
            print("Fetching job context for scoring...")
            
            # First, get the applicant_id from video_assessments
            assessment_response = supabase.table("video_assessments").select(
                "applicant_id"
            ).eq("id", video_assessment_id).execute()
            
            job_title = ""
            job_description = ""
            job_skills = []
            
            if assessment_response.data:
                applicant_id = assessment_response.data[0].get("applicant_id")
                if applicant_id:
                    # Get applicant's applied job
                    applicant_response = supabase.table("applicants").select(
                        "applied_job_id"
                    ).eq("id", applicant_id).execute()
                    
                    if applicant_response.data:
                        applied_job_id = applicant_response.data[0].get("applied_job_id")
                        if applied_job_id:
                            # Get job posting details
                            job_response = supabase.table("job_postings").select(
                                "title, description, skills"
                            ).eq("job_id", applied_job_id).execute()
                            
                            if job_response.data:
                                job_posting = job_response.data[0]
                                job_title = job_posting.get("title", "") or ""
                                job_description = job_posting.get("description", "") or ""
                                job_skills = job_posting.get("skills", []) or []
                                print(f"Found job: {job_title}")
            
            if not job_title:
                print("No job context found - will score without job-specific criteria")
            
            # Validate and score the transcript
            print("\nValidating and scoring transcript...")
            scoring_result = process_video_scoring(
                video_assessment_id=video_assessment_id,
                transcript=transcript_text,
                video_duration_seconds=video_duration,
                job_title=job_title,
                job_description=job_description,
                job_skills=job_skills
            )
            
            # Prepare update data
            update_data = {
                "transcription": transcript_text,
                "transcription_status": "completed",
                "transcribed_at": "now()",
                "transcription_segments": segments_json if segments_json else None,
                "video_duration_seconds": video_duration,
                "transcript_word_count": scoring_result.get("word_count", 0),
                "validation_status": scoring_result.get("validation_status", "pending"),
                "validation_message": scoring_result.get("validation_message", "")
            }
            
            # Add scoring data if scored successfully
            if scoring_result.get("scored"):
                update_data.update({
                    "transcript_score": scoring_result.get("final_score", 0),
                    "relevance_score": scoring_result.get("relevance_score", 0),
                    "experience_score": scoring_result.get("experience_score", 0),
                    "skills_score": scoring_result.get("skills_score", 0),
                    "completeness_score": scoring_result.get("completeness_score", 0),
                    "scored_at": "now()"
                })
                print(f"\n✓ Scoring complete!")
                print(f"  Final Score: {scoring_result.get('final_score', 0)}/10")
                print(f"  Relevance: {scoring_result.get('relevance_score', 0)}")
                print(f"  Experience: {scoring_result.get('experience_score', 0)}")
                print(f"  Skills: {scoring_result.get('skills_score', 0)}")
                print(f"  Completeness: {scoring_result.get('completeness_score', 0)}")
            else:
                print(f"\n⚠ Scoring skipped: {scoring_result.get('validation_message', 'Unknown reason')}")
            
            # Save to database
            print("Saving to database...")
            supabase.table("video_assessments").update(update_data).eq(
                "id", video_assessment_id
            ).execute()
            
            print(f"✓ Success! Text: {len(transcript_text)} chars, Segments: {len(segments_json)}")
            success = True
        else:
            raise Exception("Transcription returned no result")
            
    except Exception as e:
        error_msg = str(e)
        print(f"\n✗ Failed: {error_msg}")
        
        # Update status to failed
        supabase.table("video_assessments").update({
            "transcription_status": "failed",
            "transcription_error": error_msg[:500]  # Limit error length
        }).eq("id", video_assessment_id).execute()
        
        success = False
        
    finally:
        # Cleanup
        if video_path and os.path.exists(video_path):
            os.remove(video_path)
            print("✓ Cleaned up temp file")
    
    return success


def process_pending_transcriptions(batch_size: int = 5) -> int:
    """
    Process all pending transcriptions in batches.
    
    Args:
        batch_size: Number to process at once
        
    Returns:
        Number successfully processed
    """
    print(f"\nFetching up to {batch_size} pending transcriptions...")
    
    response = supabase.table("video_assessments").select("*").eq(
        "transcription_status", "pending"
    ).limit(batch_size).execute()
    
    pending = response.data
    
    if not pending:
        print("No pending transcriptions found.")
        return 0
    
    print(f"Found {len(pending)} pending\n")
    
    processed = 0
    for item in pending:
        video_url = item.get("video_url")
        if not video_url:
            print(f"Skipping {item['id']}: No video URL")
            continue
        
        success = process_video_transcription(
            item["id"], 
            video_url,
            language=item.get("language", "en")
        )
        if success:
            processed += 1
    
    print(f"\n{'='*60}")
    print(f"Batch complete: {processed}/{len(pending)} successful")
    print(f"{'='*60}\n")
    
    return processed


def retry_failed_transcriptions(max_retries: int = 3) -> int:
    """Retry failed transcriptions."""
    print("\nFetching failed transcriptions...")
    
    response = supabase.table("video_assessments").select("*").eq(
        "transcription_status", "failed"
    ).limit(max_retries).execute()
    
    failed = response.data
    
    if not failed:
        print("No failed transcriptions found.")
        return 0
    
    print(f"Found {len(failed)} failed\n")
    
    retried = 0
    for item in failed:
        video_url = item.get("video_url")
        if not video_url:
            continue
        
        # Reset status
        supabase.table("video_assessments").update({
            "transcription_status": "pending",
            "transcription_error": None
        }).eq("id", item["id"]).execute()
        
        if process_video_transcription(item["id"], video_url):
            retried += 1
    
    return retried


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Process video transcriptions")
    parser.add_argument("--single", "-s", help="Process single assessment by ID")
    parser.add_argument("--batch", "-b", type=int, default=5, help="Batch size")
    parser.add_argument("--retry", "-r", action="store_true", help="Retry failed")
    
    args = parser.parse_args()
    
    if args.single:
        # Process single
        response = supabase.table("video_assessments").select("*").eq(
            "id", args.single
        ).execute()
        
        if not response.data:
            print(f"Assessment not found: {args.single}")
            sys.exit(1)
        
        item = response.data[0]
        video_url = item.get("video_url")
        
        if not video_url:
            print("No video URL found")
            sys.exit(1)
        
        success = process_video_transcription(args.single, video_url)
        sys.exit(0 if success else 1)
    
    elif args.retry:
        count = retry_failed_transcriptions()
        print(f"Retried {count} transcriptions")
    
    else:
        # Process pending
        count = process_pending_transcriptions(batch_size=args.batch)
        print(f"Processed {count} transcriptions")
