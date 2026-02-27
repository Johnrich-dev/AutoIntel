import json

from resume_parser import parse_resume, segment_sections


def test_simple_single_column_resume():
    raw = """
    JOHN DOE
    john.doe@example.com
    +63 912 345 6789

    PROFILE
    Software engineer with 3+ years of experience building web applications.

    EDUCATION
    2016 - 2020  University of Example  Bachelor of Science in Computer Science

    EXPERIENCE
    Software Engineer  Example Corp  2020 - Present
    Building full-stack features using React and Node.js.

    SKILLS
    Python, JavaScript, React, Node.js, SQL
    """

    result = parse_resume(raw)
    assert result["name"] is not None
    assert result["email"] == "john.doe@example.com"
    assert any("University of Example" in (e.get("school") or "") for e in result["education"])
    assert any("Software Engineer" in (e.get("role") or "") for e in result["experience"])
    assert "Python" in result["skills"]["all"]


def test_multicolumn_like_layout_reconstructed():
    # Simulate a two-column PDF where PyPDF produced interleaved lines
    raw = """
    JOHN DOE                SKILLS
    john.doe@example.com    Python, JavaScript
    +63 912 345 6789        React, Node.js

    EXPERIENCE
    Software Engineer
    Example Corp
    2020 - Present

    EDUCATION
    University of Example
    BS in Computer Science
    2016 - 2020
    """

    sections = segment_sections(raw)
    assert "EXPERIENCE" in sections
    assert "EDUCATION" in sections

    result = parse_resume(raw)
    assert result["email"] == "john.doe@example.com"
    assert any("Example" in (e.get("school") or "") for e in result["education"])
    assert any("Engineer" in (e.get("role") or "") or "Example Corp" in (e.get("company") or "") for e in result["experience"])


def test_dianna_sample_no_cross_section_leakage():
    raw = """
DIANNA JANE ELIZABETH PACATANG
IT DEVELOPER | PART-TIME APPLICANT
+63 977 375 1827
diannajaneelizabeth@gmail.com
PROFILE
A fourth-year graduating Computer Science student with hands-on experience in software
development, cloud computing, and workflow automation.
EDUCATION
EDUCATION
BACHELOR OF SCIENCE IN COMPUTER SCIENCE
2022 - Present
Cavite State University - Imus
SCIENCE TECHNOLOGY AND MATHEMATICS (STEM)
2020 - 2022
Parañaque National High School - Main Senior High School
SKILLS
Data preprocessing & automation with AWS
Lambda
EXPERIENCE
CONCEPCION BUSINESS SERVICES, INC.
AUGUST 2025-SEPTEMBER 2025
DATA ENGINEER INTERN
Designed and automated ETL pipelines to load and clean datasets in MySQL.
ACHIEVEMENTS
Multimedia Manager (2023–2024)
"""
    result = parse_resume(raw)

    # Email normalization should be clean
    assert result["email"] == "diannajaneelizabeth@gmail.com"

    # Education should come from EDUCATION section, not ACHIEVEMENTS
    assert any((e.get("school") or "").startswith("Cavite State University") for e in result["education"])
    assert not any("Multimedia Manager" in (e.get("raw_text") or "") for e in result["education"])

    # Experience should come from EXPERIENCE section, not PROFILE/SKILLS
    assert any((e.get("company") or "") == "CONCEPCION BUSINESS SERVICES, INC." for e in result["experience"])
    assert not any("hands-on experience" in (e.get("raw_text") or "").lower() for e in result["experience"])
