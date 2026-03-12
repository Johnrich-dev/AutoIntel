import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseAdminClient } from '../lib/supabase';
import {
  WORK_STYLE_QUESTIONS,
  SCALE_LABELS,
  WorkStyleAnswer
} from '../config/workStyleConfig';

interface PersonalityTestProps {
  onComplete: () => void;
  onBack: () => void;
}

export function PersonalityTest({ onComplete, onBack }: PersonalityTestProps) {
  const { applicant, accessToken } = useAuth();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const questions = WORK_STYLE_QUESTIONS;

  const handleAnswer = (value: number) => {
    setAnswers({ ...answers, [currentQuestion]: value });
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    if (!applicant || Object.keys(answers).length !== questions.length) {
      alert('Please answer all questions before submitting.');
      return;
    }

    setSubmitting(true);

    try {
      // Use admin client to bypass RLS for database operations
      const client = getSupabaseAdminClient();
      
      // Format answers for database storage
      const formattedAnswers: WorkStyleAnswer[] = Object.entries(answers).map(([question, answer]) => ({
        question: parseInt(question) + 1,
        answer,
      }));

      // Check if test already exists in either table
      // First check new work_style_assessments table
      const { data: newTest } = await client
        .from('work_style_assessments')
        .select('*')
        .eq('applicant_id', applicant.id)
        .maybeSingle();

      if (newTest) {
        // Update existing in new table
        await client
          .from('work_style_assessments')
          .update({
            answers: formattedAnswers,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', newTest.id);
      } else {
        // Check old personality_tests table for existing data
        const { data: oldTest } = await client
          .from('personality_tests')
          .select('*')
          .eq('applicant_id', applicant.id)
          .maybeSingle();

        if (oldTest) {
          // Update old table
          await client
            .from('personality_tests')
            .update({
              answers: formattedAnswers,
              status: 'submitted',
              submitted_at: new Date().toISOString(),
            })
            .eq('id', oldTest.id);
        } else {
          // Insert into new table
          await client.from('work_style_assessments').insert({
            applicant_id: applicant.id,
            answers: formattedAnswers,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          });
        }
      }

      alert('Your assessment has been submitted successfully!');
      onComplete();
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('Failed to submit test. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((Object.keys(answers).length / questions.length) * 100).toFixed(0);
  const isLastQuestion = currentQuestion === questions.length - 1;
  const allAnswered = Object.keys(answers).length === questions.length;

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
            <p className="text-blue-100 mt-1">15 questions about your work style and preferences</p>

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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-amber-900 text-sm">
                <strong>Instructions:</strong> Please answer honestly based on how you usually behave in academic, internship, or work-related situations. There are no right or wrong answers.
              </p>
            </div>

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

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={handlePrevious}
                disabled={currentQuestion === 0}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>

              <div className="flex gap-1">
                {questions.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full ${
                      answers[index] !== undefined
                        ? 'bg-blue-600'
                        : index === currentQuestion
                        ? 'bg-blue-300'
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>

              {isLastQuestion && allAnswered ? (
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Assessment'}
                  </button>
                  <p className="text-xs text-gray-500">
                    Your responses will be reviewed together with other application components.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={currentQuestion === questions.length - 1}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
