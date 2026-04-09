import { useState } from 'react';
import { ArrowLeft, ArrowRight, Send, User, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseAdminClient } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
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
  const [modal, setModal] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setModal({ type: 'error', message: 'Applicant information not found. Please log in again.' });
      return;
    }

    if (Object.keys(answers).length !== questions.length) {
      setModal({ type: 'error', message: 'Please answer all questions before submitting.' });
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
          // Get the job title from applicant data
          const applicantJobTitle = applicant.position || '';

          const scoringResponse = await fetch(`${API_BASE}/api/workstyle/score`, {
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
            
            if (scoringResult.status === 'success') {
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
                  status: 'completed',
                })
                .eq('id', assessmentId);

              console.log('Scoring completed:', scoringResult);
            } else {
              console.error('Scoring API returned error:', scoringResult.error);
            }
          } else {
            const errorText = await scoringResponse.text();
            console.error('Scoring API error:', errorText);
          }
        } catch (scoringError) {
          console.error('Error calling scoring API:', scoringError);
          // Continue even if scoring fails - the raw answers are saved
        }
      }

      setModal({ type: 'success', message: 'Your assessment has been submitted successfully!' });
    } catch (error) {
      console.error('Error submitting test:', error);
      setModal({ type: 'error', message: 'Failed to submit assessment. Please try again.' });
    } finally {
      setSubmitting(false);
      setScoringInProgress(false);
    }
  };

  const progress = (Object.keys(answers).length / totalQuestions * 100).toFixed(0);
  const likertAllAnswered = Object.keys(answers).length === questions.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Back to Dashboard Link */}
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            {/* User Profile Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                {applicant?.photo_url ? (
                  <img src={applicant.photo_url} alt={applicant?.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Work Style Assessment</h1>
          <p className="text-gray-500 mt-1">
            {isEssayQuestion 
              ? 'Final Question: Share your experience' 
              : `${questions.length} Likert scale questions and one short essay to help evaluate your work preferences, behaviors, and role alignment.`}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">Progress</span>
            <span className="text-sm font-semibold text-gray-800">{progress}% Complete</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                backgroundColor: progress === '100' ? '#98D8AA' : '#B4D3D9'
              }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-3">
            {Object.keys(answers).length} of {totalQuestions} completed
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Instructions Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#BDA6CE' }}>
                  <ClipboardList className="w-4 h-4 text-gray-700" />
                </div>
                <h2 className="text-lg font-bold text-gray-800">Instructions</h2>
              </div>
              
              {!isEssayQuestion ? (
                <div className="text-gray-600 text-sm space-y-3">
                  <p>Please answer honestly based on how you typically behave in academic, internship, or work-related situations.</p>
                  <p>For each statement, select the option that best reflects your level of agreement.</p>
                  <p className="text-gray-400 italic">There are no right or wrong answers.</p>
                </div>
              ) : (
                <div className="text-gray-600 text-sm space-y-3">
                  <p>Now you'll answer a short essay question to further describe your work approach.</p>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
                    <p className="text-blue-800 text-sm">
                      <strong>Tips:</strong> Provide specific examples from your experience. Describe the situation, your actions, the outcome, and what you learned.
                    </p>
                  </div>
                </div>
              )}

              {/* Question Navigator */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-600 mb-3">Questions</h3>
                <div className="flex flex-wrap gap-2">
                  {questions.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestion(idx)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        idx === currentQuestion
                          ? 'bg-blue-600 text-white'
                          : answers[idx] !== undefined
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={`Question ${idx + 1}`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                  {/* Essay button */}
                  <button
                    onClick={() => setCurrentQuestion(questions.length)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      currentQuestion === questions.length
                        ? 'bg-blue-600 text-white'
                        : essay.trim()
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Essay Question"
                  >
                    <span className="text-lg leading-none">📝</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Question Content */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              {/* Question number */}
              <div className="text-sm text-gray-500 mb-2">
                {isEssayQuestion ? 'Final Question' : `Question ${currentQuestion + 1} of ${questions.length}`}
              </div>

              {!isEssayQuestion ? (
                /* Likert Scale Questions */
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">
                    {questions[currentQuestion].text}
                  </h2>
                  
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() => handleAnswer(value)}
                        className={`w-full p-4 text-left border-2 rounded-xl transition-all duration-200 ${
                          answers[currentQuestion] === value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white hover:scale-[1.01]'
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
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    {ESSAY_QUESTION.text}
                  </h2>
                  
                  <textarea
                    value={essay}
                    onChange={(e) => setEssay(e.target.value)}
                    placeholder="Share a specific situation where you faced a challenge or conflict at work or school. Explain how you handled it and what you learned..."
                    className="w-full h-64 p-4 border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:outline-none resize-none text-gray-700"
                    maxLength={2000}
                  />
                  
                  <div className="mt-3 text-sm text-gray-500 text-right">
                    {essay.length}/2000 characters
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <button
                  onClick={handlePrevious}
                  disabled={currentQuestion === 0}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                    currentQuestion === 0
                      ? 'text-gray-300 cursor-not-allowed'
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
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
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
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
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
            </div>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {modal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              modal.type === 'success' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {modal.type === 'success' ? (
                <Send className="w-8 h-8 text-green-600" />
              ) : (
                <ArrowLeft className="w-8 h-8 text-red-600" />
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {modal.type === 'success' ? 'Assessment Submitted!' : 'Something went wrong'}
            </h2>
            <p className="text-gray-500 text-sm mb-6">{modal.message}</p>
            <button
              onClick={() => {
                if (modal.type === 'success') {
                  setModal(null);
                  onComplete();
                } else {
                  setModal(null);
                }
              }}
              className={`w-full font-semibold py-3 rounded-lg transition-colors ${
                modal.type === 'success'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {modal.type === 'success' ? 'Back to Dashboard' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
