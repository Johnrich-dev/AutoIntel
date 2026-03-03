"""
Transcription Service using Hugging Face openai/whisper-small model.
Lightweight, fast, and runs entirely locally - no API costs!

Model: openai/whisper-small (~244MB)
- Smaller and faster than large-v3
- Good accuracy for English and multilingual
- Perfect for video assessment transcriptions
"""

import os
import tempfile
import subprocess

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, use system env vars
import torch
import warnings
from typing import Optional, Dict, Any, List
from pathlib import Path

# Suppress transformers warnings
warnings.filterwarnings("ignore", category=UserWarning)

# Configuration
MODEL_NAME = "openai/whisper-small"  # ~244MB, faster than large-v3
DEVICE = None
_PIPE = None  # Pipeline cache


def get_device() -> str:
    """Get the best available device (CUDA or CPU)."""
    global DEVICE
    if DEVICE is None:
        if torch.cuda.is_available():
            DEVICE = "cuda"
            print(f"✓ Using CUDA GPU: {torch.cuda.get_device_name(0)}")
        else:
            DEVICE = "cpu"
            print("✓ Using CPU")
    return DEVICE


def load_pipeline():
    """Load the Whisper pipeline (cached for reuse)."""
    global _PIPE
    
    if _PIPE is None:
        print(f"Loading Whisper model: {MODEL_NAME}...")
        print("(First run will download ~244MB model files)")
        
        try:
            from transformers import pipeline
            
            device = get_device()
            
            # Load pipeline with optimizations
            _PIPE = pipeline(
                "automatic-speech-recognition",
                model=MODEL_NAME,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device=device,
                model_kwargs={"use_safetensors": True}
            )
            
            print("✓ Model loaded successfully!")
            
        except ImportError as e:
            print(f"ERROR: Missing required library: {e}")
            print("Run: pip install transformers torch librosa soundfile")
            raise
        except Exception as e:
            print(f"ERROR loading model: {str(e)}")
            raise
    
    return _PIPE


def get_ffmpeg_path() -> str:
    """Get the path to ffmpeg executable."""
    # First check for environment variable
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.isfile(env_path):
        try:
            subprocess.run([env_path, "-version"], capture_output=True, check=True)
            return env_path
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    
    # Fallback to PATH
    return "ffmpeg"


def extract_audio_from_video(video_path: str, output_audio_path: str) -> bool:
    """
    Extract audio from video file using FFmpeg.
    
    Args:
        video_path: Path to the video file
        output_audio_path: Path where audio will be saved
        
    Returns:
        True if successful, False otherwise
    """
    ffmpeg_path = get_ffmpeg_path()
    
    try:
        command = [
            ffmpeg_path,
            "-i", video_path,
            "-vn",  # No video
            "-acodec", "pcm_s16le",  # PCM 16-bit
            "-ar", "16000",  # 16kHz (required by Whisper)
            "-ac", "1",  # Mono
            "-y",  # Overwrite output
            output_audio_path
        ]
        subprocess.run(command, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ FFmpeg error: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print("✗ FFmpeg not found. Please install FFmpeg:")
        print("  Windows: https://ffmpeg.org/download.html")
        print("  Mac: brew install ffmpeg")
        print("  Linux: sudo apt-get install ffmpeg")
        return False


def transcribe_video(video_path: str, language: str = "en") -> Optional[str]:
    """
    Transcribe video using openai/whisper-small model.
    
    Args:
        video_path: Path to the video file
        language: Language code (default: "en" for English)
        
    Returns:
        Transcription text or None if failed
    """
    try:
        import librosa
    except ImportError:
        print("ERROR: librosa not installed. Run: pip install librosa")
        return None
    
    # Create temporary audio file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
    
    try:
        # Extract audio
        print(f"\nProcessing: {Path(video_path).name}")
        if not extract_audio_from_video(video_path, audio_path):
            return None
        
        # Load audio
        print("Loading audio...")
        audio_array, _ = librosa.load(audio_path, sr=16000, mono=True)
        
        # Load model
        pipe = load_pipeline()
        
        # Transcribe
        print(f"Transcribing with {MODEL_NAME}...")
        result = pipe(
            audio_array,
            generate_kwargs={
                "language": language,
                "task": "transcribe"
            },
            return_timestamps=False
        )
        
        transcription = result.get("text", "").strip()
        print(f"✓ Done! ({len(transcription)} chars)")
        
        return transcription
        
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
        
    finally:
        # Cleanup
        if os.path.exists(audio_path):
            os.remove(audio_path)


def transcribe_video_with_timestamps(video_path: str, language: str = "en") -> Optional[Dict[str, Any]]:
    """
    Transcribe video with timestamps using whisper-small.
    
    Args:
        video_path: Path to the video file
        language: Language code
        
    Returns:
        Dictionary with text, segments, and language or None if failed
    """
    try:
        import librosa
    except ImportError:
        print("ERROR: librosa not installed. Run: pip install librosa")
        return None
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
    
    try:
        if not extract_audio_from_video(video_path, audio_path):
            return None
        
        print("Loading audio...")
        audio_array, _ = librosa.load(audio_path, sr=16000, mono=True)
        
        pipe = load_pipeline()
        
        print(f"Transcribing with timestamps...")
        result = pipe(
            audio_array,
            generate_kwargs={
                "language": language,
                "task": "transcribe"
            },
            return_timestamps=True
        )
        
        # Parse chunks into segments
        chunks = result.get("chunks", [])
        segments = []
        for chunk in chunks:
            timestamp = chunk.get("timestamp", (0, 0))
            segments.append({
                "start": timestamp[0] if timestamp[0] is not None else 0,
                "end": timestamp[1] if timestamp[1] is not None else timestamp[0] + 5 if timestamp[0] else 5,
                "text": chunk.get("text", "").strip()
            })
        
        return {
            "text": result.get("text", "").strip(),
            "segments": segments,
            "language": language
        }
        
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
        
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def batch_transcribe(video_paths: List[str], language: str = "en") -> Dict[str, Optional[str]]:
    """
    Batch transcribe multiple videos efficiently.
    
    Args:
        video_paths: List of video file paths
        language: Language code
        
    Returns:
        Dictionary mapping video paths to transcriptions
    """
    results = {}
    
    print(f"\nBatch transcribing {len(video_paths)} videos...")
    print("=" * 60)
    
    for i, video_path in enumerate(video_paths, 1):
        print(f"\n[{i}/{len(video_paths)}] {Path(video_path).name}")
        results[video_path] = transcribe_video(video_path, language)
    
    print("\n" + "=" * 60)
    successful = sum(1 for v in results.values() if v is not None)
    print(f"✓ Complete: {successful}/{len(video_paths)} successful")
    
    return results


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python transcription_service.py <video_path> [language]")
        print("\nExample:")
        print("  python transcription_service.py ./video.mp4")
        print("  python transcription_service.py ./video.mp4 es")
        sys.exit(1)
    
    video_file = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    
    if not os.path.exists(video_file):
        print(f"✗ File not found: {video_file}")
        sys.exit(1)
    
    print(f"Transcribing: {video_file}")
    print(f"Language: {lang}")
    print(f"Device: {get_device()}")
    print("=" * 60)
    
    result = transcribe_video_with_timestamps(video_file, lang)
    
    if result:
        print("\n" + "=" * 60)
        print("TRANSCRIPTION:")
        print("=" * 60)
        print(result["text"])
        print("\nSEGMENTS:")
        for seg in result.get("segments", [])[:5]:
            print(f"  [{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}")
        if len(result.get("segments", [])) > 5:
            print(f"  ... and {len(result['segments']) - 5} more")
    else:
        print("\n✗ Transcription failed")
        sys.exit(1)
