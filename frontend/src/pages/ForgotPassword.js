import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ForgotPassword = () => {
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Please enter your username.');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/auth/forgot-password', { username: trimmed });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#d9f5f1] via-[#eef8ff] to-[#d3ecfb] flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#cde3f1] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#0B2B4C]">Forgot Password</h1>
          <p className="text-gray-500 mt-2 text-sm">Enter your username and the admin will reset your password.</p>
        </div>

        {submitted ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-[#2FCAB8]/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#2FCAB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[#0B2B4C] font-semibold text-lg mb-2">Request Sent</p>
            <p className="text-gray-500 text-sm mb-6">The admin has been notified and will reset your password shortly. Please wait for them to contact you.</p>
            <Link
              to="/login"
              className="inline-block px-6 py-2.5 bg-[#0B2B4C] hover:bg-[#1a3d5c] text-white rounded-xl font-semibold transition-colors"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#0B2B4C] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#2FCAB8] focus:outline-none text-[#0B2B4C]"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-bold text-white text-base transition-all ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-[#0B2B4C] hover:bg-[#1a3d5c] shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? 'Sending...' : 'Send Reset Request'}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm font-semibold text-[#0B2B4C] hover:text-[#2BC4B3] transition-colors">
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
