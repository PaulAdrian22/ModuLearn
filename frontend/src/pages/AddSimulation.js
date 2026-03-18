import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import ImageCropper from '../components/ImageCropper';

const AddSimulation = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState({
    simulationTitle: '',
    description: '',
    activityType: 'Drag and Drop',
    maxScore: 10,
    timeLimit: 0,
    simulationOrder: 1
  });

  // Background image for the simulation
  const [backgroundImage, setBackgroundImage] = useState(null);
  // Drop zones (areas) on the background image
  const [dropZones, setDropZones] = useState([]);
  const imageContainerRef = useRef(null);
  const [draggingZoneId, setDraggingZoneId] = useState(null);
  const [nextZoneId, setNextZoneId] = useState(1);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    if (isEditMode) {
      fetchSimulation();
    }
  }, [user, navigate, id, isEditMode]);

  const fetchSimulation = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/simulations/${id}`);
      const sim = response.data;
      setFormData({
        simulationTitle: sim.SimulationTitle || '',
        description: sim.Description || '',
        activityType: 'Drag and Drop',
        maxScore: sim.MaxScore || 10,
        timeLimit: sim.TimeLimit || 0,
        simulationOrder: sim.SimulationOrder || 1
      });
      
      // Load zone data if exists
      if (sim.ZoneData) {
        try {
          const zoneData = typeof sim.ZoneData === 'string' ? JSON.parse(sim.ZoneData) : sim.ZoneData;
          
          // Restore background image from server path
          if (zoneData.backgroundImage) {
            // Convert server path to full URL for display
            if (zoneData.backgroundImage.startsWith('/uploads')) {
              const apiBaseUrl = axios.defaults.baseURL || 'http://localhost:5000/api';
              const baseUrl = apiBaseUrl.replace('/api', '');
              const timestamp = new Date().getTime(); // Cache busting
              const fullUrl = `${baseUrl}${zoneData.backgroundImage}?t=${timestamp}`;
              setBackgroundImage({ url: fullUrl, file: null, fileName: 'background.png' });
            } else {
              setBackgroundImage({ url: zoneData.backgroundImage, file: null, fileName: 'background.png' });
            }
          }
          
          if (zoneData.dropZones && Array.isArray(zoneData.dropZones)) {
            // Process zones to restore small images from server paths
            const processedZones = zoneData.dropZones.map(zone => {
              const processed = { ...zone };
              
              // Restore small image if exists
              if (zone.smallImage) {
                if (zone.smallImage.startsWith('/uploads')) {
                  const apiBaseUrl = axios.defaults.baseURL || 'http://localhost:5000/api';
                  const baseUrl = apiBaseUrl.replace('/api', '');
                  const timestamp = new Date().getTime();
                  const fullUrl = `${baseUrl}${zone.smallImage}?t=${timestamp}`;
                  processed.smallImage = { url: fullUrl, file: null, fileName: 'image.png' };
                } else {
                  processed.smallImage = { url: zone.smallImage, file: null, fileName: 'image.png' };
                }
              }
              
              return processed;
            });
            
            setDropZones(processedZones);
            // Set nextZoneId to max id + 1
            const maxId = Math.max(0, ...zoneData.dropZones.map(z => z.id));
            setNextZoneId(maxId + 1);
          }
        } catch (parseErr) {
          console.error('Error parsing ZoneData:', parseErr);
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching simulation:', err);
      setErrorMessage('Failed to load simulation data.');
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear messages on change
    setErrorMessage('');
    setSuccessMessage('');
  };

  // Handle background image upload
  const handleBackgroundUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image must be less than 10MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageToCrop(reader.result);
      setCropTarget({ type: 'background', originalName: file.name });
      setShowCropper(true);
      setErrorMessage('');
    };
    reader.readAsDataURL(file);
  };

  // Handle small image upload for a specific drop zone
  const handleSmallImageUpload = (zoneId, e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image must be less than 10MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageToCrop(reader.result);
      setCropTarget({ type: 'zone', zoneId, originalName: file.name });
      setShowCropper(true);
      setErrorMessage('');
    };
    reader.readAsDataURL(file);
  };

  const handleEditBackgroundImage = () => {
    if (!backgroundImage?.url) return;

    setImageToCrop(backgroundImage.url);
    setCropTarget({
      type: 'background',
      originalName: backgroundImage.fileName || 'background-image'
    });
    setShowCropper(true);
    setErrorMessage('');
  };

  const handleSaveCroppedImage = (croppedImageBlob) => {
    if (!cropTarget) return;

    const sanitizedBaseName = (cropTarget.originalName || 'image')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const croppedFileName = `${sanitizedBaseName}_cropped.png`;
    const croppedFile = new File([croppedImageBlob], croppedFileName, {
      type: croppedImageBlob.type || 'image/png'
    });
    const croppedUrl = URL.createObjectURL(croppedImageBlob);

    if (cropTarget.type === 'background') {
      if (backgroundImage?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(backgroundImage.url);
      }
      setBackgroundImage({ url: croppedUrl, file: croppedFile, fileName: croppedFileName });
    }

    if (cropTarget.type === 'zone') {
      setDropZones(prev => prev.map(zone => {
        if (zone.id !== cropTarget.zoneId) return zone;

        if (zone.smallImage?.url?.startsWith('blob:')) {
          URL.revokeObjectURL(zone.smallImage.url);
        }

        return {
          ...zone,
          smallImage: {
            url: croppedUrl,
            file: croppedFile,
            fileName: croppedFileName
          }
        };
      }));
    }

    setShowCropper(false);
    setImageToCrop(null);
    setCropTarget(null);
  };

  // Add a new drop zone (area)
  const addDropZone = () => {
    if (!backgroundImage) {
      setErrorMessage('Please upload a background image first.');
      return;
    }
    const newZone = {
      id: nextZoneId,
      x: 50,
      y: 50,
      label: `Area ${nextZoneId}`,
      smallImage: null
    };
    setDropZones(prev => [...prev, newZone]);
    setNextZoneId(prev => prev + 1);
    setErrorMessage('');
  };

  // Remove a drop zone
  const removeDropZone = (zoneId) => {
    setDropZones(prev => {
      const zone = prev.find(z => z.id === zoneId);
      if (zone?.smallImage?.url) {
        URL.revokeObjectURL(zone.smallImage.url);
      }
      return prev.filter(z => z.id !== zoneId);
    });
  };

  // Handle dragging circles on the background image
  const handleCircleMouseDown = (e, zoneId) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingZoneId(zoneId);
  };

  const handleImageMouseMove = useCallback((e) => {
    if (!draggingZoneId || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDropZones(prev => prev.map(zone =>
      zone.id === draggingZoneId
        ? { ...zone, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
        : zone
    ));
  }, [draggingZoneId]);

  const handleImageMouseUp = useCallback(() => {
    setDraggingZoneId(null);
  }, []);

  // Attach global mouse events for dragging
  useEffect(() => {
    if (draggingZoneId) {
      window.addEventListener('mousemove', handleImageMouseMove);
      window.addEventListener('mouseup', handleImageMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleImageMouseMove);
      window.removeEventListener('mouseup', handleImageMouseUp);
    };
  }, [draggingZoneId, handleImageMouseMove, handleImageMouseUp]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (backgroundImage?.url) URL.revokeObjectURL(backgroundImage.url);
      dropZones.forEach(zone => {
        if (zone.smallImage?.url) URL.revokeObjectURL(zone.smallImage.url);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    // Validation
    if (!formData.simulationTitle.trim()) {
      setErrorMessage('Please enter a simulation title.');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');

      // Upload background image to server if it's a new file (blob URL)
      let backgroundImagePath = null;
      if (backgroundImage?.file && backgroundImage.url?.startsWith('blob:')) {
        try {
          const formDataUpload = new FormData();
          formDataUpload.append('file', backgroundImage.file);
          formDataUpload.append('type', 'image');
          
          const uploadResponse = await axios.post('/admin/upload-media', formDataUpload, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          backgroundImagePath = uploadResponse.data.url;
        } catch (uploadErr) {
          console.error('Failed to upload background image:', uploadErr);
          setErrorMessage('Failed to upload background image.');
          setSaving(false);
          return;
        }
      } else if (backgroundImage?.url) {
        // If editing and URL exists, convert back to relative path
        if (backgroundImage.url.startsWith('http://') || backgroundImage.url.startsWith('https://')) {
          try {
            const url = new URL(backgroundImage.url);
            backgroundImagePath = url.pathname; // Store just /uploads/lessons/image.jpg
          } catch (e) {
            backgroundImagePath = backgroundImage.url;
          }
        } else {
          backgroundImagePath = backgroundImage.url;
        }
      }

      // Upload small images for each drop zone
      const uploadedZones = await Promise.all(
        dropZones.map(async (zone) => {
          let smallImagePath = null;
          
          // If zone has a small image that needs uploading (blob URL)
          if (zone.smallImage?.file && zone.smallImage.url?.startsWith('blob:')) {
            try {
              const formDataUpload = new FormData();
              formDataUpload.append('file', zone.smallImage.file);
              formDataUpload.append('type', 'image');
              
              const uploadResponse = await axios.post('/admin/upload-media', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              
              smallImagePath = uploadResponse.data.url;
            } catch (uploadErr) {
              console.error('Failed to upload small image for zone:', zone.id, uploadErr);
              // Continue without this image rather than failing completely
            }
          } else if (zone.smallImage?.url) {
            // If editing and URL exists, convert back to relative path
            if (zone.smallImage.url.startsWith('http://') || zone.smallImage.url.startsWith('https://')) {
              try {
                const url = new URL(zone.smallImage.url);
                smallImagePath = url.pathname;
              } catch (e) {
                smallImagePath = zone.smallImage.url;
              }
            } else {
              smallImagePath = zone.smallImage.url;
            }
          }
          
          return {
            id: zone.id,
            x: zone.x,
            y: zone.y,
            label: zone.label,
            smallImage: smallImagePath
          };
        })
      );

      // Prepare zone data
      const zoneData = {
        backgroundImage: backgroundImagePath,
        dropZones: uploadedZones
      };

      const payload = {
        ...formData,
        // Auto-set maxScore to match number of zones if zones exist
        maxScore: dropZones.length > 0 ? dropZones.length : formData.maxScore,
        zoneData: dropZones.length > 0 || backgroundImagePath ? zoneData : null
      };

      if (isEditMode) {
        await axios.put(`/simulations/admin/${id}`, payload);
        setSuccessMessage('Simulation updated successfully!');
      } else {
        await axios.post('/simulations/admin', payload);
        setSuccessMessage('Simulation created successfully!');
      }

      setSaving(false);
      navigate('/admin/simulations');
    } catch (err) {
      console.error('Error saving simulation:', err);
      setErrorMessage('Failed to save simulation. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <AdminNavbar />
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />

      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)]">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/admin/simulations')}
            className="p-3 hover:bg-white rounded-lg transition-all group"
            title="Back to Simulations"
          >
            <svg className="w-8 h-8 text-[#1e5a8e] group-hover:text-[#2BC4B3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-4xl font-bold text-[#1e5a8e]">
            {isEditMode ? 'Edit Simulation' : 'Add Simulation'}
          </h1>
        </div>

        {/* Success / Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-xl flex items-center gap-3">
            <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <p className="text-green-800 font-semibold">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            <p className="text-red-800 font-semibold">{errorMessage}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-8">

          {/* Section 1: Simulation Details */}
          <div>
            <h2 className="text-lg font-bold text-[#1e5a8e] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
              </svg>
              Simulation Details
            </h2>

            <div className="space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Simulation Title *</label>
                <input
                  type="text"
                  name="simulationTitle"
                  value={formData.simulationTitle}
                  onChange={handleChange}
                  placeholder="e.g., Identifying Sections of the Motherboard"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Briefly describe what the student will learn or do in this simulation..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 resize-none"
                />
              </div>

              {/* Scoring & Time */}
              <div className="grid grid-cols-3 gap-6">
                {/* Max Score */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Max Score</label>
                  <div className="relative">
                    <input
                      type="number"
                      name="maxScore"
                      value={formData.maxScore}
                      onChange={handleChange}
                      min="1"
                      max="100"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">pts</span>
                  </div>
                </div>

                {/* Time Limit */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Time Limit</label>
                  <div className="relative">
                    <input
                      type="number"
                      name="timeLimit"
                      value={formData.timeLimit}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">min</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Set to 0 for no time limit</p>
                </div>

                {/* Simulation Order */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Simulation Order</label>
                  <input
                    type="number"
                    name="simulationOrder"
                    value={formData.simulationOrder}
                    onChange={handleChange}
                    min="1"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Order within the lesson</p>
                </div>
              </div>

            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-gray-100"></div>

          {/* Section: Simulation Builder */}
          <div>
            <h2 className="text-lg font-bold text-[#1e5a8e] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5Z"/>
              </svg>
              Simulation Builder
            </h2>

            <div className="flex gap-6">
              {/* Left: Background Image Container */}
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Background Image</label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-3 focus-within:border-[#2BC4B3] transition-colors bg-white"
                >
                  {backgroundImage ? (
                    <div className="relative border border-gray-200 rounded-lg overflow-auto bg-gray-50 min-h-[64vh] flex items-center justify-center p-3">
                      <div
                        ref={imageContainerRef}
                        className="relative w-fit max-w-full"
                      >
                        <img
                          src={backgroundImage.url}
                          alt="Background"
                          className="block w-auto h-auto max-w-full"
                          draggable={false}
                        />
                        {/* Drop zone circles overlay */}
                        {dropZones.map((zone) => (
                          <div
                            key={zone.id}
                            onMouseDown={(e) => handleCircleMouseDown(e, zone.id)}
                            className={`absolute w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-grab select-none transition-shadow ${
                              draggingZoneId === zone.id
                                ? 'border-[#FFB74D] bg-[#FFB74D]/70 shadow-lg scale-110 cursor-grabbing'
                                : 'border-[#2BC4B3] bg-[#2BC4B3]/60 hover:shadow-md'
                            }`}
                            style={{
                              left: `${zone.x}%`,
                              top: `${zone.y}%`,
                              transform: 'translate(-50%, -50%)',
                              zIndex: draggingZoneId === zone.id ? 50 : 10
                            }}
                            title={`${zone.label} — Drag to reposition`}
                          >
                            <span className="text-white font-bold drop-shadow">{zone.id}</span>
                          </div>
                        ))}
                      </div>

                      {/* Image action buttons */}
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleEditBackgroundImage}
                          className="bg-white/90 hover:bg-white px-3 py-1.5 rounded-lg cursor-pointer shadow text-sm font-semibold text-[#1e5a8e] transition-all"
                        >
                          Edit Image
                        </button>

                        <label className="bg-white/90 hover:bg-white px-3 py-1.5 rounded-lg cursor-pointer shadow text-sm font-semibold text-[#1e5a8e] transition-all">
                          Change Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleBackgroundUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="border border-gray-200 rounded-lg min-h-[64vh] flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-[#1e5a8e] cursor-pointer transition-all bg-gray-50">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[#2BC4B3] font-semibold">Import Background Image</span>
                      <span className="text-xs text-gray-400">PNG, JPG, GIF — Maximum 10MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {backgroundImage && (
                  <p className="text-xs text-gray-500 mt-1">{backgroundImage.fileName}</p>
                )}
              </div>

              {/* Right: Drop Zones / Areas Panel */}
              <div className="w-80 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-700">Drop Areas</label>
                  <button
                    type="button"
                    onClick={addDropZone}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#2BC4B3] text-white font-semibold text-sm rounded-lg hover:bg-[#1e5a8e] transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Area
                  </button>
                </div>

                {dropZones.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                    <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                    <p className="text-gray-400 text-sm">No drop areas yet.</p>
                    <p className="text-gray-400 text-xs mt-1">Upload a background image, then click "Add Area".</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {dropZones.map((zone, index) => (
                      <div
                        key={zone.id}
                        className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3 hover:border-[#2BC4B3] transition-colors"
                      >
                        {/* Area header row */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#2BC4B3] flex items-center justify-center">
                              <span className="text-white text-xs font-bold">{zone.id}</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-700">Area {index + 1}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDropZone(zone.id)}
                            className="p-1 text-gray-400 hover:text-[#EF5350] hover:bg-red-50 rounded-lg transition-all"
                            title="Remove area"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        {/* Small image upload for this area */}
                        <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                          {zone.smallImage ? (
                            <div className="relative">
                              <img
                                src={zone.smallImage.url}
                                alt={`Area ${zone.id}`}
                                className="w-full h-20 object-contain p-1"
                              />
                              <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 cursor-pointer transition-all group">
                                <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Change</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleSmallImageUpload(zone.id, e)}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-[#2BC4B3] text-xs font-semibold mt-1">Upload Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleSmallImageUpload(zone.id, e)}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                        {zone.smallImage && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{zone.smallImage.fileName}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>


        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin/simulations')}
            className="px-8 py-4 border-2 border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-white transition-all"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-10 py-4 bg-[#2BC4B3] text-white font-bold text-lg rounded-lg hover:bg-[#1e5a8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              isEditMode ? 'Update Simulation' : 'Create Simulation'
            )}
          </button>
        </div>
      </div>

      {showCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          title={cropTarget?.type === 'background' ? 'Crop Background Image' : 'Crop Part Image'}
          cropShape="rect"
          showGrid={true}
          aspect={cropTarget?.type === 'background' ? 16 / 9 : 1}
          aspectOptions={
            cropTarget?.type === 'background'
              ? [
                  { label: '16:9', value: 16 / 9 },
                  { label: '4:3', value: 4 / 3 },
                  { label: '3:2', value: 3 / 2 },
                  { label: '1:1', value: 1 }
                ]
              : [
                  { label: '1:1', value: 1 },
                  { label: '4:3', value: 4 / 3 },
                  { label: '3:4', value: 3 / 4 },
                  { label: '16:9', value: 16 / 9 }
                ]
          }
          outputSize={cropTarget?.type === 'background' ? 1600 : 900}
          outputFileName={cropTarget?.type === 'background' ? 'simulation-background-cropped.png' : 'simulation-part-cropped.png'}
          onSave={handleSaveCroppedImage}
          onClose={() => {
            setShowCropper(false);
            setImageToCrop(null);
            setCropTarget(null);
          }}
        />
      )}
    </div>
  );
};

export default AddSimulation;
