#!/usr/bin/env python3
"""
AutoIntel Job Import Script

Imports enriched ETL job data from fresher_entry_jobs_2025_enriched.json
into the Supabase job_postings table with source='dataset'.

Usage:
    python import_enriched_jobs.py --file fresher_entry_jobs_2025_enriched.json
    python import_enriched_jobs.py --file fresher_entry_jobs_2025_enriched.json --dry-run
    python import_enriched_jobs.py --file fresher_entry_jobs_2025_enriched.json --reset

Environment Variables:
    SUPABASE_URL - Supabase project URL
    SUPABASE_SERVICE_KEY - Supabase service role key (for admin access)
"""

import os
import sys
import json
import argparse
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py is not installed. Run: pip install supabase")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_supabase_client() -> Client:
    """Initialize Supabase client with service role key."""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    
    if not supabase_url or not supabase_key:
        logger.error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY")
        sys.exit(1)
    
    return create_client(supabase_url, supabase_key)


def validate_job_data(job: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """Validate a single job record."""
    # Support both lowercase and capitalized field names
    job_id = job.get('job_id') or job.get('JobID')
    title = job.get('title') or job.get('Title')
    
    if not job_id:
        return False, "Missing required field: job_id (or JobID)"
    if not title:
        return False, "Missing required field: title (or Title)"
    
    return True, None


def transform_job_record(job: Dict[str, Any]) -> Dict[str, Any]:
    """Transform ETL job record to database format."""
    # Get fields with support for both lowercase and capitalized names
    job_id = job.get('job_id') or job.get('JobID', '')
    title = job.get('title') or job.get('Title', '')
    description = job.get('description') or job.get('Responsibilities') or job.get('JobSummary') or None
    role_family = job.get('role_family') or job.get('roleFamily') or job.get('RoleFamily') or 'General'
    
    # Handle skills - could be a string or list
    skills = job.get('skills') or job.get('Skills') or []
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(',') if s.strip()]
    
    # Handle keywords - could be a string or list
    keywords = job.get('keywords') or job.get('Keywords') or []
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(',') if k.strip()]
    
    # Handle education - ensure it's a list
    required_education = job.get('required_education') or job.get('requiredEducation') or job.get('RequiredEducation') or []
    if isinstance(required_education, str):
        required_education = [e.strip() for e in required_education.split(',') if e.strip()]
    
    # Handle projects - ensure it's a list
    expected_projects = job.get('expected_projects') or job.get('expectedProjects') or job.get('ExpectedProjects') or []
    if isinstance(expected_projects, str):
        expected_projects = [p.strip() for p in expected_projects.split(',') if p.strip()]
    
    # Handle certifications - ensure it's a list
    preferred_certifications = job.get('preferred_certifications') or job.get('preferredCertifications') or job.get('PreferredCertifications') or []
    if isinstance(preferred_certifications, str):
        preferred_certifications = [c.strip() for c in preferred_certifications.split(',') if c.strip()]
    
    # Parse experience range
    min_years = None
    max_years = None
    
    experience_range = job.get('years_experience_range', '')
    if isinstance(experience_range, str) and experience_range:
        # Parse formats like "0-2", "3-5 years", "5+"
        import re
        numbers = re.findall(r'\d+', experience_range)
        if len(numbers) >= 1:
            min_years = int(numbers[0])
        if len(numbers) >= 2:
            max_years = int(numbers[1])
    elif isinstance(experience_range, (int, float)):
        min_years = float(experience_range)
    
    # Also check min/max fields directly
    if 'min_years_experience' in job and job['min_years_experience'] is not None:
        try:
            min_years = float(job['min_years_experience'])
        except (ValueError, TypeError):
            pass
    
    if 'max_years_experience' in job and job['max_years_experience'] is not None:
        try:
            max_years = float(job['max_years_experience'])
        except (ValueError, TypeError):
            pass
    
    return {
        'job_id': str(job_id),
        'title': str(title),
        'description': description,
        'role_family': role_family,
        'skills': json.dumps(skills) if skills else '[]',
        'keywords': json.dumps(keywords) if keywords else '[]',
        'required_education': json.dumps(required_education) if required_education else '[]',
        'expected_projects': json.dumps(expected_projects) if expected_projects else '[]',
        'preferred_certifications': json.dumps(preferred_certifications) if preferred_certifications else '[]',
        'min_years_experience': min_years,
        'max_years_experience': max_years,
        'source': 'dataset',
        'is_active': True,
        'deleted_at': None,
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }


def load_json_file(file_path: str) -> List[Dict[str, Any]]:
    """Load and parse the JSON file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Handle different JSON structures
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            # Could be a dict with a 'jobs' or 'data' key
            for key in ['jobs', 'data', 'results', 'entries']:
                if key in data and isinstance(data[key], list):
                    return data[key]
            # Or a single job as a dict
            return [data]
        else:
            logger.error(f"Unexpected JSON structure: {type(data)}")
            return []
    
    except FileNotFoundError:
        logger.error(f"File not found: {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in file: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error reading file: {e}")
        sys.exit(1)


def import_jobs(supabase: Client, jobs: List[Dict[str, Any]], dry_run: bool = False, 
                batch_size: int = 100) -> tuple[int, int, int]:
    """
    Import jobs into Supabase.
    Returns: (success_count, skip_count, error_count)
    """
    success_count = 0
    skip_count = 0
    error_count = 0
    
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]
        batch_records = []
        
        for job in batch:
            # Validate
            is_valid, error_msg = validate_job_data(job)
            if not is_valid:
                logger.warning(f"Skipping invalid job: {error_msg}")
                skip_count += 1
                continue
            
            # Transform
            record = transform_job_record(job)
            batch_records.append(record)
        
        if dry_run:
            logger.info(f"[DRY RUN] Would import {len(batch_records)} jobs")
            success_count += len(batch_records)
            continue
        
        # Insert batch
        if batch_records:
            try:
                # Use upsert to handle duplicates
                response = supabase.table('job_postings').upsert(
                    batch_records,
                    on_conflict='job_id'
                ).execute()
                
                # Count results
                if response.data:
                    success_count += len(response.data)
                    logger.info(f"Imported batch {i//batch_size + 1}: {len(response.data)} jobs")
                
            except Exception as e:
                logger.error(f"Error importing batch {i//batch_size + 1}: {e}")
                error_count += len(batch_records)
    
    return success_count, skip_count, error_count


def reset_dataset_jobs(supabase: Client, dry_run: bool = False) -> int:
    """Soft delete all existing dataset-sourced jobs."""
    if dry_run:
        logger.info("[DRY RUN] Would soft delete all dataset-sourced jobs")
        return 0
    
    try:
        # Soft delete by setting is_active=false and deleted_at=now()
        response = supabase.table('job_postings').update({
            'is_active': False,
            'deleted_at': datetime.now().isoformat()
        }).eq('source', 'dataset').execute()
        
        count = len(response.data) if response.data else 0
        logger.info(f"Soft deleted {count} existing dataset jobs")
        return count
    except Exception as e:
        logger.error(f"Error resetting dataset jobs: {e}")
        return 0


def get_import_stats(supabase: Client) -> Dict[str, int]:
    """Get current job statistics."""
    try:
        # Count dataset jobs
        dataset_response = supabase.table('job_postings').select('*', count='exact').eq('source', 'dataset').execute()
        dataset_count = dataset_response.count if hasattr(dataset_response, 'count') else 0
        
        # Count admin jobs
        admin_response = supabase.table('job_postings').select('*', count='exact').eq('source', 'admin').execute()
        admin_count = admin_response.count if hasattr(admin_response, 'count') else 0
        
        # Count active jobs
        active_response = supabase.table('job_postings').select('*', count='exact').eq('is_active', True).is_('deleted_at', 'null').execute()
        active_count = active_response.count if hasattr(active_response, 'count') else 0
        
        return {
            'dataset_jobs': dataset_count,
            'admin_jobs': admin_count,
            'active_jobs': active_count
        }
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(
        description='Import enriched ETL jobs into AutoIntel Supabase'
    )
    parser.add_argument(
        '--file', '-f',
        default='fresher_entry_jobs_2025_enriched.json',
        help='Path to the enriched jobs JSON file (default: fresher_entry_jobs_2025_enriched.json)'
    )
    parser.add_argument(
        '--dry-run', '-d',
        action='store_true',
        help='Preview changes without importing'
    )
    parser.add_argument(
        '--reset', '-r',
        action='store_true',
        help='Reset (soft delete) existing dataset jobs before import'
    )
    parser.add_argument(
        '--batch-size', '-b',
        type=int,
        default=100,
        help='Batch size for imports (default: 100)'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Check file exists
    file_path = Path(args.file)
    if not file_path.exists():
        logger.error(f"File not found: {args.file}")
        sys.exit(1)
    
    # Initialize Supabase
    supabase = get_supabase_client()
    
    # Show current stats
    logger.info("Current database statistics:")
    stats = get_import_stats(supabase)
    for key, value in stats.items():
        logger.info(f"  {key}: {value}")
    
    # Load jobs
    logger.info(f"Loading jobs from {args.file}...")
    jobs = load_json_file(str(file_path))
    logger.info(f"Loaded {len(jobs)} jobs from file")
    
    if not jobs:
        logger.warning("No jobs found to import")
        sys.exit(0)
    
    # Preview first job
    logger.debug("Sample job record:")
    logger.debug(json.dumps(jobs[0], indent=2, default=str))
    
    # Reset existing dataset jobs if requested
    if args.reset:
        logger.info("Resetting existing dataset jobs...")
        reset_dataset_jobs(supabase, dry_run=args.dry_run)
    
    # Import jobs
    logger.info(f"Starting import (batch size: {args.batch_size})...")
    if args.dry_run:
        logger.info("[DRY RUN MODE - No changes will be made]")
    
    success, skipped, errors = import_jobs(
        supabase, 
        jobs, 
        dry_run=args.dry_run,
        batch_size=args.batch_size
    )
    
    # Summary
    logger.info("=" * 50)
    logger.info("Import Summary:")
    logger.info(f"  Total jobs in file: {len(jobs)}")
    logger.info(f"  Successfully imported: {success}")
    logger.info(f"  Skipped (invalid): {skipped}")
    logger.info(f"  Errors: {errors}")
    logger.info("=" * 50)
    
    # Show updated stats
    if not args.dry_run:
        logger.info("Updated database statistics:")
        stats = get_import_stats(supabase)
        for key, value in stats.items():
            logger.info(f"  {key}: {value}")
    
    # Exit with error code if there were errors
    if errors > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
