import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../App';

const ProfileContext = createContext();

export const ProfileProvider = ({ children }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get('/users/profile');
      setProfile(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch profile on mount and when user changes
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Function to refresh profile (call after updates)
  const refreshProfile = useCallback(() => {
    return fetchProfile();
  }, [fetchProfile]);

  const value = {
    profile,
    loading,
    error,
    refreshProfile
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
};
