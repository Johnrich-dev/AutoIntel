#!/usr/bin/env python3
"""
Transcript Scoring Service for Video Assessments
Evaluates applicant video transcripts using GPT for transcript-only scoring.

This service:
1. Validates transcript (duration 2-5 min, 50+ words)
2. Scores transcript using GPT on 4 dimensions
3. Returns structured scores for HR dashboard
"""

import os
import sys
import json
from typing import Dict, Any, Optional
from datetime import datetime

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# OpenAI imports
import openai

# Configure OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY", "")
openai.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1/")
openai.max_retries = 3

# Configuration
MIN_WORD_COUNT = 50
MIN_DURATION_SECONDS = 120  # 2 minutes
MAX_DURATION_SECONDS = 300   # 5 minutes


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def validate_transcript(
    transcript: str,
    video_duration_seconds: Optional[int] = None
) -> Dict[str, Any]:
    """
    Validate transcript meets minimum requirements.
    
    Args:
        transcript: The transcribed text
        video_duration_seconds: Duration of video in seconds (optional)
    
    Returns:
        Dict with validation result
    """
    word_count = count_words(transcript)
    
    # Check word count
    if word_count < MIN_WORD_COUNT:
        return {
            "valid": False,
            "status": "insufficient_response",
            "message": f"Transcript has only {word_count} words. Minimum {MIN_WORD_COUNT} required.",
            "word_count": word_count
        }
    
    # Check duration if provided
    if video_duration_seconds is not None:
        if video_duration_seconds < MIN_DURATION_SECONDS:
            return {
                "valid": False,
                "status": "insufficient_response",
                "message": f"Video duration is {video_duration_seconds}s. Minimum {MIN_DURATION_SECONDS}s required.",
                "word_count": word_count,
                "duration_seconds": video_duration_seconds
            }
        
        if video_duration_seconds > MAX_DURATION_SECONDS:
            return {
                "valid": False,
                "status": "insufficient_response",
                "message": f"Video duration is {video_duration_seconds}s. Maximum {MAX_DURATION_SECONDS}s allowed.",
                "word_count": word_count,
                "duration_seconds": video_duration_seconds
            }
    
    return {
        "valid": True,
        "status": "validated",
        "message": "Transcript validation passed",
        "word_count": word_count,
        "duration_seconds": video_duration_seconds
    }


def score_transcript_with_gpt(
    transcript: str,
    job_title: str = "",
    job_description: str = "",
    job_skills: list = None
) -> Dict[str, Any]:
    """
    Score transcript using GPT on 4 dimensions:
    - Relevance to the job
    - Mention of experience
    - Evidence of skills
    - Completeness of the response
    
    Args:
        transcript: The transcribed text
        job_title: The job title applied for
        job_description: Job description
        job_skills: List of required skills
    
    Returns:
        Dict with scores for each dimension
    """
    if job_skills is None:
        job_skills = []
    
    # Build context for GPT
    context_parts = []
    if job_title:
        context_parts.append(f"Job Title: {job_title}")
    if job_description:
        # Truncate long descriptions
        desc = job_description[:1000] + "..." if len(job_description) > 1000 else job_description
        context_parts.append(f"Job Description: {desc}")
    if job_skills:
        context_parts.append(f"Required Skills: {', '.join(job_skills[:10])}")
    
    context = "\n".join(context_parts) if context_parts else "No job context provided"
    
    # Create prompt
    prompt = f"""You are an AI recruitment assistant evaluating a video transcript from a job applicant.

{context}

The applicant recorded a video response to introduce themselves and explain why they're suitable for the position.

TRANSCRIPT:
{transcript}

Please evaluate this transcript on a scale of 0-10 for each of the following dimensions. 
Provide a brief justification for each score.

1. RELEVANCE TO THE JOB: How well does the applicant's response relate to the position? Do they address why they're interested in this specific role?

2. EXPERIENCE ALIGNMENT: Does the applicant mention relevant work experience, past roles, or professional background that aligns with the job?

3. SKILL EVIDENCE: Does the applicant demonstrate or mention skills that are relevant to the job? Look for both technical and soft skills.

4. COMPLETENESS: How complete is the response? Does it cover key aspects (introduction, interest in role, qualifications) or is it overly brief?

Provide your response in JSON format:
{{
    "relevance_score": <0-10>,
    "experience_score": <0-10>,
    "skills_score": <0-10>,
    "completeness_score": <0-10>,
    "relevance_justification": "<brief explanation>",
    "experience_justification": "<brief explanation>",
    "skills_justification": "<brief explanation>",
    "completeness_justification": "<brief explanation>"
}}

Respond ONLY with valid JSON, no other text."""

    try:
        # Call GPT API
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an AI recruitment assistant that evaluates job applicant video transcripts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=800
        )
        
        # Parse response
        content = response.choices[0].message.content.strip()
        
        # Try to extract JSON from response
        try:
            # Handle potential markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            scores = json.loads(content.strip())
            
            # Calculate final score (average of 4 dimensions)
            final_score = (
                scores.get("relevance_score", 0) +
                scores.get("experience_score", 0) +
                scores.get("skills_score", 0) +
                scores.get("completeness_score", 0)
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
                "completeness_justification": scores.get("completeness_justification", "")
            }
            
        except json.JSONDecodeError as e:
            print(f"Error parsing GPT response: {e}")
            print(f"Raw response: {content}")
            return {
                "success": False,
                "error": "Failed to parse GPT response",
                "raw_response": content[:500]
            }
    
    except Exception as e:
        print(f"Error calling GPT API: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def process_video_scoring(
    video_assessment_id: str,
    transcript: str,
    video_duration_seconds: Optional[int] = None,
    job_title: str = "",
    job_description: str = "",
    job_skills: list = None
) -> Dict[str, Any]:
    """
    Complete video scoring pipeline: validate + score.
    
    Args:
        video_assessment_id: ID of the video assessment
        transcript: Transcribed text
        video_duration_seconds: Video duration (optional)
        job_title: Job title applied for
        job_description: Job description
        job_skills: Required skills
    
    Returns:
        Dict with validation and scoring results
    """
    # Step 1: Validate
    validation = validate_transcript(transcript, video_duration_seconds)
    
    if not validation["valid"]:
        return {
            "success": False,
            "validation_status": validation["status"],
            "validation_message": validation["message"],
            "word_count": validation.get("word_count", 0),
            "duration_seconds": video_duration_seconds,
            "scored": False
        }
    
    # Step 2: Score with GPT
    scoring = score_transcript_with_gpt(
        transcript=transcript,
        job_title=job_title,
        job_description=job_description,
        job_skills=job_skills
    )
    
    if not scoring.get("success"):
        return {
            "success": False,
            "validation_status": "validated",
            "validation_message": "Transcript validated but scoring failed",
            "word_count": validation["word_count"],
            "duration_seconds": video_duration_seconds,
            "scored": False,
            "scoring_error": scoring.get("error")
        }
    
    # Return complete results
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
        "completeness_justification": scoring.get("completeness_justification", "")
    }


if __name__ == "__main__":
    # Test the service
    test_transcript = """
    Hi, my name is John Smith and I'm excited to apply for the Python Developer position at your company.
    I have been working as a software developer for the past 5 years, primarily with Python and Django.
    In my current role at Tech Solutions Inc, I lead a team of 4 developers and we've built several customer-facing web applications.
    I have extensive experience with REST APIs, database design, and cloud deployment using AWS.
    I'm particularly interested in this role because I see it's focused on building scalable backend systems, which is exactly what I love doing.
    I consider myself a quick learner and I'm always staying up to date with the latest technologies.
    Thank you for considering my application.
    """
    
    result = process_video_scoring(
        video_assessment_id="test-123",
        transcript=test_transcript,
        video_duration_seconds=180,
        job_title="Python Developer",
        job_description="We are looking for a Python Developer to build scalable backend systems.",
        job_skills=["Python", "Django", "REST APIs", "AWS", "PostgreSQL"]
    )
    
    print(json.dumps(result, indent=2))
