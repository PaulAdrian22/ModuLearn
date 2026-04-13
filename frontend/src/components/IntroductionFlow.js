import React, { useState } from 'react';

const IntroductionFlow = ({ onComplete, isNewUser = false }) => {
  const [step, setStep] = useState(1);

  const normalizeLanguageChoice = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'english') return 'English';
    if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

    return 'English';
  };

  // Hide body scrollbar when component mounts
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleLanguageSelect = (selectedLanguage) => {
    const normalizedLanguage = normalizeLanguageChoice(selectedLanguage);
    localStorage.setItem('preferredLanguage', normalizedLanguage);
    localStorage.setItem('hasSeenIntroduction', 'true');
    onComplete(normalizedLanguage);
  };

  const handleSkip = () => {
    const savedLanguage = normalizeLanguageChoice(localStorage.getItem('preferredLanguage') || 'English');
    onComplete(savedLanguage);
  };

  const handleNext = () => {
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-sm overflow-y-auto no-scrollbar p-3 sm:p-6 lg:p-8 flex items-center justify-center">
      <div className="w-full max-w-7xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-[#1e5a8e] text-white py-5 px-7 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h1 className="text-3xl font-bold">Personalize your Learning Path</h1>
            </div>
            {!isNewUser && (
              <button
                onClick={handleSkip}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all hover:scale-105 font-semibold flex items-center gap-2"
              >
                <span>Skip</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content Container */}
        <div className="px-6 sm:px-10 lg:px-12 py-8 lg:py-10 bg-gradient-to-br from-gray-100 to-gray-200">
        {step === 1 ? (
          /* Step 1: Welcome and Introduction */
          <div className="bg-white rounded-2xl shadow-2xl w-full p-10 lg:p-12 relative min-h-[420px]">
            <div className="text-center space-y-6 mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-800 leading-relaxed">
                Welcome to <span className="text-[#1e5a8e] font-extrabold">ModuLearn</span>! As a our new learner, we would like to know more about you. You will be taking an assessment for us to measure your current knowledge about <span className="font-semibold">Computer Hardware Serving</span>
              </h2>
              
              <p className="text-2xl text-gray-700 leading-relaxed pt-3">
                Maligayang pagsali sa ModuLearn! Bilang aming bagong mag-aaral, nais naming makilala ka nang mas mabuti. Sa pamamagitan ng isang pagsusuri, susuaktin namin ang iyong kasalukuyang kaalaman tungkol sa Computer Hardware Servicing.
              </p>
            </div>

            {/* Next Button */}
            <button
              onClick={handleNext}
              className="absolute bottom-8 right-8 w-16 h-16 bg-[#2BC4B3] hover:bg-[#1a9d8f] rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
            >
              <svg className="w-8 h-8 text-[#1e5a8e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          /* Step 2: Language Selection */
          <div className="bg-white rounded-2xl shadow-2xl w-full p-10 lg:p-12 relative min-h-[420px]">
            <div className="text-center space-y-6 mb-16">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-800 leading-relaxed">
                Before we start, we would like to know what language you prefer to continue with the assessment?
              </h2>
              
              <p className="text-2xl text-gray-700 leading-relaxed">
                Bago tayo magsimula, nais namin malaman kung anong lingwahe ang iyong nais gamitin para sa pagsusuri?
              </p>

              {/* Language Buttons */}
              <div className="flex justify-center gap-8 mt-12 pt-6">
                <button
                  onClick={() => handleLanguageSelect('Taglish')}
                  className="px-16 py-5 bg-[#2BC4B3] hover:bg-[#1a9d8f] text-[#1e5a8e] rounded-full text-3xl font-bold shadow-xl transition-all hover:scale-105"
                >
                  Taglish
                </button>
                
                <button
                  onClick={() => handleLanguageSelect('English')}
                  className="px-16 py-5 bg-[#2BC4B3] hover:bg-[#1a9d8f] text-[#1e5a8e] rounded-full text-3xl font-bold shadow-xl transition-all hover:scale-105"
                >
                  English
                </button>
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={handleBack}
              className="absolute bottom-8 left-8 w-16 h-16 bg-[#2BC4B3] hover:bg-[#1a9d8f] rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
            >
              <svg className="w-8 h-8 text-[#1e5a8e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default IntroductionFlow;
