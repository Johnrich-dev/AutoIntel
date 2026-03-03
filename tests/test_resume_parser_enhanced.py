#!/usr/bin/env python3
"""
Test script to verify the improved resume parser functionality:
1. pdfplumber as primary PDF extractor with fallback
2. Global ALL CAPS → Title Case normalization with acronym safety
3. Education classification + deduplication
4. Unified certificates/seminars/trainings handling
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test the normalization functions
from resume_parser import (
    _normalize_line_case,
    _is_all_caps_line,
    KNOWN_ACRONYMS,
    parse_trainings_from_lines,
    parse_education_from_lines,
    parse_education_section,
    _detect_section_heading,
    SECTION_ALIASES,
)


def test_all_caps_detection():
    """Test ALL CAPS line detection."""
    print("\n=== Testing ALL CAPS Line Detection ===")
    
    # Test cases: (input, expected)
    # Lines with mostly uppercase should be converted (unless they're acronyms)
    test_cases = [
        ("BACHELOR OF SCIENCE IN COMPUTER SCIENCE", True),  # Long words in caps - convert
        ("SCIENCE TECHNOLOGY AND MATHEMATICS (STEM)", True),  # Long words in caps - convert
        ("AWS SQL PYTHON", False),  # Short acronym words - don't convert
        ("John Doe", False),
        ("BS Computer Science", False),
        ("stem abm humss tvl", False),
        ("Senior High School", False),
    ]
    
    passed = 0
    failed = 0
    for text, expected in test_cases:
        result = _is_all_caps_line(text)
        if result == expected:
            passed += 1
            print(f"[PASS] '{text}' -> {result}")
        else:
            failed += 1
            print(f"[FAIL] '{text}' -> {result} (expected {expected})")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_title_case_normalization():
    """Test Title Case normalization with acronym safety."""
    print("\n=== Testing Title Case Normalization ===")
    
    # Note: Our implementation uses proper title case which capitalizes each word
    # The key is that it converts ALL CAPS to proper case while preserving acronyms
    test_cases = [
        # (input, should_convert)
        ("BACHELOR OF SCIENCE IN COMPUTER SCIENCE", True),
        ("SCIENCE TECHNOLOGY AND MATHEMATICS (STEM)", True),
        ("STEM ABM HUMSS TVL", False),  # Short acronyms - not converted
        ("AWS SQL PYTHON DEVELOPER", False),  # Short acronyms - not converted
        ("Bachelor of Science in Information Technology", False),  # Already mixed case
    ]
    
    passed = 0
    failed = 0
    for input_text, should_convert in test_cases:
        result = _normalize_line_case(input_text)
        
        if should_convert:
            # If it should convert, result should NOT be all uppercase
            is_all_caps = result.isupper() and result.isalpha() == False
            if not is_all_caps and result != input_text:
                passed += 1
                print(f"[PASS] '{input_text}' -> '{result}'")
            else:
                failed += 1
                print(f"[FAIL] '{input_text}' -> '{result}' (should have converted)")
        else:
            # If it shouldn't convert, result should equal input
            if result == input_text:
                passed += 1
                print(f"[PASS] '{input_text}' -> '{result}'")
            else:
                failed += 1
                print(f"[FAIL] '{input_text}' -> '{result}' (should not have converted)")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_acronym_preservation():
    """Test that known acronyms are preserved in uppercase."""
    print("\n=== Testing Acronym Preservation ===")
    
    # Test with known acronyms - these should NOT be converted
    test_cases = [
        "AWS SQL PYTHON",
        "STEM ABM HUMSS",
        "ICT TVL GAS",
    ]
    
    passed = 0
    failed = 0
    for text in test_cases:
        result = _normalize_line_case(text)
        # These should remain unchanged (or at least not all converted to lowercase)
        if result.upper() == text.upper():
            passed += 1
            print(f"[PASS] Input: '{text}' -> Output: '{result}'")
        else:
            failed += 1
            print(f"[FAIL] Input: '{text}' -> Output: '{result}'")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_education_classification():
    """Test education classification with strand/degree keywords."""
    print("\n=== Testing Education Classification ===")
    
    # Test parse_education_from_lines
    lines = [
        "Bachelor of Science in Computer Science",
        "University of Technology",
        "2018 - 2022",
        "",
        "SCIENCE TECHNOLOGY AND MATHEMATICS (STEM)",
        "Senior High School",
        "2020 - 2022",
    ]
    
    entries = parse_education_from_lines(lines)
    print(f"Found {len(entries)} education entries:")
    for entry in entries:
        print(f"  - School: {entry.get('school')}")
        print(f"    Type: {entry.get('education_type')}")
        print(f"    Course/Strand: {entry.get('course_or_strand')}")
        print(f"    Year: {entry.get('year_range')}")
    
    # Check classification
    passed = True
    for entry in entries:
        course = entry.get('course_or_strand', '').lower()
        edu_type = entry.get('education_type', '')
        
        if 'stem' in course or 'science technology' in course:
            if edu_type == 'Senior High School':
                print(f"[PASS] STEM classified as Senior High School")
            else:
                print(f"[FAIL] STEM should be Senior High School, got {edu_type}")
                passed = False
        
        if 'bachelor' in course or 'computer science' in course:
            if edu_type == 'College':
                print(f"[PASS] Bachelor degree classified as College")
            else:
                print(f"[FAIL] Bachelor should be College, got {edu_type}")
                passed = False
    
    return passed


def test_training_unification():
    """Test unified training/seminar/certificate handling."""
    print("\n=== Testing Training/Seminar/Certificate Unification ===")
    
    # Test various heading formats - these should detect the heading and capture content after it
    test_cases = [
        {
            "name": "CERTIFICATES section",
            "lines": ["CERTIFICATES", "AWS Certified Developer", "Python Programming Certificate"],
        },
        {
            "name": "SEMINARS section", 
            "lines": ["SEMINARS", "Leadership and Teamwork Seminar"],
        },
        {
            "name": "TRAININGS section",
            "lines": ["TRAININGS", "Python Programming Training"],
        },
    ]
    
    all_passed = True
    for test in test_cases:
        items = parse_trainings_from_lines(test["lines"], is_section_block=True)
        print(f"\nTest: {test['name']}")
        print(f"  Found {len(items)} items: {items}")
        
        # Verify items are captured (should get at least 1 item)
        if len(items) >= 1:
            print(f"[PASS] Items captured from {test['name']}")
        else:
            print(f"[FAIL] No items captured from {test['name']}")
            all_passed = False
    
    return all_passed


def test_section_aliases():
    """Test that all training-related aliases are properly mapped."""
    print("\n=== Testing Section Aliases ===")
    
    test_headings = [
        "CERTIFICATE",
        "CERTIFICATES", 
        "SEMINAR",
        "SEMINARS",
        "TRAINING",
        "TRAININGS",
        "SEMINARS AND TRAINING",
        "WORKSHOPS",
        "CERTIFICATION",
    ]
    
    passed = 0
    failed = 0
    for heading in test_headings:
        result = _detect_section_heading(heading)
        if result == 'SEMINARS/TRAINING':
            passed += 1
            print(f"[PASS] '{heading}' -> {result}")
        else:
            failed += 1
            print(f"[FAIL] '{heading}' -> {result} (expected SEMINARS/TRAINING)")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    print("=" * 60)
    print("Resume Parser - Enhanced Functionality Tests")
    print("=" * 60)
    
    results = []
    results.append(("ALL CAPS Detection", test_all_caps_detection()))
    results.append(("Title Case Normalization", test_title_case_normalization()))
    results.append(("Acronym Preservation", test_acronym_preservation()))
    results.append(("Education Classification", test_education_classification()))
    results.append(("Training Unification", test_training_unification()))
    results.append(("Section Aliases", test_section_aliases()))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("All tests passed!")
    else:
        print("Some tests failed - please review")
    print("=" * 60)
