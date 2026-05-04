import React, { useState } from 'react';
import { profileApi } from '../services/api';

const WelcomeModal = ({ userName, onComplete }) => {
  const [step, setStep] = useState(1);
  const modalScale = 'min(1, calc((100dvh - 40px) / 900))';
  const [formData, setFormData] = useState({
    age: '',
    educationalBackground: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleContinue = () => {
    if (step === 1) {
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.age || !formData.educationalBackground) {
      setError('Please fill in all fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await profileApi.update({
        name: userName,
        age: parseInt(formData.age),
        educational_background: formData.educationalBackground,
      });

      onComplete();
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to save your information');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 animate-fade-in" style={{ transform: `scale(${modalScale})`, transformOrigin: 'center center' }}>
        {step === 1 ? (
          <div className="text-center">
            {/* Welcome Message */}
            <div className="mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-highlight rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </div>
              
              <h2 className="text-3xl font-bold text-primary mb-2">
                Welcome to MODULEARN, {userName}! 🎉
              </h2>
              
              <p className="text-lg text-text-secondary mb-6">
                We're excited to have you here! MODULEARN is your personalized learning companion for Computer Hardware Servicing.
              </p>
            </div>

            {/* What to Expect */}
            <div className="bg-surface rounded-xl p-6 mb-6 text-left">
              <h3 className="text-xl font-bold text-primary mb-4">What You'll Learn:</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-highlight rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-text-primary">Interactive lessons tailored to your knowledge level</p>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-highlight rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-text-primary">Hands-on assessments and quizzes to test your skills</p>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-highlight rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-text-primary">Progress tracking with AI-powered recommendations</p>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-highlight rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-text-primary">TESDA-aligned curriculum for real-world skills</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="btn btn-primary w-full py-4 text-lg"
            >
              Get Started →
            </button>
          </div>
        ) : (
          <div>
            {/* Educational Background Form */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-primary mb-2">Tell us about yourself</h2>
              <p className="text-text-secondary">
                This helps us personalize your learning experience.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  How old are you?
                </label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  min="1"
                  max="120"
                  className="input"
                  placeholder="Enter your age"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  What's your educational background?
                </label>
                <select
                  name="educationalBackground"
                  value={formData.educationalBackground}
                  onChange={handleChange}
                  className="input"
                  required
                >
                  <option value="">Select your educational level</option>
                  <option value="Elementary">Elementary Graduate</option>
                  <option value="High School">High School Graduate</option>
                  <option value="Senior High School">Senior High School Graduate</option>
                  <option value="College">College Student/Graduate</option>
                  <option value="Vocational">Vocational/Technical Graduate</option>
                </select>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg bg-error/20 border border-error text-error">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn btn-outline flex-1"
                  disabled={saving}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Complete Setup'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeModal;
