import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';

const Register = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const registerScale = 'min(1, calc((100dvh - 56px) / 980))';
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (formData.age && (Number(formData.age) < 1 || Number(formData.age) > 120)) {
      setError('Age must be between 1 and 120');
      setLoading(false);
      return;
    }

    try {
      const { confirmPassword, ...registerData } = formData;
      if (!registerData.age || registerData.age.trim() === '') {
        delete registerData.age;
      } else {
        registerData.age = Number(registerData.age);
      }
      const response = await axios.post('/auth/register', registerData);
      navigate('/login');
    } catch (err) {
      if (err.response?.data?.errors) {
        const validationErrors = err.response.data.errors.map(e => e.msg).join(', ');
        setError(validationErrors);
      } else {
        setError(err.response?.data?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="h-[100dvh] w-full relative overflow-hidden"
      style={{
        backgroundImage: 'url(/images/register-bg.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Register Form - Responsive placement keeps design intent while avoiding zoom clipping */}
      <div className="h-[100dvh] flex items-center justify-center lg:justify-end px-4 py-4 lg:pr-[8vw]">
      <div className="w-full max-w-[470px]" style={{ transform: `scale(${registerScale})`, transformOrigin: 'center center' }}>
        <div className="bg-white rounded-3xl shadow-2xl p-7" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          {/* Register Title */}
          <h2 className="text-4xl font-bold text-center mb-2" style={{ color: '#173F65' }}>Register</h2>
          <p className="text-center text-gray-600 mb-5 text-sm">Create your ModuLearn account</p>

          {error && (
            <div className="bg-red-100 border-2 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-6 text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#173F65' }}>
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-highlight focus:outline-none transition-all placeholder-gray-400"
                style={{ color: '#173F65' }}
                required
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#173F65' }}>
                Age
              </label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="Enter your age"
                className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-highlight focus:outline-none transition-all placeholder-gray-400"
                style={{ color: '#173F65' }}
                min="1"
                max="120"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#173F65' }}>
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Choose a username"
                className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-highlight focus:outline-none transition-all placeholder-gray-400"
                style={{ color: '#173F65' }}
                autoComplete="username"
                minLength="3"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#173F65' }}>
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-highlight focus:outline-none transition-all pr-12 placeholder-gray-400"
                  style={{ color: '#173F65' }}
                  required
                  minLength="6"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#173F65' }}>
                Re-enter Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 border-2 border-[#E5E7EB] rounded-xl focus:border-highlight focus:outline-none transition-all pr-12 placeholder-gray-400"
                  style={{ color: '#173F65' }}
                  required
                  minLength="6"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showConfirmPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-white text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-[0.98]"
              style={{ backgroundColor: '#173F65' }}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="spinner mr-2"></div>
                  Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>

            {/* Login Link */}
            <div className="text-center mt-4">
              <span className="text-gray-600 text-sm">Already have an account? </span>
              <Link to="/login" className="font-bold hover:text-[#37A89C] transition-colors underline text-sm" style={{ color: '#42C5B6' }}>
                Login
              </Link>
            </div>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Register;
