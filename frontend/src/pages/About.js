import React from 'react';
import { useNavigate } from 'react-router-dom';

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{
      backgroundImage: 'url(/images/login-bg.svg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: '#2BC4B3'
    }}>

      {/* Main Content Container */}
      <div className="relative z-10 w-full px-8 py-8">
        {/* White Card Container */}
        <div className="bg-white rounded-2xl shadow-2xl p-16 pt-12">
          {/* Navigation - Top Right */}
          <div className="flex justify-end items-center gap-3 mb-16 text-2xl">
            <button
              onClick={() => navigate('/register')}
              className="px-4 py-1 text-[#1e3a5f] hover:text-[#1e5a8e] font-bold transition-colors"
            >
              Register
            </button>
            <span className="text-[#1e3a5f] font-bold">|</span>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-1 text-[#1e3a5f] hover:text-[#1e5a8e] font-bold transition-colors"
            >
              Login
            </button>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img 
              src="/images/logo.png" 
              alt="ModuLearn Logo" 
              className="h-56 w-auto object-contain drop-shadow-lg"
            />
          </div>

          {/* Content */}
          <div className="max-w-5xl mx-auto space-y-8 text-justify">
            {/* First Paragraph */}
            <p className="text-xl leading-relaxed text-black">
              <span className="text-5xl font-bold text-[#1e3a5f]">ModuLearn</span> is a web-based online learning platform focused on Computer Hardware Servicing (CHS). Its system uses the Bayesian Knowledge Tracing (BKT) Algorithm to customize learning according to the performance and progress of each learner. Interactions of the users with lesson materials, performance on simulation activities and assessment scores are considered to provide an individualized lesson delivery, encourage effective learning, better recalling, and more captivating learning experience.
            </p>

            {/* Second Paragraph */}
            <p className="text-xl leading-relaxed text-black">
              ModuLearn is created to contribute to the Cavite State University - Carmona Campus Extension Services program <span className="font-bold">TO-SERVE</span> (Technical Opportunities to Support, EmpoweR, and Value the Community) Project, a program dedicated to providing unemployed individuals with basic knowledge and skills in computer literacy and servicing intended for professional application.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
