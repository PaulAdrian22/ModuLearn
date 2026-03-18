import React from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div
      className="fixed inset-0 overflow-hidden flex items-center justify-center"
      style={{
        backgroundImage: 'url(/images/background.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div
        className="relative z-10 w-full max-w-[1288px] bg-[#f3f3f3] rounded-xl shadow-[0_18px_40px_rgba(11,43,76,0.18)] px-6 sm:px-10 pt-6 sm:pt-7 pb-6"
        style={{
          height: 'min(94dvh, 725px)'
        }}
      >
        <header className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <img src="/images/logo.png" alt="ModuLearn Logo" className="h-16 sm:h-[88px] w-auto object-contain" draggable={false} />
            <h1 className="text-3xl sm:text-5xl font-bold text-[#0F4A8A] leading-none">ModuLearn</h1>
          </div>

          <nav className="flex items-center text-[#0F4A8A] text-xl sm:text-3xl font-medium">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-2 transition-colors hover:text-[#2BC4B3]"
            >
              Login
            </button>
            <span className="mx-2 sm:mx-3 text-[#2BC4B3]">|</span>
            <button
              type="button"
              onClick={() => navigate('/about')}
              className="px-2 transition-colors hover:text-[#2BC4B3]"
            >
              About
            </button>
          </nav>
        </header>

        <section className="px-0">
          <h2 className="text-3xl sm:text-5xl font-bold text-[#0F4A8A] mb-3 sm:mb-4">Welcome!</h2>
          <p className="text-xl sm:text-[20px] leading-[1.42] text-[#3B425C] w-full">
            ModuLearn is a free platform that offers educational resource and simulations about Computer Hardware Servicing! Personalize your progression and sharpen your knowledge about computer hardware assembly, repair, and maintenance with the aid of our adaptive system!
          </p>
        </section>

        <section className="mt-8 sm:mt-9 grid grid-cols-12 gap-0 h-[24%] min-h-[150px] rounded-lg overflow-hidden border border-[#c9c9c9]">
          <div className="col-span-4">
            <img
              src="/images/landing-card-1.jpg"
              alt="Hardware visual 1"
              className="h-full w-full object-cover"
              style={{ objectPosition: 'left bottom' }}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/1-landing-page.svg';
              }}
              draggable={false}
            />
          </div>
          <div className="col-span-4">
            <img
              src="/images/landing-card-2.jpg"
              alt="Hardware visual 2"
              className="h-full w-full object-cover"
              style={{ objectPosition: 'center bottom' }}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/1-landing-page.svg';
              }}
              draggable={false}
            />
          </div>
          <div className="col-span-4">
            <img
              src="/images/landing-card-3.jpg"
              alt="Hardware visual 3"
              className="h-full w-full object-cover"
              style={{ objectPosition: 'right bottom' }}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/1-landing-page.svg';
              }}
              draggable={false}
            />
          </div>
        </section>

        <div className="mt-7 sm:mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="w-[56%] rounded-full border-[4px] border-[#0F4A8A] bg-[#41f2a2] text-[#0F4A8A] text-2xl sm:text-4xl leading-none py-2.5 sm:py-3 font-medium transition-colors hover:bg-[#2be79c]"
          >
            Take the first step! Join today!
          </button>
        </div>
      </div>
    </div>
  );
};

export default Landing;
