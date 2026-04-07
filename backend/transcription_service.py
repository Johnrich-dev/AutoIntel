#!/usr/bin/env python3
"""
Transcription Service for AutoIntel
Handles all AI/processing logic for video transcription and scoring.

Sections:
  1. Whisper model  - device detection, pipeline loading, audio extraction
  2. Transcription  - transcribe_video, transcribe_video_with_timestamps, batch_transcribe
  3. Scoring        - validate_transcript, score_transcript_with_gpt, process_video_scoring

No Flask, no DB calls - pure logic, easily testable.
"""

import os
import json
import subprocess
import tempfile
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch

warnings.filterwarnings("ignore", category=UserWarning)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import openai

# ── Whisper config ─────────────────────────────────────────────────────────────
MODEL_NAME = "openai/whisper-small"  # ~244MB
_DEVICE: Optional[str] = None
_PIPE = None  # cached pipeline

# ── Scoring config ─────────────────────────────────────────────────────────────
openai.api_key = os.getenv("OPENAI_API_KEY", "")
openai.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1/")
openai.max_retries = 3

MIN_WORD_COUNT = 50
MIN_DURATION_SECONDS = 120   # 2 minutes
MAX_DURATION_SECONDS = 300   # 5 minutes


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_device() -> str:
    """Return best available device (CUDA or CPU), cached."""
    global _DEVICE
    if _DEVICE is None:
        if torch.cuda.is_available():
            _DEVICE = "cuda"
            print(f"Using CUDA GPU: {torch.cuda.get_device_name(0)}")
        else:
            _DEVICE = "cpu"
            print("Using CPU")
    return _DEVICE


def get_ffmpeg_path() -> str:
    """Return path to ffmpeg, preferring FFMPEG_PATH env var."""
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.isfile(env_path):
        try:
            subprocess.run([env_path, "-version"], capture_output=True, check=True)
            return env_path
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    return "ffmpeg"


def load_pipeline():
    """Load and cache the Whisper ASR pipeline."""
    global _PIPE
    if _PIPE is None:
        print(f"Loading Whisper model: {MODEL_NAME}...")
        try:
            from transformers import pipeline
            device = get_device()
            _PIPE = pipeline(
                "automatic-speech-recognition",
                model=MODEL_NAME,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device=device,
                model_kwargs={"use_safetensors": True},
            )
            print("Model loaded successfully!")
        except ImportError as e:
            print(f"ERROR: Missing required library: {e}")
            raise
        except Exception as e:
            print(f"ERROR loading model: {e}")
            raise
    return _PIPE


def extract_audio_from_video(video_path: str, output_audio_path: str) -> bool:
    """Extract 16kHz mono WAV audio from a video file using FFmpeg."""
    ffmpeg_path = get_ffmpeg_path()
    try:
        subprocess.run(
            [ffmpeg_path, "-i", video_path, "-vn",
             "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y",
             output_audio_path],
            check=True, capture_output=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print("FFmpeg not found. Install from https://ffmpeg.org/download.html")
        return False


# ── Transcription ──────────────────────────────────────────────────────────────

def transcribe_video(video_path: str, language: str = "en") -> Optional[str]:
    """Transcribe a video file and return plain text."""
    try:
        import librosa
    except ImportError:
        print("ERROR: librosa not installed. Run: pip install librosa")
        return None

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name

    try:
        print(f"\nProcessing: {Path(video_path).name}")
        if not extract_audio_from_video(video_path, audio_path):
            return None
        audio_array, _ = librosa.load(audio_path, sr=16000, mono=True)
        pipe = load_pipeline()
        result = pipe(
            audio_array,
            generate_kwargs={"language": language, "task": "transcribe"},
            return_timestamps=False,
        )
        transcription = result.get("text", "").strip()
        print(f"Done! ({len(transcription)} chars)")
        return transcription
    except Exception as e:
        print(f"Error: {e}")
        import traceback; traceback.print_exc()
        return None
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def transcribe_video_with_timestamps(
    video_path: str, language: str = "en"
) -> Optional[Dict[str, Any]]:
    """Transcribe a video file and return text + timestamped segments."""
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
        audio_array, _ = librosa.load(audio_path, sr=16000, mono=True)
        pipe = load_pipeline()
        result = pipe(
            audio_array,
            generate_kwargs={"language": language, "task": "transcribe"},
            return_timestamps=True,
        )
        segments = []
        for chunk in result.get("chunks", []):
            ts = chunk.get("timestamp", (0, 0))
            segments.append({
                "start": ts[0] if ts[0] is not None else 0,
                "end": ts[1] if ts[1] is not None else (ts[0] + 5 if ts[0] else 5),
                "text": chunk.get("text", "").strip(),
            })
        return {"text": result.get("text", "").strip(), "segments": segments, "language": language}
    except Exception as e:
        print(f"Error: {e}")
        import traceback; traceback.print_exc()
        return None
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def batch_transcribe(
    video_paths: List[str], language: str = "en"
) -> Dict[str, Optional[str]]:
    """Transcribe multiple video files, returning a path->text mapping."""
    results: Dict[str, Optional[str]] = {}
    print(f"\nBatch transcribing {len(video_paths)} videos...")
    for i, path in enumerate(video_paths, 1):
        print(f"\n[{i}/{len(video_paths)}] {Path(path).name}")
        results[path] = transcribe_video(path, language)
    successful = sum(1 for v in results.values() if v is not None)
    print(f"\nComplete: {successful}/{len(video_paths)} successful")
    return results


# ── Scoring ────────────────────────────────────────────────────────────────────

def count_words(text: str) -> int:
    return len(text.split())


def validate_transcript(
    transcript: str,
    video_duration_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    """Validate transcript meets minimum word count and duration requirements."""
    word_count = count_words(transcript)

    if word_count < MIN_WORD_COUNT:
        return {
            "valid": False, "status": "insufficient_response",
            "message": f"Transcript has only {word_count} words. Minimum {MIN_WORD_COUNT} required.",
            "word_count": word_count,
        }

    if video_duration_seconds is not None:
        if video_duration_seconds < MIN_DURATION_SECONDS:
            return {
                "valid": False, "status": "insufficient_response",
                "message": f"Video is {video_duration_seconds}s. Minimum {MIN_DURATION_SECONDS}s required.",
                "word_count": word_count, "duration_seconds": video_duration_seconds,
            }
        if video_duration_seconds > MAX_DURATION_SECONDS:
            return {
                "valid": False, "status": "insufficient_response",
                "message": f"Video is {video_duration_seconds}s. Maximum {MAX_DURATION_SECONDS}s allowed.",
                "word_count": word_count, "duration_seconds": video_duration_seconds,
            }

    return {
        "valid": True, "status": "validated",
        "message": "Transcript validation passed",
        "word_count": word_count, "duration_seconds": video_duration_seconds,
    }


def score_transcript_with_gpt(
    transcript: str,
    job_title: str = "",
    job_description: str = "",
    job_skills: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Score a transcript using GPT on 4 dimensions (0-10 each)."""
    if job_skills is None:
        job_skills = []

    context_parts = []
    if job_title:
        context_parts.append(f"Job Title: {job_title}")
    if job_description:
        desc = job_description[:1000] + "..." if len(job_description) > 1000 else job_description
        context_parts.append(f"Job Description: {desc}")
    if job_skills:
        context_parts.append(f"Required Skills: {', '.join(job_skills[:10])}")
    context = "\n".join(context_parts) if context_parts else "No job context provided"

    prompt = f"""You are an AI recruitment assistant evaluating a video transcript from a job applicant.

{context}

TRANSCRIPT:
{transcript}

Evaluate on a scale of 0-10 for each dimension with a brief justification.
1. RELEVANCE TO THE JOB
2. EXPERIENCE ALIGNMENT
3. SKILL EVIDENCE
4. COMPLETENESS

Respond ONLY with valid JSON:
{{
    "relevance_score": <0-10>,
    "experience_score": <0-10>,
    "skills_score": <0-10>,
    "completeness_score": <0-10>,
    "relevance_justification": "<brief>",
    "experience_justification": "<brief>",
    "skills_justification": "<brief>",
    "completeness_justification": "<brief>"
}}"""

    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an AI recruitment assistant evaluating video transcripts."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3, max_tokens=800,
        )
        content = response.choices[0].message.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        scores = json.loads(content.strip())
        final_score = (
            scores.get("relevance_score", 0) + scores.get("experience_score", 0)
            + scores.get("skills_score", 0) + scores.get("completeness_score", 0)
        ) / 4.0

        return {
            "success": True,
            "final_score": round(final_score, 2),
            "relevance_score": scores.get("relevance_score", 0),
            "experience_score": scores.get("experience_score", 0),
            "skills_score": scores.get("skills_score", 0),
            "completeness_score": scores.get("completeness_score", 0),
            "relevance_justification": scores.get("relevance_justification", ""),
            "experience_justification": scores.get("experience_justification", ""),
            "skills_justification": scores.get("skills_justification", ""),
            "completeness_justification": scores.get("completeness_justification", ""),
        }
    except json.JSONDecodeError as e:
        print(f"Error parsing GPT response: {e}")
        return {"success": False, "error": "Failed to parse GPT response"}
    except Exception as e:
        print(f"Error calling GPT API: {e}")
        return {"success": False, "error": str(e)}


def process_video_scoring(
    video_assessment_id: str,
    transcript: str,
    video_duration_seconds: Optional[int] = None,
    job_title: str = "",
    job_description: str = "",
    job_skills: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Full scoring pipeline: validate transcript then score with GPT."""
    validation = validate_transcript(transcript, video_duration_seconds)

    if not validation["valid"]:
        return {
            "success": False,
            "validation_status": validation["status"],
            "validation_message": validation["message"],
            "word_count": validation.get("word_count", 0),
            "duration_seconds": video_duration_seconds,
            "scored": False,
        }

    scoring = score_transcript_with_gpt(
        transcript=transcript,
        job_title=job_title,
        job_description=job_description,
        job_skills=job_skills,
    )

    if not scoring.get("success"):
        return {
            "success": False,
            "validation_status": "validated",
            "validation_message": "Transcript validated but scoring failed",
            "word_count": validation["word_count"],
            "duration_seconds": video_duration_seconds,
            "scored": False,
            "scoring_error": scoring.get("error"),
        }

    return {
        "success": True,
        "validation_status": "validated",
        "validation_message": "Transcript validated successfully",
        "word_count": validation["word_count"],
        "duration_seconds": video_duration_seconds,
        "scored": True,
        "final_score": scoring["final_score"],
        "relevance_score": scoring["relevance_score"],
        "experience_score": scoring["experience_score"],
        "skills_score": scoring["skills_score"],
        "completeness_score": scoring["completeness_score"],
        "relevance_justification": scoring.get("relevance_justification", ""),
        "experience_justification": scoring.get("experience_justification", ""),
        "skills_justification": scoring.get("skills_justification", ""),
        "completeness_justification": scoring.get("completeness_justification", ""),
    }


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python transcription_service.py <video_path> [language]")
        sys.exit(1)
    video_file = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    if not os.path.exists(video_file):
        print(f"File not found: {video_file}")
        sys.exit(1)
    print(f"Transcribing: {video_file}  |  Language: {lang}  |  Device: {get_device()}")
    result = transcribe_video_with_timestamps(video_file, lang)
    if result:
        print("\nTRANSCRIPTION:")
        print(result["text"])
        for seg in result.get("segments", [])[:5]:
            print(f"  [{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}")
    else:
        print("Transcription failed")
        sys.exit(1)
