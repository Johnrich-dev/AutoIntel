#!/usr/bin/env python3
"""
Check for and remove duplicate JobIDs from the JSON file
"""
import json
import sys
from collections import Counter

def check_and_dedupe(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        jobs = json.load(f)
    
    print(f"Total jobs in file: {len(jobs)}")
    
    # Find duplicates
    job_ids = [job['JobID'] for job in jobs]
    duplicates = [jid for jid, count in Counter(job_ids).items() if count > 1]
    
    print(f"Unique JobIDs: {len(set(job_ids))}")
    print(f"Duplicate JobIDs: {len(duplicates)}")
    
    if duplicates:
        print(f"\nDuplicate JobIDs found: {duplicates[:20]}")
        
        # Keep first occurrence of each JobID
        seen = set()
        unique_jobs = []
        for job in jobs:
            if job['JobID'] not in seen:
                seen.add(job['JobID'])
                unique_jobs.append(job)
        
        print(f"\nAfter deduplication: {len(unique_jobs)} jobs")
        
        # Write deduplicated file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(unique_jobs, f, indent=2)
        
        print(f"\nDeduplicated file saved to: {output_file}")
        return len(unique_jobs)
    else:
        print("No duplicates found!")
        return len(jobs)

if __name__ == "__main__":
    input_file = "data/entry_jobs_descriptions.json"
    output_file = "data/entry_jobs_descriptions_deduped.json"
    
    count = check_and_dedupe(input_file, output_file)
    sys.exit(0 if count > 0 else 1)
