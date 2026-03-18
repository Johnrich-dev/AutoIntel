import { useState } from 'react';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseAdminClient } from '../lib/supabase';
import {
  WORK_STYLE_QUESTIONS,
  ESSAY_QUESTION,
  SCALE_LABELS,
  WorkStyleAnswer,
  EssayAnswer
} from '../config/workStyleConfig';

interface PersonalityTestProps {
  onComplete: () => void;
  onBack: () => void;
}

export function PersonalityTest({ onComplete, onBack }: PersonalityTestProps) {
  const { applicant, accessToken } = useAuth();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [essay, setEssay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scoringInProgress, setScoringInProgress] = useState(false);

  const questions = WORK_STYLE_QUESTIONS;
  const totalQuestions = questions.length + 1; // +1 for essay
  const isEssayQuestion = currentQuestion === questions.length;

  const handleAnswer = (value: number) => {
    setAnswers({ ...answers, [currentQuestion]: value });
  };

  const handleNext = () => {
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    if (!applicant) {
      alert('Applicant information not found. Please log in again.');
      return;
    }

    // Check all Likert questions are answered
    if (Object.keys(answers).length !== questions.length) {
      alert('Please answer all questions before submitting.');
      return;
    }

    setSubmitting(true);
    setScoringInProgress(true);

    try {
      const client = getSupabaseAdminClient();
      
      // Format Likert answers for database storage
      const formattedAnswers: WorkStyleAnswer[] = Object.entries(answers).map(([question, answer]) => ({
        question: parseInt(question) + 1,
        answer,
      }));

      // Prepare essay answer if provided
      let essayAnswer: EssayAnswer | undefined;
      if (essay.trim()) {
        essayAnswer = {
          question: ESSAY_QUESTION.id,
          essay: essay.trim()
        };
      }

      // Get job title from applicant (if available)
      // We'll use a default for now - in production this would come from the applicant's job application
      const jobTitle = "Software Developer"; // This would be dynamic in production

      // First, save the raw answers to the database
      const { data: existingTest } = await client
        .from('work_style_assessments')
        .select('*')
        .eq('applicant_id', applicant.id)
        .maybeSingle();

      let assessmentId: string;
      
      if (existingTest) {
        // Update existing assessment
        const { data: updateData, error: updateError } = await client
          .from('work_style_assessments')
          .update({
            answers: formattedAnswers,
            essay: essayAnswer ? essayAnswer.essay : null,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', existingTest.id)
          .select()
          .single();

        if (updateError) throw updateError;
        assessmentId = updateData.id;
      } else {
        // Insert new assessment
        const { data: insertData, error: insertError } = await client
          .from('work_style_assessments')
          .insert({
            applicant_id: applicant.id,
            answers: formattedAnswers,
            essay: essayAnswer ? essayAnswer.essay : null,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;
        assessmentId = insertData.id;
      }

      // Now call the scoring API if we have an access token
      if (accessToken && (formattedAnswers.length > 0 || essay.trim())) {
        try {
          // Get the job title from applicant data or use default
          const applicantJobTitle = "Software Developer"; // This would come from applicant data

          const scoringResponse = await fetch('http://localhost:5000/api/workstyle/score', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              answers: formattedAnswers,
              essay: essay.trim() || null,
              job_title: applicantJobTitle,
              use_gpt: !!essay.trim()
            })
          });

          if (scoringResponse.ok) {
            const scoringResult = await scoringResponse.json();
            
            // Update the assessment with scoring results
            await client
              .from('work_style_assessments')
              .update({
                semantic_score: scoringResult.overall_alignment_score,
                dimension_scores: scoringResult.dimension_scores,
                role_family: scoringResult.matched_role_family,
                strong_areas: scoringResult.strong_areas,
                moderate_areas: scoringResult.moderate_areas,
                development_areas: scoringResult.development_areas,
                essay_insights: scoringResult.essay_insights,
                scoring_method: scoringResult.scoring_method,
                scored_at: new Date().toISOString(),
              })
              .eq('id', assessmentId);

            console.log('Scoring completed:', scoringResult);
          } else {
            console.error('Scoring API error:', await scoringResponse.text());
          }
        } catch (scoringError) {
          console.error('Error calling scoring API:', scoringError);
          // Continue even if scoring fails - the raw answers are saved
        }
      }

      alert('Your assessment has been submitted successfully!');
      onComplete();
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('Failed to submit test. Please try again.');
    } finally {
      setSubmitting(false);
      setScoringInProgress(false);
    }
  };

  const progress = (Object.keys(answers).length / totalQuestions * 100).toFixed(0);
  const likertAllAnswered = Object.keys(answers).length === questions.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold">Work Style Assessment</h1>
            <p className="text-blue-100 mt-1">
              {isEssayQuestion 
                ? 'Final Question: Share your experience' 
                : `${questions.length} questions about your work style and preferences`}
            </p>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{progress}% Complete</span>
              </div>
              <div className="w-full bg-blue-800 rounded-full h-2">
                <div
                  className="bg-white rounded-full h-2 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Instructions */}
            {!isEssayQuestion && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-amber-900 text-sm">
                  <strong>Instructions:</strong> Please answer honestly based on how you usually behave in academic, internship, or work-related situations. There are no right or wrong answers.
                </p>
              </div>
            )}

            {!isEssayQuestion ? (
              /* Likert Scale Questions */
              <div className="mb-8">
                <div className="text-sm text-gray-500 mb-2">
                  Question {currentQuestion + 1} of {questions.length}
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">
                  {questions[currentQuestion].text}
                </h2>
                
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      onClick={() => handleAnswer(value)}
                      className={`w-full p-4 text-left border-2 rounded-lg transition-all ${
                        answers[currentQuestion] === value
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            answers[currentQuestion] === value
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {answers[currentQuestion] === value && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span className={`font-medium ${
                          answers[currentQuestion] === value ? 'text-blue-900' : 'text-gray-700'
                        }`}>
                          {SCALE_LABELS[value - 1]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Essay Question */
              <div className="mb-8">
                <div className="text-sm text-gray-500 mb-2">
                  Final Question - Essay Response
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {ESSAY_QUESTION.text}
                </h2>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-900 text-sm">
                    <strong>Tips:</strong> Provide specific examples from your experience. Describe the situation, your actions, the outcome, and what you learned. This helps us understand how you apply your skills in real-world scenarios.
                  </p>
                </div>

                <textarea
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  placeholder="Share a specific situation where you faced a challenge or conflict at work or school. Explain how you handled it and what you learned..."
                  className="w-full h-64 p-4 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none resize-none text-gray-700"
                  maxLength={2000}
                />
                
                <div className="mt-2 text-sm text-gray-500 text-right">
                  {essay.length}/2000 characters
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={handlePrevious}
                disabled={currentQuestion === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  currentQuestion === 0
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <ArrowLeft className="w-5 h-5" />
                Previous
              </button>

              {isEssayQuestion ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !likertAllAnswered}
                  className={`flex items-center gap-2 px-8 py-3 rounded-lg font-medium transition-colors ${
                    submitting || !likertAllAnswered
                      ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {scoringInProgress ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit Assessment
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={answers[currentQuestion] === undefined}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                    answers[currentQuestion] === undefined
                      ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Next
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Question navigation dots */}
            {!isEssayQuestion && (
              <div className="mt-8 flex flex-wrap gap-2 justify-center">
                {questions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentQuestion(idx)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      idx === currentQuestion
                        ? 'bg-blue-600'
                        : answers[idx] !== undefined
                        ? 'bg-green-500'
                        : 'bg-gray-300'
                    }`}
                    title={`Question ${idx + 1}`}
                  />
                ))}
                {/* Essay dot */}
                <button
                  onClick={() => setCurrentQuestion(questions.length)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    currentQuestion === questions.length
                      ? 'bg-blue-600'
                      : essay.trim()
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                  title="Essay Question"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
