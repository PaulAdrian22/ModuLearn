import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const loginScale = 'min(1, calc((100dvh - 72px) / 760))';
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/auth/login', formData);
      login(response.data.user, response.data.token);
      
      // Redirect based on user role
      if (response.data.user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard', {
          state: {
            fromLogin: true,
            isNewUser: Boolean(response.data.isNewUser),
          },
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] flex items-center justify-center px-4 pt-14 pb-4 relative overflow-hidden" style={{
      backgroundImage: 'url(/images/login-bg.webp)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: '#2BC4B3'
    }}>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 z-20 inline-flex items-center gap-2 rounded-xl bg-[#0B2B4C] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#1a3d5c] hover:shadow-xl active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#2BC4B3] focus:ring-offset-2"
        aria-label="Back to landing page"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Home
      </button>

      <div className="max-w-md w-full relative z-10" style={{ transform: `scale(${loginScale})`, transformOrigin: 'center top' }}>
        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 pt-6 sm:pt-7" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <img 
              src="/images/logo.png" 
              alt="ModuLearn Logo" 
              className="h-24 sm:h-32 w-auto object-contain drop-shadow-2xl"
            />
          </div>

          {/* ModuLearn Title */}
          <h1 className="text-3xl font-bold text-[#0B2B4C] text-center mb-2" style={{ letterSpacing: '0.5px' }}>ModuLearn</h1>

          {/* Login Heading */}
          <h2 className="text-2xl font-bold text-[#0B2B4C] text-center mb-6">Log In to Your Account</h2>

          {error && (
            <div className="bg-error/10 border-2 border-error text-error px-4 py-3 rounded-xl mb-6 text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-[#0B2B4C] mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-[#2BC4B3] focus:outline-none transition-all text-[#0B2B4C] placeholder-gray-400"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[#0B2B4C] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-[#2BC4B3] focus:outline-none transition-all pr-12 text-[#0B2B4C] placeholder-gray-400"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#0B2B4C] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              <div className="text-left mt-2">
                <Link to="/forgot-password" className="text-sm font-semibold text-[#0B2B4C] hover:text-[#2BC4B3] transition-colors">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-xl font-bold text-white text-lg transition-all mt-5 ${
                loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-[#0B2B4C] hover:bg-[#1a3d5c] active:scale-[0.98] shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="spinner mr-2"></div>
                  Logging in...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#6B7280] text-sm">
              Don't have an account yet?{' '}
              <Link to="/register" className="text-[#2BC4B3] hover:text-[#1a9d8f] font-bold transition-colors underline">
                Register Here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
