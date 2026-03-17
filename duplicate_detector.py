#!/usr/bin/env python3
"""
Duplicate Detector for AutoIntel
3-layer duplicate detection system:
1. Layer 1 - Hard duplicate check (exact email/phone match)
2. Layer 2 - Identity similarity (fuzzy name, university, degree, graduation year)
3. Layer 3 - Resume semantic similarity using all-MiniLM-L6-v2 embedding model

Integrates with resume_collector.py and uses email_service.py for rejection emails.
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# Ensure proper imports
def _prefer_site_packages():
    repo_root = Path(__file__).resolve().parent
    if (repo_root / 'supabase').is_dir() and str(repo_root) in sys.path:
        sys.path.remove(str(repo_root))
        sys.path.append(str(repo_root))

_prefer_site_packages()

try:
    from supabase import create_client
except ImportError as exc:
    raise ImportError(
        "Failed to import supabase-py. Ensure the 'supabase' package is installed "
        "and a local /supabase folder isn't shadowing it."
    ) from exc

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Import fuzzy matching and embedding libraries
try:
    from rapidfuzz import fuzz, process
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    print("Warning: rapidfuzz not installed. Layer 2 fuzzy matching will use basic string matching.")

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("Warning: sentence-transformers not installed. Layer 3 semantic similarity will be skipped.")

# Import email service for rejection notifications
try:
    from email_service import send_duplicate_rejection_notification
except ImportError:
    send_duplicate_rejection_notification = None

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Duplicate detection thresholds
LAYER1_EXACT_MATCH_FIELDS = ['email', 'phone']
LAYER2_SIMILARITY_THRESHOLD = 75  # Minimum similarity score for Layer 2
LAYER3_SIMILARITY_THRESHOLD = 0.85  # Minimum cosine similarity for Layer 3

# Global clients
supabase = None
embedding_model = None


def get_supabase_client():
    """Get or create Supabase client."""
    global supabase
    if supabase is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return supabase


def get_embedding_model():
    """Get or create the sentence embedding model (all-MiniLM-L6-v2)."""
    global embedding_model
    if embedding_model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
        print("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
        embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Model loaded successfully.")
    return embedding_model


def normalize_string(s: str) -> str:
    """Normalize a string for comparison."""
    if not s:
        return ""
    # Convert to lowercase, remove extra spaces
    s = s.lower().strip()
    s = re.sub(r'\s+', ' ', s)
    # Remove common punctuation
    s = re.sub(r'[^\w\s]', '', s)
    return s


def extract_year_from_education(education_entry: dict) -> Optional[int]:
    """Extract graduation year from education entry."""
    year_range = education_entry.get('year_range', '')
    if not year_range:
        return None
    
    # Try to extract year from patterns like "2020 - 2024", "2020-2024", "2020", etc.
    years = re.findall(r'\b(20\d{2}|19\d{2})\b', str(year_range))
    if years:
        # Return the last year (typically graduation year)
        return int(years[-1])
    return None


def _fuzzy_compare_strings(s1: str, s2: str) -> float:
    """Compare two strings using fuzzy matching. Returns 0-100 score."""
    if not s1 or not s2:
        return 0.0
    
    s1_norm = normalize_string(s1)
    s2_norm = normalize_string(s2)
    
    if not s1_norm or not s2_norm:
        return 0.0
    
    if RAPIDFUZZ_AVAILABLE:
        # Use token_sort_ratio for better matching with word order variations
        return fuzz.token_sort_ratio(s1_norm, s2_norm)
    else:
        # Basic string similarity
        if s1_norm == s2_norm:
            return 100.0
        # Simple character-based similarity
        common = sum(1 for a, b in zip(s1_norm, s2_norm) if a == b)
        max_len = max(len(s1_norm), len(s2_norm))
        return (common / max_len) * 100 if max_len > 0 else 0.0


def get_education_info(parsed_data: dict) -> dict:
    """Extract education information from parsed resume data."""
    education = parsed_data.get('education', [])
    if not education:
        return {'universities': [], 'degrees': [], 'graduation_years': []}
    
    universities = []
    degrees = []
    graduation_years = []
    
    for edu in education:
        school = edu.get('school', '')
        degree = edu.get('course_or_strand', '')
        year = extract_year_from_education(edu)
        
        if school:
            universities.append(school)
        if degree:
            degrees.append(degree)
        if year:
            graduation_years.append(year)
    
    return {
        'universities': universities,
        'degrees': degrees,
        'graduation_years': graduation_years
    }


def layer1_exact_match(applicant_data: dict, parsed_data: dict) -> list[dict]:
    """
    Layer 1: Check for exact email or phone matches.
    Returns list of matching existing applicants.
    """
    sb = get_supabase_client()
    matches = []
    
    email = parsed_data.get('email', '').strip().lower() if parsed_data.get('email') else None
    phone = parsed_data.get('phone', '').strip() if parsed_data.get('phone') else None
    
    # Normalize phone number (remove non-digits)
    if phone:
        phone = re.sub(r'\D', '', phone)
        if len(phone) >= 10:  # Keep at least 10 digits
            # Try to match with country code prefix
            if not phone.startswith('63') and len(phone) == 10:
                phone = '63' + phone  # Assume Philippine number
        else:
            phone = None
    
    if email:
        # Check for exact email match, excluding rejected duplicates
        result = sb.table('applicants').select(
            'id, email, name, position, created_at, status'
        ).eq('email', email).execute()
        
        if result.data:
            for row in result.data:
                # Skip if this is the same applicant
                if row['id'] == applicant_data.get('id'):
                    continue
                matches.append({
                    'applicant_id': row['id'],
                    'email': row['email'],
                    'name': row['name'],
                    'position': row['position'],
                    'status': row.get('status'),
                    'match_type': 'exact_email',
                    'confidence': 100.0,
                    'layer': 1
                })
    
    if phone:
        # Check for exact phone match in resumes table
        result = sb.table('resumes').select(
            'applicant_id, parsed_data'
        ).execute()
        
        if result.data:
            for row in result.data:
                # Skip if this is the same applicant
                if row['applicant_id'] == applicant_data.get('id'):
                    continue
                
                parsed = row.get('parsed_data')
                if isinstance(parsed, str):
                    try:
                        parsed = json.loads(parsed)
                    except:
                        continue
                
                if parsed:
                    resume_phone = parsed.get('phone', '')
                    if resume_phone:
                        resume_phone_norm = re.sub(r'\D', '', resume_phone)
                        if phone in resume_phone_norm or resume_phone_norm in phone:
                            # Get applicant info
                            app_result = sb.table('applicants').select(
                                'id, email, name, position, created_at, status'
                            ).eq('id', row['applicant_id']).execute()
                            
                            if app_result.data:
                                app = app_result.data[0]
                                # Skip rejected duplicates
                                if app.get('status') == 'rejected' and app.get('rejection_reason', '').startswith('Duplicate'):
                                    continue
                                matches.append({
                                    'applicant_id': app['id'],
                                    'email': app['email'],
                                    'name': app['name'],
                                    'position': app.get('position', ''),
                                    'status': app.get('status'),
                                    'match_type': 'exact_phone',
                                    'confidence': 100.0,
                                    'layer': 1
                                })
    
    return matches


def layer2_identity_similarity(applicant_data: dict, parsed_data: dict) -> list[dict]:
    """
    Layer 2: Check for identity similarity using fuzzy matching.
    Compares name, university, degree, and graduation year.
    Returns list of similar applicants above threshold.
    """
    sb = get_supabase_client()
    matches = []
    
    # Get all existing applicants with their resume data (exclude rejected duplicates)
    result = sb.table('applicants').select(
        'id, email, name, position, created_at, status'
    ).neq('status', 'rejected').execute()
    
    if not result.data:
        return matches
    
    # Get education info from new applicant
    new_edu = get_education_info(parsed_data)
    new_name = parsed_data.get('name', '')
    
    for existing_app in result.data:
        # Skip if this is the same applicant
        if existing_app['id'] == applicant_data.get('id'):
            continue
        
        # Skip rejected duplicates
        if existing_app.get('status') == 'rejected' and existing_app.get('rejection_reason', '').startswith('Duplicate'):
            continue
        
        # Get existing applicant's resume data
        resume_result = sb.table('resumes').select(
            'parsed_data'
        ).eq('applicant_id', existing_app['id']).execute()
        
        if not resume_result.data:
            continue
        
        resume_data = resume_result.data[0].get('parsed_data')
        if isinstance(resume_data, str):
            try:
                resume_data = json.loads(resume_data)
            except:
                continue
        
        if not resume_data:
            continue
        
        # Calculate similarity scores
        existing_name = existing_app.get('name', '')
        existing_edu = get_education_info(resume_data)
        
        # Name similarity
        name_score = _fuzzy_compare_strings(new_name, existing_name)
        
        # University similarity (check if any university matches)
        university_score = 0.0
        if new_edu['universities'] and existing_edu['universities']:
            max_uni_score = 0.0
            for new_uni in new_edu['universities']:
                for existing_uni in existing_edu['universities']:
                    score = _fuzzy_compare_strings(new_uni, existing_uni)
                    max_uni_score = max(max_uni_score, score)
            university_score = max_uni_score
        
        # Degree similarity
        degree_score = 0.0
        if new_edu['degrees'] and existing_edu['degrees']:
            max_degree_score = 0.0
            for new_deg in new_edu['degrees']:
                for existing_deg in existing_edu['degrees']:
                    score = _fuzzy_compare_strings(new_deg, existing_deg)
                    max_degree_score = max(max_degree_score, score)
            degree_score = max_degree_score
        
        # Graduation year match
        year_match = False
        if new_edu['graduation_years'] and existing_edu['graduation_years']:
            # Check if any years are within 2 years of each other
            for new_year in new_edu['graduation_years']:
                for existing_year in existing_edu['graduation_years']:
                    if abs(new_year - existing_year) <= 2:
                        year_match = True
                        break
        
        # Calculate combined identity score
        # Weight: name 40%, university 30%, degree 20%, year 10%
        identity_score = (
            name_score * 0.4 +
            university_score * 0.3 +
            degree_score * 0.2 +
            (100.0 if year_match else 0.0) * 0.1
        )
        
        if identity_score >= LAYER2_SIMILARITY_THRESHOLD:
            # Determine match reason
            match_reasons = []
            if name_score >= LAYER2_SIMILARITY_THRESHOLD:
                match_reasons.append('name')
            if university_score >= LAYER2_SIMILARITY_THRESHOLD:
                match_reasons.append('university')
            if degree_score >= LAYER2_SIMILARITY_THRESHOLD:
                match_reasons.append('degree')
            if year_match:
                match_reasons.append('year')
            
            matches.append({
                'applicant_id': existing_app['id'],
                'email': existing_app['email'],
                'name': existing_app['name'],
                'position': existing_app.get('position', ''),
                'status': existing_app.get('status'),
                'match_type': 'identity_similarity',
                'confidence': round(identity_score, 2),
                'layer': 2,
                'match_reasons': match_reasons,
                'details': {
                    'name_score': round(name_score, 2),
                    'university_score': round(university_score, 2),
                    'degree_score': round(degree_score, 2),
                    'year_match': year_match
                }
            })
    
    return matches


def layer3_semantic_similarity(applicant_data: dict, parsed_data: dict) -> list[dict]:
    """
    Layer 3: Check for resume semantic similarity using embeddings.
    Uses all-MiniLM-L6-v2 model to compute cosine similarity.
    Returns list of similar applicants above threshold.
    """
    if not SENTENCE_TRANSFORMERS_AVAILABLE:
        print("Skipping Layer 3: sentence-transformers not available")
        return []
    
    sb = get_supabase_client()
    matches = []
    
    # Get new applicant's resume text
    new_resume_text = parsed_data.get('cleaned_resume_text', '')
    if not new_resume_text:
        # Try raw extracted content
        resume_result = sb.table('resumes').select(
            'raw_extracted_content'
        ).eq('applicant_id', applicant_data['id']).execute()
        
        if resume_result.data:
            new_resume_text = resume_result.data[0].get('raw_extracted_content', '')
    
    if not new_resume_text or len(new_resume_text) < 100:
        print("Skipping Layer 3: Insufficient text for embedding")
        return []
    
    # Get embedding model
    model = get_embedding_model()
    if not model:
        return []
    
    # Generate embedding for new resume
    try:
        new_embedding = model.encode(new_resume_text, show_progress_bar=False)
    except Exception as e:
        print(f"Error generating embedding for new resume: {e}")
        return []
    
    # Get all existing applicants with their resume content
    # Limit to recent applicants to avoid processing too many
    result = sb.table('applicants').select(
        'id, email, name, position, created_at'
    ).order('created_at', desc=True).limit(100).execute()
    
    if not result.data:
        return matches
    
    for existing_app in result.data:
        # Skip if this is the same applicant
        if existing_app['id'] == applicant_data.get('id'):
            continue
        
        # Get existing applicant's resume text
        resume_result = sb.table('resumes').select(
            'parsed_data, raw_extracted_content'
        ).eq('applicant_id', existing_app['id']).execute()
        
        if not resume_result.data:
            continue
        
        resume_row = resume_result.data[0]
        
        # Try cleaned resume text first, then raw
        existing_text = resume_row.get('parsed_data', {}).get('cleaned_resume_text', '') if isinstance(resume_row.get('parsed_data'), dict) else ''
        if not existing_text:
            existing_text = resume_row.get('raw_extracted_content', '')
        
        if not existing_text or len(existing_text) < 100:
            continue
        
        try:
            existing_embedding = model.encode(existing_text, show_progress_bar=False)
        except Exception as e:
            print(f"Error generating embedding for existing resume: {e}")
            continue
        
        # Calculate cosine similarity
        similarity = float(
            sum(a * b for a, b in zip(new_embedding, existing_embedding)) /
            (sum(a * a for a in new_embedding) ** 0.5 * sum(b * b for b in existing_embedding) ** 0.5)
        )
        
        if similarity >= LAYER3_SIMILARITY_THRESHOLD:
            matches.append({
                'applicant_id': existing_app['id'],
                'email': existing_app['email'],
                'name': existing_app['name'],
                'position': existing_app.get('position', ''),
                'match_type': 'semantic_similarity',
                'confidence': round(similarity * 100, 2),
                'layer': 3,
                'details': {
                    'similarity_score': round(similarity, 4)
                }
            })
    
    return matches


def check_duplicates(
    applicant_data: dict,
    parsed_data: dict,
    skip_layer3: bool = False
) -> dict:
    """
    Main duplicate detection function.
    Checks all 3 layers and returns results.
    
    Args:
        applicant_data: Dict with applicant info (id, email, name, position)
        parsed_data: Dict with parsed resume data from resume_parser
        skip_layer3: If True, skip Layer 3 (for performance on large datasets)
    
    Returns:
        Dict with duplicate detection results:
        {
            'is_duplicate': bool,
            'layer': int or None,
            'matches': list[dict],
            'recommendation': str
        }
    """
    all_matches = []
    
    # Layer 1: Exact match
    print("Running Layer 1: Exact match check...")
    layer1_matches = layer1_exact_match(applicant_data, parsed_data)
    all_matches.extend(layer1_matches)
    
    if layer1_matches:
        # Found exact duplicate - no need to check further
        return {
            'is_duplicate': True,
            'layer': 1,
            'matches': layer1_matches,
            'recommendation': 'reject',
            'reason': 'Exact email or phone match found'
        }
    
    # Layer 2: Identity similarity
    print("Running Layer 2: Identity similarity check...")
    layer2_matches = layer2_identity_similarity(applicant_data, parsed_data)
    all_matches.extend(layer2_matches)
    
    if layer2_matches:
        # Sort by confidence
        layer2_matches.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        
        # If high confidence match (>90%), treat as duplicate
        if layer2_matches[0].get('confidence', 0) >= 90:
            return {
                'is_duplicate': True,
                'layer': 2,
                'matches': layer2_matches,
                'recommendation': 'reject',
                'reason': f"High identity similarity ({layer2_matches[0]['confidence']:.1f}%) - likely duplicate"
            }
    
    # Layer 3: Semantic similarity
    if not skip_layer3:
        print("Running Layer 3: Semantic similarity check...")
        layer3_matches = layer3_semantic_similarity(applicant_data, parsed_data)
        all_matches.extend(layer3_matches)
        
        if layer3_matches:
            layer3_matches.sort(key=lambda x: x.get('confidence', 0), reverse=True)
            
            if layer3_matches[0].get('confidence', 0) >= LAYER3_SIMILARITY_THRESHOLD * 100:
                return {
                    'is_duplicate': True,
                    'layer': 3,
                    'matches': layer3_matches,
                    'recommendation': 'review',
                    'reason': f"High resume similarity ({layer3_matches[0]['confidence']:.1f}%) - manual review recommended"
                }
    
    # No duplicates found
    return {
        'is_duplicate': False,
        'layer': None,
        'matches': [],
        'recommendation': 'proceed',
        'reason': 'No duplicates detected'
    }


def handle_duplicate(
    applicant_data: dict,
    duplicate_result: dict,
    job_title: str = "Unknown Position"
) -> bool:
    """
    Handle detected duplicate by sending rejection email and marking applicant.
    
    Args:
        applicant_data: Dict with applicant info
        duplicate_result: Result from check_duplicates
        job_title: Position applied for
    
    Returns:
        True if rejection email was sent successfully
    """
    sb = get_supabase_client()
    
    applicant_id = applicant_data.get('id')
    applicant_email = applicant_data.get('email')
    applicant_name = applicant_data.get('name')
    
    if not all([applicant_id, applicant_email, applicant_name]):
        print("Missing applicant data for duplicate handling")
        return False
    
    # Send rejection email first (so we still have the email address)
    if send_duplicate_rejection_notification:
        try:
            # Find the best matching existing applicant for context
            matches = duplicate_result.get('matches', [])
            match_info = ""
            if matches:
                match = matches[0]
                match_info = f" match with existing applicant: {match.get('name')} ({match.get('email')})"
            
            reason = duplicate_result.get('reason', 'Duplicate application detected')
            
            success = send_duplicate_rejection_notification(
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                job_title=job_title,
                score=0.0
            )
            
            if success:
                print(f"Sent duplicate rejection email to {applicant_email}")
            else:
                print(f"Failed to send rejection email to {applicant_email}")
        except Exception as e:
            print(f"Error sending rejection email: {e}")
    
    # Now delete the duplicate applicant and their data from database
    try:
        # First delete from resumes table (to handle foreign key constraints)
        sb.table('resumes').delete().eq('applicant_id', applicant_id).execute()
        print(f"Deleted resume for applicant {applicant_id}")
    except Exception as e:
        print(f"Error deleting resume: {e}")
    
    # Delete from recruitment_applicants table if it exists
    try:
        sb.table('recruitment_applicants').delete().eq('applicant_id', applicant_id).execute()
        print(f"Deleted from recruitment_applicants for applicant {applicant_id}")
    except Exception as e:
        # Table might not exist or no records to delete - this is okay
        print(f"Note: Could not delete from recruitment_applicants (table may not exist): {e}")
    
    # Finally delete from applicants table
    try:
        sb.table('applicants').delete().eq('id', applicant_id).execute()
        print(f"Deleted duplicate applicant {applicant_id} ({applicant_email}) and their resume from database")
        return True
    except Exception as e:
        print(f"Error deleting applicant: {e}")
        return False
    
    return False


def process_new_applicant(
    applicant_id: str,
    job_title: str = "Unknown Position"
) -> dict:
    """
    Process a newly created applicant for duplicate detection.
    This function should be called after an applicant is created and resume is parsed.
    
    Args:
        applicant_id: The ID of the newly created applicant
        job_title: The position applied for
    
    Returns:
        Dict with duplicate detection result
    """
    sb = get_supabase_client()
    
    # Get applicant data
    app_result = sb.table('applicants').select(
        'id, email, name, position'
    ).eq('id', applicant_id).execute()
    
    if not app_result.data:
        return {'error': 'Applicant not found'}
    
    applicant_data = app_result.data[0]
    
    # Get parsed resume data
    resume_result = sb.table('resumes').select(
        'parsed_data'
    ).eq('applicant_id', applicant_id).execute()
    
    if not resume_result.data:
        return {'error': 'Resume not found'}
    
    parsed_data = resume_result.data[0].get('parsed_data')
    if isinstance(parsed_data, str):
        try:
            parsed_data = json.loads(parsed_data)
        except:
            return {'error': 'Invalid parsed data'}
    
    if not parsed_data:
        return {'error': 'No parsed resume data available'}
    
    # Run duplicate detection
    print(f"Checking for duplicates for applicant {applicant_id}...")
    duplicate_result = check_duplicates(applicant_data, parsed_data)
    
    print(f"Duplicate detection result: {duplicate_result.get('recommendation')}")
    
    # Handle if duplicate found
    if duplicate_result.get('is_duplicate'):
        handle_duplicate(applicant_data, duplicate_result, job_title)
    
    return duplicate_result


# Integration functions for resume_collector.py
def integrate_with_collector():
    """
    Add duplicate detection to resume_collector.py.
    This can be called after process_attachments to check for duplicates.
    """
    pass  # Integration is done via process_new_applicant function


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Duplicate Detector for AutoIntel")
    parser.add_argument('--applicant-id', type=str, help='Check duplicates for specific applicant ID')
    parser.add_argument('--job-title', type=str, default='Unknown Position', help='Job title')
    parser.add_argument('--skip-layer3', action='store_true', help='Skip Layer 3 semantic similarity')
    
    args = parser.parse_args()
    
    if args.applicant_id:
        result = process_new_applicant(args.applicant_id, args.job_title)
        print(json.dumps(result, indent=2))
    else:
        print("Please provide --applicant-id to check for duplicates")
