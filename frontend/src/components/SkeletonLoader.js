import React from 'react';

const SkeletonLoader = ({ type = 'card' }) => {
  if (type === 'card') {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
            <div className="w-20 h-6 bg-gray-200 rounded-full"></div>
          </div>
        </div>
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      </div>
    );
  }

  if (type === 'stat') {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-gray-200 rounded-xl"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'header') {
    return (
      <div className="mb-10 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-gray-200 rounded-full"></div>
          <div>
            <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-5 bg-gray-200 rounded w-96"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
    </div>
  );
};

export default SkeletonLoader;
