import React from 'react';

const Avatar = ({ user, size = 'md', className = '' }) => {
  // Size configurations
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl',
    '2xl': 'w-32 h-32 text-3xl'
  };

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const names = name.trim().split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  // Determine which avatar to display
  const getAvatarSource = () => {
    if (!user) return null;
    
    // Get the API base URL (without /api path)
    const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const serverUrl = apiBaseUrl.replace('/api', '');
    
    // Debug logging
    console.log('Avatar Debug:', {
      user_name: user.Name || user.name,
      avatar_type: user.avatar_type,
      default_avatar: user.default_avatar,
      profile_picture: user.profile_picture,
      serverUrl
    });
    
    // If user has custom avatar type and profile_picture
    if (user.avatar_type === 'custom' && user.profile_picture) {
      // Custom uploads are served from the backend server
      const url = `${serverUrl}${user.profile_picture}`;
      console.log('Using custom avatar:', url);
      return url;
    }
    
    // If user has default avatar type and default_avatar selection
    if (user.avatar_type === 'default' && user.default_avatar) {
      const url = `/images/avatars/${user.default_avatar}`;
      console.log('Using default avatar:', url);
      return url;
    }
    
    // Legacy support: if profile_picture exists but no avatar_type
    if (user.profile_picture && !user.avatar_type) {
      const url = `${serverUrl}${user.profile_picture}`;
      console.log('Using legacy avatar:', url);
      return url;
    }
    
    // Default fallback
    console.log('No avatar found, using initials');
    return null;
  };

  const avatarSrc = getAvatarSource();
  const sizeClass = sizeClasses[size] || sizeClasses.md;

  // If we have an avatar source, display it
  if (avatarSrc) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden bg-gray-200 flex items-center justify-center border border-black ${className}`}>
        <img 
          src={avatarSrc} 
          alt={user?.Name || user?.name || 'User avatar'}
          className="w-full h-full object-contain"
          onError={(e) => {
            // Fallback to initials if image fails to load
            e.target.style.display = 'none';
            e.target.parentElement.innerHTML = `
              <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2BC4B3] to-[#1e5a8e] text-white font-bold">
                ${getInitials(user?.Name || user?.name)}
              </div>
            `;
          }}
        />
      </div>
    );
  }

  // Fallback to initials
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-[#2BC4B3] to-[#1e5a8e] flex items-center justify-center text-white font-bold border border-black ${className}`}>
      {getInitials(user?.Name || user?.name)}
    </div>
  );
};

export default Avatar;
