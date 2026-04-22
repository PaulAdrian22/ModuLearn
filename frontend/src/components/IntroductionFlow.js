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
    <div className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-sm overflow-y-auto no-scrollbar p-3 sm:p-6 lg:p-8 flex items-center justify-center">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#c7deee]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#215a86] via-[#2b6a98] to-[#3383b7] text-white py-5 px-7 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h1 className="text-2xl sm:text-3xl font-bold">Personalize your Learning Path</h1>
            </div>
            {!isNewUser && (
              <button
                onClick={handleSkip}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all hover:scale-105 font-semibold flex items-center gap-2"
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
        <div className="px-5 sm:px-8 lg:px-10 py-7 lg:py-9 bg-gradient-to-br from-[#edf8ff] via-[#e6f5ff] to-[#e3f7f2]">
        {step === 1 ? (
          /* Step 1: Welcome and Introduction */
          <div className="bg-white rounded-2xl shadow-xl w-full p-6 sm:p-8 lg:p-10 min-h-[430px] flex flex-col">
            <div className="text-center space-y-5 sm:space-y-6 flex-1">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#214f74] leading-snug break-words">
                Welcome to <span className="text-[#2f77ad] font-extrabold">ModuLearn</span>. As our new learner, we would like to know more about you. You will take an assessment so we can measure your current knowledge of <span className="font-semibold">Computer Hardware Servicing</span>.
              </h2>
              
              <p className="text-lg sm:text-xl text-[#31566f] leading-relaxed pt-2 break-words">
                Maligayang pagsali sa ModuLearn! Bilang aming bagong mag-aaral, nais naming makilala ka nang mas mabuti. Sa pamamagitan ng isang pagsusuri, susuaktin namin ang iyong kasalukuyang kaalaman tungkol sa Computer Hardware Servicing.
              </p>
            </div>

            <div className="pt-6 flex justify-end">
              <button
                onClick={handleNext}
                className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-[#2FCAB8] hover:bg-[#21b8a7] rounded-full shadow-xl transition-all hover:scale-110"
                aria-label="Next"
                title="Next"
              >
                <svg className="w-7 h-7 text-[#20557e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Language Selection */
          <div className="bg-white rounded-2xl shadow-xl w-full p-6 sm:p-8 lg:p-10 min-h-[430px] flex flex-col">
            <div className="text-center space-y-5 sm:space-y-6 flex-1">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#214f74] leading-snug break-words">
                Before we start, we would like to know what language you prefer to continue with the assessment?
              </h2>
              
              <p className="text-lg sm:text-xl text-[#31566f] leading-relaxed break-words">
                Bago tayo magsimula, nais namin malaman kung anong lingwahe ang iyong nais gamitin para sa pagsusuri?
              </p>

              {/* Language Buttons */}
              <div className="flex justify-center flex-wrap gap-4 sm:gap-6 mt-8 sm:mt-10 pt-2">
                <button
                  onClick={() => handleLanguageSelect('Taglish')}
                  className="px-8 sm:px-12 py-3.5 sm:py-4 bg-[#2FCAB8] hover:bg-[#21b8a7] text-[#1e4f74] rounded-full text-xl sm:text-2xl font-bold shadow-xl transition-all hover:scale-105"
                >
                  Taglish
                </button>
                
                <button
                  onClick={() => handleLanguageSelect('English')}
                  className="px-8 sm:px-12 py-3.5 sm:py-4 bg-[#2FCAB8] hover:bg-[#21b8a7] text-[#1e4f74] rounded-full text-xl sm:text-2xl font-bold shadow-xl transition-all hover:scale-105"
                >
                  English
                </button>
              </div>
            </div>

            <div className="pt-6 flex justify-start">
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#c7deee] bg-[#f3faff] text-[#25577f] font-semibold hover:bg-[#e9f6ff] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default IntroductionFlow;
