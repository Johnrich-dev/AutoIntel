"""
Pytest configuration for AutoIntel Job Alignment Tests
"""

import os
import sys
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_resume():
    """Sample resume text for testing"""
    return """
    Python Developer with 3 years of experience in web development.
    Skills: Python, Django, Flask, PostgreSQL, Docker, AWS, Git.
    Experience building REST APIs and microservices.
    Bachelor's degree in Computer Science.
    Work experience includes:
    - Backend development with Python and Django
    - Database design with PostgreSQL
    - Cloud deployment on AWS
    - API development and integration
    """


@pytest.fixture
def python_job_description():
    """Sample Python developer job description"""
    return """
    Senior Python Developer position. Requirements:
    - 3+ years Python experience
    - Django or Flask framework
    - Database: PostgreSQL or MySQL
    - Cloud platforms (AWS preferred)
    - REST API development
    - Experience with microservices
    """


@pytest.fixture
def marketing_job_description():
    """Sample marketing job description"""
    return """
    Marketing Manager position. Requirements:
    - 5+ years marketing experience
    - Social media management
    - Content creation
    - SEO and analytics
    - Team leadership
    """


@pytest.fixture
def data_science_job_description():
    """Sample data science job description"""
    return """
    Data Scientist position. Requirements:
    - Experience with Python, R, or SQL
    - Machine learning algorithms
    - Data visualization
    - Statistical analysis
    - Experience with TensorFlow or PyTorch
    """


@pytest.fixture
def mock_jobs():
    """Mock job list for testing recommend_jobs"""
    return [
        {
            "job_id": "JOB_PYTHON_001",
            "title": "Senior Python Developer",
            "description": """
            Senior Python Developer position. Requirements:
            - 3+ years Python experience
            - Django or Flask framework
            - Database: PostgreSQL
            - AWS cloud experience
            - REST API development
            """,
            "role_family": "Engineering",
            "skills": ["Python", "Django", "AWS", "PostgreSQL"],
            "keywords": ["backend", "api", "cloud"]
        },
        {
            "job_id": "JOB_MARKETING_001",
            "title": "Marketing Manager",
            "description": """
            Marketing Manager position. Requirements:
            - 5+ years marketing experience
            - Social media management
            - Content creation
            - SEO and analytics
            - Team leadership
            """,
            "role_family": "Marketing",
            "skills": ["SEO", "Social Media", "Content"],
            "keywords": ["marketing", "content", "analytics"]
        },
        {
            "job_id": "JOB_DATA_001",
            "title": "Data Scientist",
            "description": """
            Data Scientist position. Requirements:
            - Experience with Python and R
            - Machine learning algorithms
            - Data visualization
            - Statistical analysis
            - TensorFlow or PyTorch
            """,
            "role_family": "Data Science",
            "skills": ["Python", "Machine Learning", "TensorFlow"],
            "keywords": ["data", "ml", "analytics"]
        }
    ]


@pytest.fixture
def empty_text():
    """Empty text for edge case testing"""
    return ""


@pytest.fixture
def very_short_text():
    """Very short text for edge case testing"""
    return "Python"


@pytest.fixture
def very_long_text():
    """Very long text for edge case testing"""
    return """
    This is a very long text that simulates a detailed job description with extensive requirements.
    The text goes on and on to test the truncation functionality of the job alignment module.
    """ * 100
