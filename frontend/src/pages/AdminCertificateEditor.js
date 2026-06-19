import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import Notification from '../components/Notification';
import { API_SERVER_URL } from '../config/api';

const AdminCertificateEditor = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [certTemplate, setCertTemplate] = useState(null);
  const [certUploading, setCertUploading] = useState(false);
  const [certZones, setCertZones] = useState(null);
  const certFileRef = useRef(null);

  useEffect(() => {
    fetchCertTemplate();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  const fetchCertTemplate = async () => {
    try {
      const res = await axios.get('/admin/certificate/template', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const tmpl = res.data.template || null;
      setCertTemplate(tmpl);
      setCertZones(tmpl?.textConfig || null);
    } catch {
      setCertTemplate(null);
      setCertZones(null);
    }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isAllowed = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isAllowed) {
      showNotification('Only PDF or image files (WebP, PNG, JPG, GIF, BMP, TIFF) are allowed.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File exceeds the 10 MB limit.', 'error');
      e.target.value = '';
      return;
    }

    setCertUploading(true);
    const formData = new FormData();
    formData.append('template', file);
    try {
      const res = await axios.post('/admin/certificate/template', formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setCertTemplate(res.data.template);
      setCertZones(res.data.template?.textConfig || null);
      showNotification('Certificate template uploaded successfully.');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Upload failed.', 'error');
    } finally {
      setCertUploading(false);
      e.target.value = '';
    }
  };

  const handleCertDelete = async () => {
    if (!window.confirm('Are you sure you want to delete the certificate template?')) return;

    try {
      await axios.delete('/admin/certificate/template', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCertTemplate(null);
      setCertZones(null);
      showNotification('Certificate template removed.');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to remove template.', 'error');
    }
  };

  const handlePrintPreview = async () => {
    if (!certTemplate) {
      showNotification('No template available.', 'error');
      return;
    }

    try {
      const res = await axios.get('/admin/certificate/generate/1', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.data.type === 'image') {
        const win = window.open();
        win.document.write(`
          <html>
            <head><title>Certificate Preview</title></head>
            <body style="margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f0f0f0;">
              <div style="position: relative; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <img src="${API_SERVER_URL}${res.data.templateUrl}" style="max-width: 100%; height: auto; display: block;" />
                <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <g opacity="0.6">
                    <rect x="${res.data.textConfig.name.x}" y="${res.data.textConfig.name.y}" width="${res.data.textConfig.name.width}" height="${res.data.textConfig.name.height}" fill="none" stroke="#059669" stroke-width="0.5" stroke-dasharray="1,1"/>
                    <text x="${res.data.textConfig.name.x + res.data.textConfig.name.width/2}" y="${res.data.textConfig.name.y + res.data.textConfig.name.height/2}" font-size="3" fill="#059669" text-anchor="middle" dominant-baseline="middle">${res.data.userName}</text>
                    <rect x="${res.data.textConfig.date.x}" y="${res.data.textConfig.date.y}" width="${res.data.textConfig.date.width}" height="${res.data.textConfig.date.height}" fill="none" stroke="#d97706" stroke-width="0.5" stroke-dasharray="1,1"/>
                    <text x="${res.data.textConfig.date.x + res.data.textConfig.date.width/2}" y="${res.data.textConfig.date.y + res.data.textConfig.date.height/2}" font-size="2" fill="#d97706" text-anchor="middle" dominant-baseline="middle">${res.data.date}</text>
                  </g>
                </svg>
              </div>
            </body>
          </html>
        `);
        win.document.close();
      } else {
        window.open(URL.createObjectURL(res.data), '_blank');
      }
    } catch (err) {
      showNotification('Failed to generate preview.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-secondary">Certificate Template Editor</h1>
            <p className="text-gray-600 mt-2">Manage and customize your certificate template</p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            ← Back
          </button>
        </div>

        {notification.show && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification({ show: false, message: '', type: '' })}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Template Preview */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold text-secondary mb-4">Template Preview</h2>
            {certTemplate ? (
              <div className="space-y-4">
                <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                  <CertificatePreview template={certTemplate} zones={certZones} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrintPreview}
                    className="flex-1 px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] font-semibold transition"
                  >
                    Print Preview
                  </button>
                  <button
                    onClick={handleCertDelete}
                    className="px-4 py-2 bg-[#D93B3B] text-white rounded-lg hover:bg-[#B82E2E] font-semibold transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500 text-sm text-center">No template uploaded yet</p>
              </div>
            )}
          </div>

          {/* Right: Controls */}
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-secondary mb-4">Upload Template</h2>
              <p className="text-sm text-gray-600 mb-4">
                Upload a PNG, WebP, JPG, or PDF template (max 10 MB). The template will be used for all certificates.
              </p>
              <button
                onClick={() => certFileRef.current?.click()}
                disabled={certUploading}
                className="w-full px-4 py-3 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] font-semibold disabled:opacity-50 transition"
              >
                {certUploading ? 'Uploading...' : 'Choose File'}
              </button>
              <input
                ref={certFileRef}
                type="file"
                accept=".pdf,.webp,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,application/pdf,image/*"
                className="hidden"
                onChange={handleCertUpload}
              />
            </div>

            {/* Zone Configuration */}
            {certTemplate && certZones && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-secondary mb-4">Zone Configuration</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Text zones are already configured. Adjust them using the interactive preview on the editor or click "Edit Zones" to make changes.
                </p>
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm"><strong>Name Zone:</strong> Position ({certZones.name?.x?.toFixed(1)}%, {certZones.name?.y?.toFixed(1)}%)</p>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm"><strong>Date Zone:</strong> Position ({certZones.date?.x?.toFixed(1)}%, {certZones.date?.y?.toFixed(1)}%)</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CertificatePreview = ({ template, zones }) => {
  const containerRef = useRef(null);
  const API_URL = API_SERVER_URL || 'http://localhost:5000';

  if (!zones) {
    zones = {
      name: { x: 15, y: 42, width: 70, height: 12 },
      date: { x: 25, y: 57, width: 50, height: 8 }
    };
  }

  const isImage = template?.mimetype?.startsWith('image/');
  const templateSrc = `${API_URL}/uploads/cert-template/${template.filename}`;
  const sampleName = 'John Doe';
  const sampleDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div ref={containerRef} className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: '1.414' }}>
      <div className="w-full h-full relative bg-gray-100 rounded-lg overflow-hidden border border-gray-300">
        {isImage ? (
          <img
            src={templateSrc}
            alt="Certificate"
            className="w-full h-full object-contain block"
          />
        ) : (
          <embed
            src={templateSrc}
            type="application/pdf"
            className="w-full h-full block"
          />
        )}

        {/* Text Overlays */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Name Zone */}
          <rect
            x={zones.name?.x}
            y={zones.name?.y}
            width={zones.name?.width}
            height={zones.name?.height}
            fill="rgba(16, 185, 129, 0.1)"
            stroke="#059669"
            strokeWidth="0.3"
            strokeDasharray="0.5,0.5"
          />
          <text
            x={zones.name?.x + zones.name?.width / 2}
            y={zones.name?.y + zones.name?.height / 2}
            fontSize="4"
            fill="#059669"
            textAnchor="middle"
            dominantBaseline="middle"
            fontWeight="bold"
          >
            {sampleName}
          </text>

          {/* Date Zone */}
          <rect
            x={zones.date?.x}
            y={zones.date?.y}
            width={zones.date?.width}
            height={zones.date?.height}
            fill="rgba(217, 119, 6, 0.1)"
            stroke="#d97706"
            strokeWidth="0.3"
            strokeDasharray="0.5,0.5"
          />
          <text
            x={zones.date?.x + zones.date?.width / 2}
            y={zones.date?.y + zones.date?.height / 2}
            fontSize="2.5"
            fill="#d97706"
            textAnchor="middle"
            dominantBaseline="middle"
            fontWeight="bold"
          >
            {sampleDate}
          </text>
        </svg>
      </div>
    </div>
  );
};

export default AdminCertificateEditor;
