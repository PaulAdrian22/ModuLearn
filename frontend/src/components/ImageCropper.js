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
    <div className="fixed inset-0 z-[60] bg-black/90">
      <div className="h-full w-full overflow-y-auto">
        <div className="min-h-full px-3 py-4 sm:px-4 sm:py-6 lg:py-8">
          <div className="mx-auto w-full max-w-4xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white sm:text-2xl">{title}</h3>
              <button 
                onClick={onClose}
                className="text-white hover:text-gray-300"
                aria-label="Close image editor"
              >
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Cropper Area */}
            <div className="relative h-[clamp(220px,52vh,500px)] w-full overflow-hidden rounded-lg bg-white sm:h-[clamp(260px,56vh,500px)]">
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* Vertical line */}
                <div className="absolute h-full w-[2px] bg-black opacity-30"></div>
                {/* Horizontal line */}
                <div className="absolute h-[2px] w-full bg-black opacity-30"></div>
              </div>
            </div>

            {/* Aspect Ratio + Size Control */}
            <div className="mt-5 space-y-4 px-1 sm:mt-6 sm:px-4">
              {aspectOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-white">Aspect Ratio</p>
                  <div className="flex flex-wrap gap-2">
                    {aspectOptions.map((option) => (
                      <button
                        key={option.label}
                        onClick={() => setSelectedAspect(option.value)}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
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

              <div className="flex items-center gap-3 sm:gap-4">
                <svg className="h-5 w-5 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <input
                  type="range"
                  value={zoom}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="slider h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-700"
                  style={{
                    background: `linear-gradient(to right, #2BC4B3 0%, #2BC4B3 ${((zoom - 0.5) / 2.5) * 100}%, #374151 ${((zoom - 0.5) / 2.5) * 100}%, #374151 100%)`
                  }}
                />
                <svg className="h-6 w-6 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
              <p className="mt-2 text-center text-sm text-white">Adjust image size, drag to reposition</p>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:gap-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-gray-700 px-6 py-3 font-semibold text-white transition-all hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-[#2BC4B3] px-6 py-3 font-semibold text-white transition-all hover:bg-[#1a9d8f]"
              >
                Save & Apply
              </button>
            </div>
          </div>
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
