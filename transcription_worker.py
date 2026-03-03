"""
Background worker that continuously monitors for new videos and processes transcriptions.
Run this in the background and it will automatically transcribe videos as they are uploaded.
"""

import os
import sys
import time
import subprocess
from datetime import datetime

# Configuration
CHECK_INTERVAL = 30  # Check every 30 seconds
BATCH_SIZE = 5  # Process up to 5 videos at a time


def log(message: str):
    """Print with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def check_and_process():
    """Check for pending transcriptions and process them."""
    try:
        # Run the process_transcription script
        result = subprocess.run(
            [sys.executable, "process_transcription.py", "--batch", str(BATCH_SIZE)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout per batch
        )
        
        if result.returncode == 0:
            if "No pending transcriptions found" not in result.stdout:
                log("Processed batch successfully")
                if result.stdout:
                    print(result.stdout)
        else:
            log(f"Error processing batch: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        log("Batch processing timed out (5 minutes)")
    except Exception as e:
        log(f"Error: {str(e)}")


def main():
    """Main worker loop."""
    log("=" * 60)
    log("Transcription Worker Started")
    log("Model: openai/whisper-small")
    log(f"Check interval: {CHECK_INTERVAL} seconds")
    log(f"Batch size: {BATCH_SIZE}")
    log("=" * 60)
    log("")
    log("This worker will automatically transcribe videos as they are uploaded.")
    log("Press Ctrl+C to stop.")
    log("")
    
    try:
        while True:
            check_and_process()
            log(f"Waiting {CHECK_INTERVAL} seconds before next check...")
            time.sleep(CHECK_INTERVAL)
            
    except KeyboardInterrupt:
        log("")
        log("=" * 60)
        log("Worker stopped by user")
        log("=" * 60)
        sys.exit(0)


if __name__ == "__main__":
    main()
