#!/usr/bin/env python3
"""
Background worker for processing video transcriptions.
Runs continuously and processes pending transcriptions at regular intervals.

Usage:
    python transcription_worker.py

This worker will:
1. Check for pending transcriptions every 60 seconds
2. Process them in batches (configurable)
3. Skip already processing/completed ones automatically
"""

import os
import sys
import time
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from process_transcription import process_video_transcription, process_pending_transcriptions
from supabase import create_client

# Load environment
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Configuration
POLL_INTERVAL = 60  # seconds between checks
BATCH_SIZE = 5  # max videos to process per cycle
MAX_CONCURRENT = 2  # max concurrent processing (to avoid overwhelming resources)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not supabase_url or not supabase_key:
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)


def get_pending_count() -> int:
    """Get count of pending transcriptions."""
    try:
        response = supabase.table("video_assessments").select(
            "id", count="exact"
        ).eq("transcription_status", "pending").execute()
        return response.count or 0
    except Exception as e:
        logger.error(f"Error checking pending count: {e}")
        return 0


def get_processing_count() -> int:
    """Get count of currently processing transcriptions."""
    try:
        response = supabase.table("video_assessments").select(
            "id", count="exact"
        ).eq("transcription_status", "processing").execute()
        return response.count or 0
    except Exception as e:
        logger.error(f"Error checking processing count: {e}")
        return 0


def check_and_process():
    """Check for pending transcriptions and process them."""
    pending_count = get_pending_count()
    processing_count = get_processing_count()
    
    logger.info(f"Status: {pending_count} pending, {processing_count} processing")
    
    if pending_count > 0 and processing_count < MAX_CONCURRENT:
        # Calculate how many we can process
        to_process = min(BATCH_SIZE, pending_count, MAX_CONCURRENT - processing_count)
        logger.info(f"Processing {to_process} pending transcriptions...")
        
        try:
            processed = process_pending_transcriptions(batch_size=to_process)
            logger.info(f"Processed {processed} transcriptions")
        except Exception as e:
            logger.error(f"Error processing transcriptions: {e}")
    else:
        if pending_count == 0:
            logger.info("No pending transcriptions")
        else:
            logger.info(f"Max concurrent processing reached ({MAX_CONCURRENT}), waiting...")


def main():
    """Main worker loop."""
    logger.info("=" * 60)
    logger.info("Video Transcription Worker Started")
    logger.info(f"Poll interval: {POLL_INTERVAL} seconds")
    logger.info(f"Batch size: {BATCH_SIZE}")
    logger.info(f"Max concurrent: {MAX_CONCURRENT}")
    logger.info("=" * 60)
    
    # Initial check
    check_and_process()
    
    # Continuous loop
    try:
        while True:
            time.sleep(POLL_INTERVAL)
            check_and_process()
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.error(f"Worker error: {e}")
        raise


if __name__ == "__main__":
    main()
