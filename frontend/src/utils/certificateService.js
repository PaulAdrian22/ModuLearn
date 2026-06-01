import axios from 'axios';

export const downloadCertificate = async (userId, isAdmin = false) => {
  try {
    const endpoint = isAdmin ? `/admin/certificate/render/${userId}` : '/user/certificate/download';
    const response = await axios.get(endpoint, {
      headers: isAdmin ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : { Authorization: `Bearer ${localStorage.getItem('token')}` },
      responseType: 'blob'
    });

    // Determine MIME type from response headers
    const contentType = response.headers['content-type'] || 'application/octet-stream';

    // Extract filename from Content-Disposition header or create one
    const disposition = response.headers['content-disposition'] || '';
    let filename = 'certificate';

    if (disposition && disposition.includes('filename=')) {
      filename = disposition.split('filename=')[1].replace(/"/g, '').replace(/'/g, '');
    } else {
      const ext = contentType.includes('pdf') ? 'pdf' : 'png';
      filename = `certificate_${Date.now()}.${ext}`;
    }

    // Create blob and download
    const blob = new Blob([response.data], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true, message: 'Certificate downloaded successfully' };
  } catch (error) {
    console.error('Certificate download error:', error);
    const message = error.response?.data?.error || error.message || 'Failed to download certificate';
    return { success: false, message };
  }
};

export const openCertificatePreview = async (userId, isAdmin = false) => {
  try {
    const endpoint = isAdmin ? `/admin/certificate/render/${userId}` : '/user/certificate/download';
    const response = await axios.get(endpoint, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      responseType: 'blob'
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const blob = new Blob([response.data], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');

    return { success: true, message: 'Preview opened' };
  } catch (error) {
    console.error('Certificate preview error:', error);
    const message = error.response?.data?.error || error.message || 'Failed to open preview';
    return { success: false, message };
  }
};
