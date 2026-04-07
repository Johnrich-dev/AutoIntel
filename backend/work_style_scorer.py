#!/usr/bin/env python3
"""
Work Style Assessment Semantic Scorer

This module provides semantic scoring for the Work Style Assessment using:
1. Sentence embeddings (all-MiniLM-L6-v2) for structured Likert responses
2. GPT-4o Mini for essay evaluation
3. Hybrid combination for final dimension scores
4. Role alignment calculation based on job title

Usage:
    from work_style_scorer import WorkStyleScorer
    scorer = WorkStyleScorer()
    result = scorer.score_assessment(answers, essay, job_title)

Author: AutoIntel System
"""

import os
import json
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import hashlib

# Try to import required libraries
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("WARNING: sentence-transformers not installed. Install with: pip install sentence-transformers")

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("WARNING: openai not installed. Install with: pip install openai")

# Configuration
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
DEFAULT_GPT_MODEL = "gpt-4o-mini"

# Weight constants for hybrid scoring
LIKERT_EMBEDDING_WEIGHT = 0.5
ESSAY_GPT_WEIGHT = 0.5
LIKERT_ANSWER_WEIGHT = 0.4  # Weight for raw Likert answers in embedding calculation
EMBEDDING_SCORE_WEIGHT = 0.6  # Weight for embedding similarity in final score

# Dimension descriptions for embedding comparison
DIMENSION_REFERENCE_DESCRIPTIONS = {
    "collaboration": {
        "high": "Works exceptionally well with others, fosters teamwork, actively contributes to group goals, supports colleagues, values diverse perspectives, enjoys collaborative environments",
        "low": "Prefers working alone, struggles in team settings, has difficulty cooperating with others, tends to work independently"
    },
    "independence": {
        "high": "Self-directed, works well without supervision, takes ownership of tasks, manages own time effectively, requires minimal guidance",
        "low": "Needs constant direction, struggles to work autonomously, relies heavily on supervision, prefers structured guidance"
    },
    "leadership_readiness": {
        "high": "Ready to take charge, comfortable leading projects, willing to mentor others, takes responsibility for outcomes, motivates team members",
        "low": "Uncomfortable leading, prefers following directions, avoids leadership responsibilities, hesitant to take charge"
    },
    "adaptability": {
        "high": "Embraces change, quickly adjusts to new situations, flexible in approach, thrives in dynamic environments, learns new skills readily",
        "low": "Resistant to change, struggles with new environments, prefers stability and routine, slow to adapt"
    },
    "attention_to_detail": {
        "high": "Meticulous, thorough, catches errors,注重细节, ensures accuracy, comprehensive in review",
        "low": "Overlooks details, makes careless errors, rushed work, misses important information"
    },
    "problem_solving": {
        "high": "Excellent analytical skills, enjoys complex challenges, finds creative solutions, thinks critically, approaches problems systematically",
        "low": "Struggles with complex problems, avoids challenging situations, lacks analytical approach"
    },
    "communication": {
        "high": "Clearly expresses ideas, excellent verbal and written communication, articulates thoughts well, listens actively, presents effectively",
        "low": "Difficult to understand, struggles to convey ideas, poor written communication, has difficulty explaining thoughts"
    },
    "stress_tolerance": {
        "high": "Remains calm under pressure, handles tight deadlines well, performs well in high-stress situations, stays composed",
        "low": "Becomes overwhelmed, struggles with deadlines, anxious under pressure, difficulty functioning in stressful situations"
    },
    "feedback_receptiveness": {
        "high": "Actively seeks feedback, embraces constructive criticism, uses feedback to improve, open to learning from others",
        "low": "Defensive about feedback, avoids criticism, resistant to input from others, dismisses constructive advice"
    },
    "ambiguity_tolerance": {
        "high": "Comfortable with uncertainty, makes decisions with incomplete information, handles ambiguous situations well, flexible thinking",
        "low": "Needs clear instructions, uncomfortable with uncertainty, struggles when information is incomplete, prefers explicit guidance"
    },
    "initiative": {
        "high": "Takes initiative, proactive, starts projects without being asked, identifies and addresses problems, self-motivated",
        "low": "Waits to be told what to do, reactive rather than proactive, lacks self-initiative, needs prompting"
    },
    "relationship_building": {
        "high": "Builds strong relationships, maintains professional networks, connects with others easily, fosters positive connections",
        "low": "Struggles to build rapport, distant professionally, has difficulty maintaining relationships"
    },
    "learning_orientation": {
        "high": "Passionate about learning, continuously develops skills, seeks new knowledge, embraces professional development",
        "low": "Satisfied with current knowledge, resists learning new things, no interest in self-improvement"
    },
    "conflict_management": {
        "high": "Addresses conflicts directly, resolves disagreements professionally, handles difficult conversations well, seeks win-win solutions",
        "low": "Avoids conflict, struggles to address issues, allows problems to fester, uncomfortable with confrontation"
    },
    "work_preference_balance": {
        "high": "Values work-life balance, sets boundaries, manages time effectively, maintains well-being",
        "low": "Neglects personal life for work, unable to set boundaries, overworked, poor time management"
    }
}

# Role family dimension weight profiles
ROLE_FAMILY_WEIGHTS = {
    "development": {
        "collaboration": 0.7,
        "independence": 0.85,
        "leadership_readiness": 0.7,
        "adaptability": 1.0,
        "attention_to_detail": 1.0,
        "problem_solving": 1.0,
        "communication": 0.7,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 0.7,
        "ambiguity_tolerance": 0.7,
        "initiative": 0.85,
        "relationship_building": 0.55,
        "learning_orientation": 1.0,
        "conflict_management": 0.55,
        "work_preference_balance": 0.7
    },
    "data": {
        "collaboration": 0.7,
        "independence": 0.85,
        "leadership_readiness": 0.55,
        "adaptability": 1.0,
        "attention_to_detail": 1.0,
        "problem_solving": 1.0,
        "communication": 0.85,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 1.0,
        "ambiguity_tolerance": 0.7,
        "initiative": 0.7,
        "relationship_building": 0.55,
        "learning_orientation": 1.0,
        "conflict_management": 0.55,
        "work_preference_balance": 0.7
    },
    "design": {
        "collaboration": 1.0,
        "independence": 0.7,
        "leadership_readiness": 0.55,
        "adaptability": 1.0,
        "attention_to_detail": 1.0,
        "problem_solving": 0.85,
        "communication": 1.0,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 1.0,
        "ambiguity_tolerance": 1.0,
        "initiative": 0.85,
        "relationship_building": 0.7,
        "learning_orientation": 1.0,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    },
    "security": {
        "collaboration": 0.7,
        "independence": 0.85,
        "leadership_readiness": 0.7,
        "adaptability": 1.0,
        "attention_to_detail": 1.0,
        "problem_solving": 1.0,
        "communication": 0.7,
        "stress_tolerance": 1.0,
        "feedback_receptiveness": 0.85,
        "ambiguity_tolerance": 0.85,
        "initiative": 1.0,
        "relationship_building": 0.55,
        "learning_orientation": 1.0,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    },
    "network": {
        "collaboration": 0.7,
        "independence": 0.7,
        "leadership_readiness": 0.55,
        "adaptability": 0.7,
        "attention_to_detail": 1.0,
        "problem_solving": 0.85,
        "communication": 0.85,
        "stress_tolerance": 1.0,
        "feedback_receptiveness": 0.7,
        "ambiguity_tolerance": 0.55,
        "initiative": 0.7,
        "relationship_building": 0.55,
        "learning_orientation": 0.85,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    },
    "cloud": {
        "collaboration": 0.85,
        "independence": 0.85,
        "leadership_readiness": 0.7,
        "adaptability": 1.0,
        "attention_to_detail": 1.0,
        "problem_solving": 1.0,
        "communication": 0.85,
        "stress_tolerance": 0.85,
        "feedback_receptiveness": 0.85,
        "ambiguity_tolerance": 0.7,
        "initiative": 1.0,
        "relationship_building": 0.55,
        "learning_orientation": 1.0,
        "conflict_management": 0.55,
        "work_preference_balance": 0.7
    },
    "marketing": {
        "collaboration": 1.0,
        "independence": 0.55,
        "leadership_readiness": 0.55,
        "adaptability": 1.0,
        "attention_to_detail": 0.85,
        "problem_solving": 0.7,
        "communication": 1.0,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 1.0,
        "ambiguity_tolerance": 0.7,
        "initiative": 0.85,
        "relationship_building": 1.0,
        "learning_orientation": 0.85,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    },
    "business": {
        "collaboration": 1.0,
        "independence": 0.7,
        "leadership_readiness": 0.7,
        "adaptability": 1.0,
        "attention_to_detail": 0.85,
        "problem_solving": 0.85,
        "communication": 1.0,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 1.0,
        "ambiguity_tolerance": 1.0,
        "initiative": 0.85,
        "relationship_building": 1.0,
        "learning_orientation": 0.85,
        "conflict_management": 0.85,
        "work_preference_balance": 0.7
    },
    "qa": {
        "collaboration": 0.7,
        "independence": 0.7,
        "leadership_readiness": 0.55,
        "adaptability": 0.7,
        "attention_to_detail": 1.0,
        "problem_solving": 0.85,
        "communication": 0.85,
        "stress_tolerance": 0.85,
        "feedback_receptiveness": 1.0,
        "ambiguity_tolerance": 0.55,
        "initiative": 0.7,
        "relationship_building": 0.55,
        "learning_orientation": 0.85,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    },
    "default": {
        "collaboration": 0.7,
        "independence": 0.7,
        "leadership_readiness": 0.7,
        "adaptability": 0.7,
        "attention_to_detail": 0.7,
        "problem_solving": 0.7,
        "communication": 0.7,
        "stress_tolerance": 0.7,
        "feedback_receptiveness": 0.7,
        "ambiguity_tolerance": 0.7,
        "initiative": 0.7,
        "relationship_building": 0.7,
        "learning_orientation": 0.7,
        "conflict_management": 0.7,
        "work_preference_balance": 0.7
    }
}

# Question to dimension mapping (updated for 20 questions)
QUESTION_DIMENSION_MAP = {
    1: "collaboration",      # I work effectively with others
    2: "collaboration",     # I find it difficult to collaborate (reverse)
    3: "independence",      # I can manage my work without supervision
    4: "independence",      # I struggle to stay productive independently (reverse)
    5: "leadership_readiness",  # I am willing to take responsibility
    6: "adaptability",      # I adapt quickly when priorities change
    7: "adaptability",      # I feel uncomfortable with sudden changes (reverse)
    8: "attention_to_detail",  # I carefully review my work
    9: "attention_to_detail",  # I often overlook small details (reverse)
    10: "problem_solving",  # I enjoy solving complex problems
    11: "communication",    # I clearly express my ideas
    12: "communication",    # I find it hard to explain thoughts (reverse)
    13: "stress_tolerance",  # I remain calm under pressure
    14: "stress_tolerance",  # I feel overwhelmed with deadlines (reverse)
    15: "feedback_receptiveness",  # I actively seek feedback
    16: "ambiguity_tolerance",  # I can make decisions with incomplete info
    17: "initiative",       # I take initiative without being told
    18: "relationship_building",  # I build positive relationships
    19: "learning_orientation",  # I continuously look for learning opportunities
    20: "conflict_management",  # I avoid addressing conflicts (reverse)
}

# Reverse coded questions
REVERSE_CODED_QUESTIONS = {2, 4, 7, 9, 12, 14, 20}


@dataclass
class DimensionScore:
    """Score result for a single dimension"""
    dimension: str
    likert_avg: float = 0.0           # 1-5 scale from raw answers
    likert_normalized: float = 0.0    # 0-100 normalized
    embedding_score: float = 0.0      # 0-100 from semantic embedding
    essay_score: float | None = None  # 0-100 from GPT (if available)
    hybrid_score: float = 0.0        # Combined 0-100
    reasoning: str = ""
    raw_answers: List[int] = field(default_factory=list)


@dataclass 
class WorkStyleResult:
    """Complete work style assessment result"""
    overall_alignment_score: float = 0.0
    dimension_scores: List[DimensionScore] = field(default_factory=list)
    matched_role_family: str = "default"
    matched_role_display: str = "General"
    strong_areas: List[str] = field(default_factory=list)
    moderate_areas: List[str] = field(default_factory=list)
    development_areas: List[str] = field(default_factory=list)
    essay_insights: str = ""
    scoring_method: str = "semantic"
    timestamp: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "overall_alignment_score": round(self.overall_alignment_score, 2),
            "dimension_scores": [
                {
                    "dimension": ds.dimension,
                    "likert_score": round(ds.likert_normalized, 2),
                    "embedding_score": round(ds.embedding_score, 2),
                    "essay_score": round(ds.essay_score, 2) if ds.essay_score else None,
                    "hybrid_score": round(ds.hybrid_score, 2),
                    "reasoning": ds.reasoning
                }
                for ds in self.dimension_scores
            ],
            "matched_role_family": self.matched_role_family,
            "matched_role_display_name": self.matched_role_display,
            "strong_areas": self.strong_areas,
            "moderate_areas": self.moderate_areas,
            "development_areas": self.development_areas,
            "essay_insights": self.essay_insights,
            "scoring_method": self.scoring_method,
            "timestamp": self.timestamp
        }


class WorkStyleScorer:
    """
    Semantic Work Style Assessment Scorer
    
    Provides hybrid scoring using:
    - Sentence embeddings for structured Likert responses
    - GPT-4o Mini for essay evaluation
    - Role-based alignment calculation
    """
    
    def __init__(self, 
                 embedding_model: str = EMBEDDING_MODEL,
                 gpt_model: str = DEFAULT_GPT_MODEL,
                 openai_api_key: Optional[str] = None):
        """
        Initialize the scorer
        
        Args:
            embedding_model: Name of sentence-transformer model to use
            gpt_model: GPT model for essay evaluation
            openai_api_key: OpenAI API key (optional, will use env var if not provided)
        """
        self.embedding_model_name = embedding_model
        self.gpt_model = gpt_model
        self._embedding_model = None
        self._dimension_embeddings: Optional[Dict[str, np.ndarray]] = None
        
        # Setup OpenAI if available
        if OPENAI_AVAILABLE:
            if openai_api_key:
                openai.api_key = openai_api_key
            elif os.getenv("OPENAI_API_KEY"):
                openai.api_key = os.getenv("OPENAI_API_KEY")
    
    @property
    def embedding_model(self):
        """Lazy load the embedding model"""
        if self._embedding_model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                self._embedding_model = SentenceTransformer(self.embedding_model_name)
                print(f"Loaded embedding model: {self.embedding_model_name}")
            except Exception as e:
                print(f"Error loading embedding model: {e}")
                self._embedding_model = False  # Mark as failed
        return self._embedding_model if self._embedding_model else False
    
    def _get_dimension_embeddings(self) -> Dict[str, np.ndarray]:
        """Generate and cache dimension reference embeddings"""
        if self._dimension_embeddings is not None:
            return self._dimension_embeddings
            
        if not self.embedding_model:
            return {}
            
        self._dimension_embeddings = {}
        
        for dimension, descriptions in DIMENSION_REFERENCE_DESCRIPTIONS.items():
            # Combine high and low descriptions for better representation
            combined_text = f"{descriptions['high']}. Conversely, {descriptions['low']}"
            embedding = self.embedding_model.encode(combined_text)
            self._dimension_embeddings[dimension] = embedding
            
        return self._dimension_embeddings
    
    def _reverse_code(self, answer: int) -> int:
        """Reverse code a Likert answer"""
        return 6 - answer
    
    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot_product / (norm_a * norm_b))
    
    def _detect_role_family(self, job_title: str) -> Tuple[str, str]:
        """
        Detect role family from job title using keyword matching
        
        Returns:
            Tuple of (role_family_key, display_name)
        """
        title_lower = job_title.lower()
        
        # Define keywords for each role family
        role_keywords = {
            "development": ["developer", "engineer", "programmer", "software", ".net", "python", 
                           "java", "javascript", "web", "ios", "android", "mobile", "full stack",
                           "frontend", "backend", "robotic", "game", "ar", "vr"],
            "data": ["data analyst", "data scientist", "data engineer", "ml", "machine learning",
                    "ai", "artificial intelligence", "big data", "analytics"],
            "design": ["ui", "ux", "designer", "graphic", "interaction", "visual", "product designer"],
            "security": ["security", "cybersecurity", "ethical hacker", "infosec", "penetration", "vulnerability"],
            "network": ["network", "noc", "cisco", "ccna", "network analyst", "network engineer"],
            "cloud": ["cloud", "aws", "azure", "gcp", "devops", "sre", "site reliability", "solutions architect"],
            "marketing": ["marketing", "seo", "content", "copywriter", "digital", "social media", "brand"],
            "business": ["business analyst", "product", "market research", "consultant", "management"],
            "qa": ["qa", "tester", "testing", "sdet", "quality", "test automation", "automation test"]
        }
        
        display_names = {
            "development": "Software Development",
            "data": "Data & AI",
            "design": "Design",
            "security": "Cybersecurity",
            "network": "Network & Infrastructure",
            "cloud": "Cloud & DevOps",
            "marketing": "Marketing & Content",
            "business": "Business & Product",
            "qa": "Quality Assurance"
        }
        
        # Collect all matches with their keyword length (longer = more specific)
        matches = []
        for role_family, keywords in role_keywords.items():
            for keyword in keywords:
                if keyword in title_lower:
                    matches.append((role_family, len(keyword)))
        
        # Sort by keyword length (longest first) to prioritize more specific matches
        matches.sort(key=lambda x: x[1], reverse=True)
        
        # Return the best match if any
        if matches:
            best_role = matches[0][0]
            return best_role, display_names.get(best_role, best_role.title())
        
        return "default", "General"
    
    def _score_likert_with_embeddings(self, answers: List[Dict[str, Any]]) -> Dict[str, DimensionScore]:
        """
        Score Likert answers using semantic embeddings
        
        Args:
            answers: List of {question: int, answer: int} dictionaries
            
        Returns:
            Dictionary mapping dimension to DimensionScore
        """
        dimension_scores: Dict[str, DimensionScore] = {}
        
        # Initialize dimension scores
        for dimension in DIMENSION_REFERENCE_DESCRIPTIONS.keys():
            dimension_scores[dimension] = DimensionScore(dimension=dimension)
        
        # Process answers
        answer_by_dimension: Dict[str, List[int]] = {d: [] for d in dimension_scores}
        
        for answer in answers:
            q_id = answer.get("question", 0)
            ans = answer.get("answer", 3)
            
            # Reverse code if needed
            if q_id in REVERSE_CODED_QUESTIONS:
                ans = self._reverse_code(ans)
            
            dimension = QUESTION_DIMENSION_MAP.get(q_id)
            if dimension and dimension in answer_by_dimension:
                answer_by_dimension[dimension].append(ans)
                dimension_scores[dimension].raw_answers.append(ans)
        
        # Calculate averages and normalized scores
        for dimension, raw_answers in answer_by_dimension.items():
            if raw_answers:
                avg = sum(raw_answers) / len(raw_answers)
                dimension_scores[dimension].likert_avg = avg
                dimension_scores[dimension].likert_normalized = (avg / 5.0) * 100.0
        
        # Calculate embedding-based scores if model available
        if self.embedding_model:
            dimension_embeddings = self._get_dimension_embeddings()
            
            for dimension, dim_score in dimension_scores.items():
                # Generate embedding based on the dimension and the answer
                # We create a synthetic response that represents the answer
                response_intensity = dim_score.likert_normalized / 100.0  # 0 to 1
                
                # Create a text representation of the answer
                if response_intensity >= 0.8:
                    response_text = DIMENSION_REFERENCE_DESCRIPTIONS[dimension]["high"]
                elif response_intensity >= 0.6:
                    response_text = f"{DIMENSION_REFERENCE_DESCRIPTIONS[dimension]['high']} somewhat"
                elif response_intensity >= 0.4:
                    response_text = "Somewhat neutral about this aspect"
                elif response_intensity >= 0.2:
                    response_text = f"{DIMENSION_REFERENCE_DESCRIPTIONS[dimension]['low']} somewhat"
                else:
                    response_text = DIMENSION_REFERENCE_DESCRIPTIONS[dimension]["low"]
                
                try:
                    response_embedding = self.embedding_model.encode(response_text)
                    ref_embedding = dimension_embeddings.get(dimension)
                    
                    if ref_embedding is not None:
                        similarity = self._cosine_similarity(response_embedding, ref_embedding)
                        # Convert similarity (-1 to 1) to score (0 to 100)
                        # We use (similarity + 1) / 2 to normalize to 0-1, then scale
                        dim_score.embedding_score = ((similarity + 1) / 2) * 100.0
                except Exception as e:
                    print(f"Error calculating embedding score for {dimension}: {e}")
                    dim_score.embedding_score = dim_score.likert_normalized
        
        return dimension_scores
    
    def _evaluate_essay_with_gpt(self, essay: str) -> Dict[str, Any]:
        """
        Evaluate essay using GPT-4o Mini
        
        Args:
            essay: Applicant's essay response
            
        Returns:
            Dictionary with dimension scores and insights
        """
        if not essay or not essay.strip():
            return {"error": "No essay provided", "dimension_scores": {}, "insights": ""}
        
        if not OPENAI_AVAILABLE:
            return {
                "error": "OpenAI not available", 
                "dimension_scores": {}, 
                "insights": "Essay provided but GPT evaluation not available"
            }
        
        # Build the prompt
        dimensions_list = ", ".join([d.replace("_", " ") for d in DIMENSION_REFERENCE_DESCRIPTIONS.keys()])
        
        prompt = f"""You are an expert HR analyst evaluating a candidate's work style based on their essay response.

Essay to evaluate:
---
{essay}
---

Evaluate the essay for the following 15 work-style dimensions:
{dimensions_list}

For each dimension, provide:
1. A score from 0-100 based on evidence in the essay
2. Brief reasoning (1-2 sentences) explaining your score

Also provide:
- A narrative summary (2-3 sentences) capturing the key insights about this candidate
- Any additional relevant traits observed

Respond in JSON format:
{{
    "dimension_scores": {{
        "collaboration": {{"score": 0-100, "reasoning": "..."}},
        "independence": {{"score": 0-100, "reasoning": "..."}},
        ... (all 15 dimensions)
    }},
    "insights": "Narrative summary...",
    "additional_traits": ["trait1", "trait2"]
}}

Be objective and base scores only on explicit evidence in the essay."""

        try:
            response = openai.chat.completions.create(
                model=self.gpt_model,
                messages=[
                    {"role": "system", "content": "You are an expert HR analyst specializing in work style assessment."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )
            
            result_text = response.choices[0].message.content
            
            # Parse JSON response
            # Handle potential markdown code blocks
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]
            
            result = json.loads(result_text.strip())
            
            return {
                "dimension_scores": result.get("dimension_scores", {}),
                "insights": result.get("insights", ""),
                "additional_traits": result.get("additional_traits", [])
            }
            
        except json.JSONDecodeError as e:
            return {"error": f"Failed to parse GPT response: {e}", "dimension_scores": {}, "insights": ""}
        except Exception as e:
            return {"error": f"GPT evaluation failed: {e}", "dimension_scores": {}, "insights": ""}
    
    def _combine_hybrid_scores(self, 
                               dimension_scores: Dict[str, DimensionScore],
                               essay_scores: Optional[Dict[str, Any]] = None) -> Dict[str, DimensionScore]:
        """
        Combine Likert embedding scores with essay GPT scores
        
        Args:
            dimension_scores: Scores from Likert responses
            essay_scores: Optional scores from essay evaluation
            
        Returns:
            Updated dimension scores with hybrid scores
        """
        for dimension, dim_score in dimension_scores.items():
            # Start with embedding score (or fallback to likert normalized)
            base_score = dim_score.embedding_score if dim_score.embedding_score > 0 else dim_score.likert_normalized
            
            # If essay scores available, incorporate them
            if essay_scores and "dimension_scores" in essay_scores:
                essay_dim = essay_scores["dimension_scores"].get(dimension)
                if essay_dim and isinstance(essay_dim, dict):
                    gpt_score = essay_dim.get("score")
                    if gpt_score is not None:
                        dim_score.essay_score = float(gpt_score)
                        # Combine: 60% embedding/likert, 40% essay
                        dim_score.hybrid_score = (base_score * 0.6) + (float(gpt_score) * 0.4)
                        dim_score.reasoning = essay_dim.get("reasoning", "")
                    else:
                        dim_score.hybrid_score = base_score
                else:
                    dim_score.hybrid_score = base_score
            else:
                dim_score.hybrid_score = base_score
        
        return dimension_scores
    
    def _calculate_alignment_score(self,
                                   dimension_scores: Dict[str, DimensionScore],
                                   role_family: str) -> float:
        """
        Calculate overall alignment score based on role family weights
        
        Args:
            dimension_scores: Scored dimensions
            role_family: Detected role family
            
        Returns:
            Overall alignment score 0-100
        """
        weights = ROLE_FAMILY_WEIGHTS.get(role_family, ROLE_FAMILY_WEIGHTS["default"])
        
        weighted_sum = 0.0
        total_weight = 0.0
        
        for dimension, dim_score in dimension_scores.items():
            weight = weights.get(dimension, 0.7)
            weighted_sum += dim_score.hybrid_score * weight
            total_weight += weight
        
        if total_weight > 0:
            return weighted_sum / total_weight
        return 0.0
    
    def _categorize_areas(self, dimension_scores: Dict[str, DimensionScore]) -> Tuple[List[str], List[str], List[str]]:
        """Categorize dimensions into strong, moderate, and development areas"""
        sorted_dims = sorted(
            dimension_scores.items(),
            key=lambda x: x[1].hybrid_score,
            reverse=True
        )
        
        strong = []
        moderate = []
        development = []
        
        for dimension, dim_score in sorted_dims:
            score = dim_score.hybrid_score
            if score >= 70:
                strong.append(dimension)
            elif score >= 50:
                moderate.append(dimension)
            else:
                development.append(dimension)
        
        return strong, moderate, development
    
    def score_assessment(self,
                        answers: List[Dict[str, Any]],
                        essay: Optional[str] = None,
                        job_title: str = "Software Developer") -> WorkStyleResult:
        """
        Main scoring function
        
        Args:
            answers: List of {question: int, answer: int} for 20 Likert questions
            essay: Optional essay response for question 21
            job_title: Job title for role family detection
            
        Returns:
            WorkStyleResult with all scores and insights
        """
        result = WorkStyleResult()
        result.timestamp = datetime.now().isoformat()
        
        # Detect role family
        role_family, role_display = self._detect_role_family(job_title)
        result.matched_role_family = role_family
        result.matched_role_display = role_display
        
        # Score Likert responses with embeddings
        dimension_scores = self._score_likert_with_embeddings(answers)
        
        # Evaluate essay with GPT if provided
        essay_results = None
        if essay and essay.strip():
            essay_results = self._evaluate_essay_with_gpt(essay)
            if "insights" in essay_results:
                result.essay_insights = essay_results["insights"]
        
        # Combine hybrid scores
        dimension_scores = self._combine_hybrid_scores(dimension_scores, essay_results)
        
        # Calculate alignment score
        result.overall_alignment_score = self._calculate_alignment_score(dimension_scores, role_family)
        
        # Categorize areas
        strong, moderate, development = self._categorize_areas(dimension_scores)
        result.strong_areas = strong
        result.moderate_areas = moderate
        result.development_areas = development
        
        # Set dimension scores
        result.dimension_scores = list(dimension_scores.values())
        
        # Set scoring method
        if essay_results and "error" not in essay_results:
            result.scoring_method = "hybrid"
        else:
            result.scoring_method = "semantic"
        
        return result


# Convenience function for direct use
def score_work_style(answers: List[Dict[str, Any]], 
                    essay: Optional[str] = None,
                    job_title: str = "Software Developer") -> Dict[str, Any]:
    """
    Convenience function to score work style assessment
    
    Args:
        answers: List of {question: int, answer: int}
        essay: Optional essay text
        job_title: Job title for role matching
        
    Returns:
        Dictionary with scoring results
    """
    scorer = WorkStyleScorer()
    result = scorer.score_assessment(answers, essay, job_title)
    return result.to_dict()


if __name__ == "__main__":
    import argparse
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Score work style assessments from Supabase"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Re-score ALL submitted/completed assessments, not just unscored ones"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run scoring but do not write results back to Supabase"
    )
    parser.add_argument(
        "--applicant-id",
        help="Score a single applicant by their UUID"
    )
    args = parser.parse_args()

    # ── Supabase client ──────────────────────────────────────────────────────
    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase-py not installed. Run: pip install supabase")
        sys.exit(1)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    db = create_client(url, key)

    # ── Fetch assessments ────────────────────────────────────────────────────
    query = (
        db.table("work_style_assessments")
        .select("id, applicant_id, answers, essay, status, semantic_score")
        .in_("status", ["submitted", "completed"])
    )

    if args.applicant_id:
        query = query.eq("applicant_id", args.applicant_id)
    elif not args.all:
        # Default: only rows where semantic_score is null
        query = query.is_("semantic_score", "null")

    response = query.execute()
    assessments = response.data or []

    if not assessments:
        print("No assessments to score.")
        sys.exit(0)

    print(f"Found {len(assessments)} assessment(s) to score.\n")

    # ── Fetch applicant positions for role detection ─────────────────────────
    applicant_ids = list({a["applicant_id"] for a in assessments})
    pos_resp = (
        db.table("applicants")
        .select("id, position")
        .in_("id", applicant_ids)
        .execute()
    )
    position_map: Dict[str, str] = {
        r["id"]: r.get("position", "Software Developer")
        for r in (pos_resp.data or [])
    }

    # ── Score each assessment ────────────────────────────────────────────────
    scorer = WorkStyleScorer()
    success = 0
    failed = 0

    for assessment in assessments:
        aid = assessment["id"]
        applicant_id = assessment["applicant_id"]
        answers = assessment.get("answers") or []
        essay = assessment.get("essay") or ""
        job_title = position_map.get(applicant_id, "Software Developer")

        if not answers:
            print(f"  [SKIP] {aid} — no answers recorded")
            failed += 1
            continue

        try:
            result = scorer.score_assessment(answers, essay or None, job_title)
            data = result.to_dict()

            print(
                f"  [OK]   {aid} | {job_title[:30]:<30} | "
                f"score={data['overall_alignment_score']:.1f} | "
                f"method={data['scoring_method']}"
            )

            if not args.dry_run:
                db.table("work_style_assessments").update({
                    "semantic_score": data["overall_alignment_score"],
                    "dimension_scores": data["dimension_scores"],
                    "role_family": data["matched_role_family"],
                    "strong_areas": data["strong_areas"],
                    "moderate_areas": data["moderate_areas"],
                    "development_areas": data["development_areas"],
                    "essay_insights": data.get("essay_insights", ""),
                    "scoring_method": data["scoring_method"],
                    "scored_at": datetime.now().isoformat(),
                    "status": "completed",
                }).eq("id", aid).execute()

            success += 1

        except Exception as e:
            print(f"  [FAIL] {aid} — {e}")
            failed += 1

    print(f"\nDone. {success} scored, {failed} failed/skipped.")
    if args.dry_run:
        print("(dry-run mode — no changes written to Supabase)")
