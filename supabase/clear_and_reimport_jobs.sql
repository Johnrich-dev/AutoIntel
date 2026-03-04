-- Clear existing dataset jobs and reimport from correct file
-- Step 1: Delete existing dataset jobs
DELETE FROM job_postings WHERE source = 'dataset';

-- Step 2: Verify deletion
SELECT 'Remaining jobs after cleanup:' as info;
SELECT source, COUNT(*) as count FROM job_postings GROUP BY source;
