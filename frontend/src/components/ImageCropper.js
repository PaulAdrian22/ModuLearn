import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';

const ImageCropper = ({
  image,
  onSave,
  onClose,
  title = 'Adjust Your Photo',
  aspect = 1,
  cropShape = 'round',
  showGrid = false,
  aspectOptions = [],
  outputSize = 600,
  outputFileName = 'cropped-image.png'
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [selectedAspect, setSelectedAspect] = useState(aspect);

  useEffect(() => {
    setSelectedAspect(aspect);
  }, [aspect]);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;

    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels, {
        aspect: selectedAspect,
        outputSize,
        fileName: outputFileName
      });
      onSave(croppedImage);
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[60]">
      <div className="w-full max-w-4xl px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">{title}</h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full h-[500px] bg-white rounded-lg overflow-hidden">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={selectedAspect}
            cropShape={cropShape}
            showGrid={showGrid}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            restrictPosition={false}
          />
          {/* Center Guidelines */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Vertical line */}
            <div className="absolute w-[2px] h-full bg-black opacity-30"></div>
            {/* Horizontal line */}
            <div className="absolute h-[2px] w-full bg-black opacity-30"></div>
          </div>
        </div>

        {/* Aspect Ratio + Size Control */}
        <div className="mt-6 px-4 space-y-4">
          {aspectOptions.length > 0 && (
            <div>
              <p className="text-white text-sm mb-2">Aspect Ratio</p>
              <div className="flex flex-wrap gap-2">
                {aspectOptions.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => setSelectedAspect(option.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                      selectedAspect === option.value
                        ? 'bg-[#2BC4B3] text-white'
                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <input
              type="range"
              value={zoom}
              min={0.5}
              max={3}
              step={0.1}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #2BC4B3 0%, #2BC4B3 ${((zoom - 0.5) / 2.5) * 100}%, #374151 ${((zoom - 0.5) / 2.5) * 100}%, #374151 100%)`
              }}
            />
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
          <p className="text-center text-white text-sm mt-2">Adjust image size, drag to reposition</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-6 py-3 bg-[#2BC4B3] hover:bg-[#1a9d8f] text-white rounded-lg font-semibold transition-all"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function to create cropped image
const getCroppedImg = (imageSrc, pixelCrop, options = {}) => {
  const {
    aspect = 1,
    outputSize = 600,
    fileName = 'cropped-image.png',
    mimeType = 'image/png'
  } = options;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // Enable CORS
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let targetWidth;
      let targetHeight;

      if (aspect >= 1) {
        targetWidth = outputSize;
        targetHeight = Math.round(outputSize / aspect);
      } else {
        targetHeight = outputSize;
        targetWidth = Math.round(outputSize * aspect);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Fill canvas with white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Draw the cropped image
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        targetWidth,
        targetHeight
      );

      // Convert canvas to blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        blob.name = fileName;
        resolve(blob);
      }, mimeType);
    };
    image.onerror = reject;
  });
};

export default ImageCropper;
