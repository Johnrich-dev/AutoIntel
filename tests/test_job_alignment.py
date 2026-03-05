"""
Unit Tests for AutoIntel Job Alignment Module (Stage 2)
Tests the enhanced semantic matching functions with edge cases.
"""

import os
import sys
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the job alignment module
import job_alignment


class TestPreprocessText:
    """Tests for text preprocessing function"""
    
    def test_lowercase_conversion(self):
        """Test that text is converted to lowercase"""
        text = "PYTHON DEVELOPER"
        result = job_alignment.preprocess_text(text)
        assert result == "python developer"
    
    def test_trim_whitespace(self):
        """Test that leading/trailing whitespace is trimmed"""
        text = "   python developer   "
        result = job_alignment.preprocess_text(text)
        assert result == "python developer"
    
    def test_normalize_whitespace(self):
        """Test that multiple spaces are normalized"""
        text = "python   developer   with   skills"
        result = job_alignment.preprocess_text(text)
        assert result == "python developer with skills"
    
    def test_empty_text(self):
        """Test empty text returns empty string"""
        result = job_alignment.preprocess_text("")
        assert result == ""
    
    def test_none_input(self):
        """Test None input returns empty string"""
        result = job_alignment.preprocess_text(None)
        assert result == ""


class TestTruncateText:
    """Tests for text truncation function"""
    
    def test_short_text_unchanged(self):
        """Test that short text is not truncated"""
        text = "Short text"
        result = job_alignment.truncate_text(text, max_length=100)
        assert result == "Short text"
    
    def test_long_text_truncated(self):
        """Test that long text is truncated"""
        text = "a" * 15000
        result = job_alignment.truncate_text(text, max_length=10000)
        assert len(result) <= 10010  # Allow for truncation marker
    
    def test_empty_text(self):
        """Test empty text returns empty string"""
        result = job_alignment.truncate_text("")
        assert result == ""


class TestCalculateSemanticSimilarity:
    """Tests for calculate_semantic_similarity function"""
    
    def test_similar_texts_high_similarity(self, sample_resume, python_job_description):
        """Test that similar texts have high similarity"""
        result = job_alignment.calculate_semantic_similarity(
            sample_resume, 
            python_job_description
        )
        
        assert result["status"] == "success"
        assert result["similarity"] > 0.3  # Should be reasonably high
        assert result["confidence"] > 0.0
        assert 0.0 <= result["similarity"] <= 1.0
    
    def test_different_texts_low_similarity(self, sample_resume, marketing_job_description):
        """Test that different texts have lower similarity"""
        result = job_alignment.calculate_semantic_similarity(
            sample_resume,
            marketing_job_description
        )
        
        assert result["status"] == "success"
        assert result["similarity"] < 0.5  # Should be lower than similar texts
    
    def test_empty_first_text(self, empty_text, python_job_description):
        """Test handling of empty first text"""
        result = job_alignment.calculate_semantic_similarity(
            empty_text,
            python_job_description
        )
        
        assert result["status"] == "error"
        assert "empty" in result["message"].lower()
        assert result["similarity"] == 0.0
    
    def test_empty_second_text(self, sample_resume, empty_text):
        """Test handling of empty second text"""
        result = job_alignment.calculate_semantic_similarity(
            sample_resume,
            empty_text
        )
        
        assert result["status"] == "error"
        assert "empty" in result["message"].lower()
        assert result["similarity"] == 0.0
    
    def test_very_short_text(self, very_short_text, python_job_description):
        """Test handling of very short text"""
        result = job_alignment.calculate_semantic_similarity(
            very_short_text,
            python_job_description
        )
        
        # Short text should return warning status
        assert result["status"] in ["warning", "success"]
    
    def test_very_long_text(self, sample_resume, very_long_text):
        """Test handling of very long text"""
        result = job_alignment.calculate_semantic_similarity(
            sample_resume,
            very_long_text
        )
        
        # Should still work, possibly with warning
        assert "status" in result
        assert "similarity" in result
    
    def test_identical_texts(self):
        """Test that identical texts have maximum similarity"""
        text = "python developer with django experience"
        result = job_alignment.calculate_semantic_similarity(text, text)
        
        assert result["status"] == "success"
        assert result["similarity"] == 1.0
    
    def test_confidence_calculation(self, sample_resume, python_job_description):
        """Test confidence is calculated and returned"""
        result = job_alignment.calculate_semantic_similarity(
            sample_resume,
            python_job_description
        )
        
        assert "confidence" in result
        assert 0.0 <= result["confidence"] <= 1.0


class TestCalculateJobFitScore:
    """Tests for calculate_job_fit_score function"""
    
    def test_similar_job_high_score(self, sample_resume, python_job_description):
        """Test that similar job gets high score"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description,
            job_id="JOB_TEST_001"
        )
        
        assert result["job_id"] == "JOB_TEST_001"
        assert result["semantic_score"] > 50
        assert result["raw_similarity"] > 0.5
        assert result["fit_category"] in ["Excellent Fit", "Good Fit", "Moderate Fit"]
        assert "confidence" in result
        assert "confidence_label" in result
    
    def test_different_job_low_score(self, sample_resume, marketing_job_description):
        """Test that different job gets lower score"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=marketing_job_description
        )
        
        assert result["semantic_score"] < 50
        assert result["fit_category"] in ["Moderate Fit", "Low Fit"]
    
    def test_job_id_tracking(self, sample_resume, python_job_description):
        """Test that job_id is properly tracked"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description,
            job_id="JOB_PYTHON_001"
        )
        
        assert result["job_id"] == "JOB_PYTHON_001"
    
    def test_no_job_id(self, sample_resume, python_job_description):
        """Test that job_id defaults to None"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description
        )
        
        assert result["job_id"] is None
    
    def test_text_lengths_included(self, sample_resume, python_job_description):
        """Test that text lengths are included in result"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description
        )
        
        assert "text_lengths" in result
        assert result["text_lengths"]["resume_length"] > 0
        assert result["text_lengths"]["job_description_length"] > 0
    
    def test_score_categories(self):
        """Test that score categories are correctly assigned"""
        # Test Excellent Fit (>= 80)
        result = job_alignment.calculate_job_fit_score(
            resume_text="python developer with django flask aws rest api",
            job_description="python developer django flask aws rest api microservices"
        )
        assert result["fit_category"] == "Excellent Fit"
        
        # Test Good Fit (>= 60)
        result = job_alignment.calculate_job_fit_score(
            resume_text="python developer with some experience",
            job_description="python developer required skills"
        )
        assert result["fit_category"] in ["Excellent Fit", "Good Fit"]
        
        # Test Moderate Fit (>= 40)
        result = job_alignment.calculate_job_fit_score(
            resume_text="developer with technical skills",
            job_description="marketing manager needed"
        )
        assert result["fit_category"] in ["Moderate Fit", "Low Fit"]
    
    def test_confidence_labels(self, sample_resume, python_job_description):
        """Test confidence labels are correctly assigned"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description
        )
        
        assert result["confidence_label"] in ["Very Low", "Low", "Medium", "High", "Very High"]
    
    def test_score_quality_assessment(self, sample_resume, python_job_description):
        """Test score quality assessment is included"""
        result = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=python_job_description
        )
        
        assert "score_quality" in result
        assert isinstance(result["score_quality"], str)


class TestRecommendJobs:
    """Tests for recommend_jobs function"""
    
    def test_recommend_with_mock_jobs(
        self, 
        sample_resume, 
        mock_jobs
    ):
        """Test job recommendations with mock job list"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=5,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        assert len(recommendations) <= 5
        assert len(recommendations) > 0
        
        # Check first result has all expected fields
        first_result = recommendations[0]
        assert "job_id" in first_result
        assert "title" in first_result
        assert "semantic_score" in first_result
        assert "fit_category" in first_result
        assert "confidence" in first_result
    
    def test_recommendations_sorted_by_score(
        self,
        sample_resume,
        mock_jobs
    ):
        """Test that recommendations are sorted by score (descending)"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=5,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        if len(recommendations) > 1:
            scores = [r["semantic_score"] for r in recommendations]
            assert scores == sorted(scores, reverse=True)
    
    def test_python_job_top_recommendation(
        self,
        sample_resume,
        mock_jobs
    ):
        """Test that Python job is recommended for Python resume"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=3,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        # Python job should be top recommendation
        assert recommendations[0]["job_id"] == "JOB_PYTHON_001"
    
    def test_limit_parameter(
        self,
        sample_resume,
        mock_jobs
    ):
        """Test that limit parameter works correctly"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=2,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        assert len(recommendations) <= 2
    
    def test_empty_job_list(self, sample_resume):
        """Test handling of empty job list"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=5,
            fetch_from_db=False,
            jobs=[]
        )
        
        assert recommendations == []
    
    def test_job_without_description(self, sample_resume):
        """Test handling of job without description"""
        jobs = [
            {"job_id": "JOB_001", "title": "Test Job", "description": ""},
            {"job_id": "JOB_002", "title": "Valid Job", "description": "python developer needed"}
        ]
        
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=5,
            fetch_from_db=False,
            jobs=jobs
        )
        
        # Should only return the valid job
        assert len(recommendations) <= 1
    
    def test_full_job_details_returned(
        self,
        sample_resume,
        mock_jobs
    ):
        """Test that full job details are returned in recommendations"""
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=5,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        first_result = recommendations[0]
        
        # Check all expected fields are present
        assert "job_id" in first_result
        assert "title" in first_result
        assert "role_family" in first_result
        assert "skills" in first_result
        assert "keywords" in first_result
        assert "semantic_score" in first_result
        assert "raw_similarity" in first_result
        assert "fit_category" in first_result
        assert "confidence" in first_result
        assert "confidence_label" in first_result
        assert "score_quality" in first_result


class TestIntegration:
    """Integration tests combining multiple functions"""
    
    def test_full_pipeline(self, sample_resume, mock_jobs):
        """Test the full recommendation pipeline"""
        # Step 1: Calculate similarity
        similarity = job_alignment.calculate_semantic_similarity(
            sample_resume,
            mock_jobs[0]["description"]
        )
        
        assert similarity["status"] == "success"
        
        # Step 2: Calculate job fit score
        fit_score = job_alignment.calculate_job_fit_score(
            resume_text=sample_resume,
            job_description=mock_jobs[0]["description"],
            job_id=mock_jobs[0]["job_id"]
        )
        
        assert fit_score["semantic_score"] == similarity["similarity"] * 100
        
        # Step 3: Get recommendations
        recommendations = job_alignment.recommend_jobs(
            resume_text=sample_resume,
            limit=3,
            fetch_from_db=False,
            jobs=mock_jobs
        )
        
        assert len(recommendations) > 0
        assert recommendations[0]["semantic_score"] >= recommendations[-1]["semantic_score"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
