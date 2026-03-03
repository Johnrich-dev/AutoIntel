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
        
        # Transcribe
        print("\nStarting transcription...")
        result = transcribe_video_with_timestamps(video_path, language)
        
        if result:
            # Prepare segments for database
            segments_json = result.get("segments", [])
            
            # Save to database
            print("Saving to database...")
            update_data = {
                "transcription": result["text"],
                "transcription_status": "completed",
                "transcribed_at": "now()",
                "transcription_segments": segments_json if segments_json else None
            }
            
            supabase.table("video_assessments").update(update_data).eq(
                "id", video_assessment_id
            ).execute()
            
            print(f"✓ Success! Text: {len(result['text'])} chars, Segments: {len(segments_json)}")
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
        if os.path.exists(video_path):
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
