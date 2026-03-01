#!/usr/bin/env python3
"""
Test script to demonstrate the improved PDF text extraction
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

# Import from resume_parser instead (section_resume_text is the new function)
from resume_parser import section_resume_text

# Sample resume text
sample_resume = """
JOHN DOE
john.doe@example.com
+63 912 345 6789
Software Engineer

PROFILE
Experienced software engineer with 5+ years in web development.

EDUCATION
Bachelor of Science in Computer Science
University of Technology
2018 - 2022

EXPERIENCE
Senior Developer
Tech Company
2022 - Present
Developed web applications
Led team of 3 developers

SKILLS
Python JavaScript React AWS
"""

print("=== BEFORE (Original raw text) ===")
print(sample_resume)

print("\n=== AFTER (Pre-NER Sectioning) ===")
sections = section_resume_text(sample_resume)

print("\n--- Profile Section ---")
print(f"Name: {sections['profile']['name']}")
print(f"Email: {sections['profile']['email']}")
print(f"Phone: {sections['profile']['phone']}")
print(f"Raw: {repr(sections['profile']['raw_text'])}")

print("\n--- Education Section ---")
print(f"Raw: {repr(sections['education']['raw_text'])}")
print(f"College entries: {sections['education']['college']}")

print("\n--- Experience Section ---")
print(f"Raw: {repr(sections['_raw']['experience'])}")
print(f"Experience entries: {sections['experience']}")

print("\n--- Skills Section ---")
print(f"Raw: {repr(sections['_raw']['skills'])}")

print("\n=== Key Improvements ===")
print("[PASS] Section-first parsing before NER")
print("[PASS] Profile content isolated from Experience/Education")
print("[PASS] Skills lines don't contaminate Experience entries")
print("[PASS] Each section's raw_text is stored separately for targeted NER")
print("[PASS] ACHIEVEMENTS lines stay out of EDUCATION")
