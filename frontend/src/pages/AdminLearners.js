import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import Avatar from '../components/Avatar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { themedConfirm } from '../utils/themedConfirm';
import { API_SERVER_URL } from '../config/api';

const METRIC_OPTIONS = [
  { key: 'lessonProgress', label: 'Lesson Progress', yLabel: 'Percent' },
  { key: 'lessonCompletionRate', label: 'Lesson Completion Rate', yLabel: 'Percent' },
  { key: 'lessonRetakeCount', label: 'Lesson Retake Count', yLabel: 'Count' },
  { key: 'lessonsMastered', label: 'Lessons Mastered', yLabel: 'Count' },
  { key: 'timeSpentPerLesson', label: 'Time Spent per Lesson', yLabel: 'Minutes' },
  { key: 'totalAssessmentErrors', label: 'Total Assessment Errors', yLabel: 'Points Missed' },
  { key: 'finalAssessmentScores', label: 'Final Assessment Scores', yLabel: 'Score' },
  { key: 'totalReviewErrors', label: 'Total Review Errors', yLabel: 'Points Missed' },
  { key: 'challengeTrend', label: 'Challenge Trend', yLabel: 'Delta' },
];

const LESSON_COLORS = ['#7CA7F9', '#6B98F0', '#E7B346', '#E99942', '#EE9C47', '#EAAF3E', '#7BA5F7', '#88508F', '#8F5693'];

const AdminLearners = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [learners, setLearners] = useState([]);
  const [filteredLearners, setFilteredLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('alphabetical');
  const [sortDirection, setSortDirection] = useState('asc');
  const [metricFilter, setMetricFilter] = useState('all');
  const [learnerMetricSummaries, setLearnerMetricSummaries] = useState({});
  const [metricFilterLoading, setMetricFilterLoading] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedMetric, setSelectedMetric] = useState('timeSpentPerLesson');
  const [currentPage, setCurrentPage] = useState(1);
  const [genderFilter, setGenderFilter] = useState('all');
  const ITEMS_PER_PAGE = 20;
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    fetchLearners();
  }, [user, navigate]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = learners;

    if (query !== '') {
      filtered = filtered.filter((learner) =>
        learner.Name.toLowerCase().includes(query) ||
        learner.Username.toLowerCase().includes(query)
      );
    }

    if (genderFilter !== 'all') {
      filtered = filtered.filter((learner) =>
        (learner.Gender || '').toLowerCase() === genderFilter.toLowerCase()
      );
    }

    if (metricFilter !== 'all') {
      filtered = filtered.filter((learner) => {
        const summary = learnerMetricSummaries[learner.UserID];

        // Keep rows visible while metrics are still loading.
        if (!summary) return metricFilterLoading;

        const value = Number(summary[metricFilter] || 0);
        return value > 0;
      });
    }

    setFilteredLearners(filtered);
    setCurrentPage(1);
  }, [searchQuery, learners, metricFilter, genderFilter, learnerMetricSummaries, metricFilterLoading]);

  const buildMetricSummary = (lessonMetrics = []) => {
    const metricTotals = METRIC_OPTIONS.reduce((acc, metric) => {
      acc[metric.key] = 0;
      return acc;
    }, {});

    lessonMetrics.forEach((lessonMetric) => {
      METRIC_OPTIONS.forEach((metric) => {
        metricTotals[metric.key] += Number(lessonMetric?.[metric.key] || 0);
      });
    });

    const averageMetricKeys = new Set([
      'lessonProgress',
      'lessonCompletionRate',
      'timeSpentPerLesson',
      'finalAssessmentScores',
      'challengeTrend'
    ]);

    const lessonCount = lessonMetrics.length || 1;

    return METRIC_OPTIONS.reduce((acc, metric) => {
      const total = Number(metricTotals[metric.key] || 0);
      acc[metric.key] = averageMetricKeys.has(metric.key)
        ? Math.round(total / lessonCount)
        : Math.round(total);
      return acc;
    }, {});
  };

  const fetchLearnerMetricSummaries = async (studentLearners) => {
    if (!studentLearners.length) {
      setLearnerMetricSummaries({});
      return;
    }

    setMetricFilterLoading(true);

    try {
      const summaryEntries = await Promise.all(
        studentLearners.map(async (learner) => {
          try {
            const response = await axios.get(`/users/${learner.UserID}/details`);
            return [learner.UserID, buildMetricSummary(response.data?.lessonMetrics || [])];
          } catch (error) {
            console.error(`Failed to load metric summary for learner ${learner.UserID}:`, error);
            return [learner.UserID, null];
          }
        })
      );

      const summaries = {};
      summaryEntries.forEach(([userId, summary]) => {
        if (summary) summaries[userId] = summary;
      });

      setLearnerMetricSummaries(summaries);
    } finally {
      setMetricFilterLoading(false);
    }
  };

  const fetchLearners = async () => {
    try {
      const response = await axios.get('/users/all');
      console.log('Fetched users:', response.data); // Debug log
      
      // Filter for students only
      const studentLearners = response.data.filter(u => u.Role === 'student');
      console.log('Student learners:', studentLearners); // Debug log
      
      setLearners(studentLearners);
      setFilteredLearners(studentLearners);
      fetchLearnerMetricSummaries(studentLearners.filter(l => !l.is_archived));
      
      // Calculate stats
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const activeLearners = studentLearners.filter(l => !l.is_archived);
      const activeCount = activeLearners.filter(l => {
        if (!l.last_login) return false;
        const lastLogin = new Date(l.last_login).getTime();
        return lastLogin > thirtyDaysAgo;
      }).length;
      
      setStats({
        total: activeLearners.length,
        active: activeCount,
        inactive: activeLearners.length - activeCount
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching learners:', err);
      console.error('Error response:', err.response);
      setLoading(false);
    }
  };

  const handleViewDetails = async (learner) => {
    try {
      // Fetch detailed learner info including progress.
      // Spread `learner` first so list-only fields (e.g. is_archived) survive the merge —
      // the detail endpoint doesn't return them and we need is_archived to switch between
      // Archive vs Unarchive/Delete buttons.
      const response = await axios.get(`/users/${learner.UserID}/details`);
      setSelectedLearner({ ...learner, ...response.data, is_archived: learner.is_archived });
      setShowDetails(true);
    } catch (err) {
      console.error('Error fetching learner details:', err);
      // Fallback to basic info
      setSelectedLearner(learner);
      setShowDetails(true);
    }
  };

  const handleResetPassword = async (learnerId) => {
    const confirmed = await themedConfirm({
      title: 'Reset Password',
      message: "Reset this learner's password to the default 'user1234'? They will need to log in with the new password.",
      confirmText: 'Reset',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      await axios.post(`/admin/users/${learnerId}/reset-password`);
      await themedConfirm({
        title: 'Password Reset',
        message: "Password has been reset to 'user1234'. Share this with the learner so they can sign in.",
        confirmText: 'OK',
        showCancel: false
      });
    } catch (err) {
      console.error('Error resetting password:', err);
      await themedConfirm({
        title: 'Reset Failed',
        message: err?.response?.data?.message || 'Could not reset the password.',
        confirmText: 'OK',
        showCancel: false,
        variant: 'danger'
      });
    }
  };

  const handleUnarchiveLearner = async (learnerId) => {
    const confirmed = await themedConfirm({
      title: 'Unarchive Learner',
      message: 'Restore this learner so they appear under Active Learners again?',
      confirmText: 'Unarchive',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    try {
      await axios.put(`/users/unarchive/${learnerId}`);
      setShowDetails(false);
      fetchLearners();
    } catch (err) {
      console.error('Error unarchiving learner:', err);
      await themedConfirm({
        title: 'Unarchive Failed',
        message: err?.response?.data?.message || 'Could not unarchive the learner.',
        confirmText: 'OK',
        showCancel: false,
        variant: 'danger'
      });
    }
  };

  const handleDeleteLearner = async (learnerId) => {
    const confirmed = await themedConfirm({
      title: 'Delete Learner',
      message: 'Permanently delete this learner and all of their progress? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      await axios.delete(`/users/${learnerId}`);
      setShowDetails(false);
      fetchLearners();
    } catch (err) {
      console.error('Error deleting learner:', err);
      await themedConfirm({
        title: 'Delete Failed',
        message: err?.response?.data?.message || 'Could not delete the learner.',
        confirmText: 'OK',
        showCancel: false,
        variant: 'danger'
      });
    }
  };

  const handleArchiveLearner = async (learnerId) => {
    const shouldArchive = await themedConfirm({
      title: 'Archive Learner',
      message: 'Are you sure you want to archive this learner? This action can be undone.',
      confirmText: 'Archive',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!shouldArchive) {
      return;
    }

    try {
      await axios.put(`/users/archive/${learnerId}`);
      fetchLearners();
      setShowDetails(false);
    } catch (err) {
      console.error('Error archiving learner:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not Available Yet';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const parseDateValue = (dateString) => {
    if (!dateString) return null;
    const timestamp = new Date(dateString).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const parseNumberValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseTextValue = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return text || null;
  };

  const getComparableValue = (learner, field) => {
    switch (field) {
      case 'alphabetical':
        return { type: 'text', value: parseTextValue(learner.Name) };
      case 'dateJoined':
        return { type: 'number', value: parseDateValue(learner.created_at) };
      case 'lastOnline':
        return { type: 'number', value: parseDateValue(learner.last_login) };
      case 'age':
        return { type: 'number', value: parseNumberValue(learner.Age) };
      case 'background':
        return { type: 'text', value: null };
      case 'selectedMetric': {
        const metricKey = metricFilter === 'all' ? 'lessonProgress' : metricFilter;
        const metricValue = learnerMetricSummaries[learner.UserID]?.[metricKey];
        return { type: 'number', value: parseNumberValue(metricValue) };
      }
      default:
        return { type: 'text', value: parseTextValue(learner.Name) };
    }
  };

  const compareLearners = (a, b) => {
    const first = getComparableValue(a, sortField);
    const second = getComparableValue(b, sortField);
    const isFirstMissing = first.value === null;
    const isSecondMissing = second.value === null;

    if (isFirstMissing && isSecondMissing) return 0;
    if (isFirstMissing) return 1;
    if (isSecondMissing) return -1;

    let comparison = 0;
    if (first.type === 'text') {
      comparison = first.value.localeCompare(second.value);
    } else {
      comparison = first.value - second.value;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  };

  const sortLearnerList = (items) => [...items].sort(compareLearners);

  const formatMinutes = (minutes) => {
    const value = Number(minutes || 0);
    const hrs = Math.floor(value / 60);
    const mins = value % 60;
    if (hrs === 0) return `${mins} Minutes`;
    if (mins === 0) return `${hrs} Hours`;
    return `${hrs} Hours ${mins} Minutes`;
  };

  // Nice-axis: pick a step from {1, 2, 2.5, 5} × 10^n so ticks read cleanly at any magnitude.
  const niceAxis = (rawMax, targetTicks = 5) => {
    if (!Number.isFinite(rawMax) || rawMax <= 0) return { max: 5, step: 1 };
    const rough = rawMax / targetTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let niceNorm;
    if (norm <= 1) niceNorm = 1;
    else if (norm <= 2) niceNorm = 2;
    else if (norm <= 2.5) niceNorm = 2.5;
    else if (norm <= 5) niceNorm = 5;
    else niceNorm = 10;
    const step = niceNorm * pow;
    const max = Math.ceil(rawMax / step) * step;
    return { max, step };
  };

  const getMetricAxis = (data) => {
    const rawMax = data.length ? Math.max(...data.map((d) => Number(d.metricValue || 0))) : 0;
    const { max, step } = niceAxis(rawMax);
    const ticks = [];
    for (let i = 0; i <= max + 1e-9; i += step) {
      ticks.push(Math.round(i * 1e6) / 1e6);
    }
    return { max, ticks };
  };

  const getLearnerChartData = () => {
    if (!selectedLearner?.lessonMetrics) return [];
    return selectedLearner.lessonMetrics.map((item, idx) => ({
      lessonLabel: item.lessonLabel,
      metricValue: Number(item[selectedMetric] || 0),
      fill: LESSON_COLORS[idx % LESSON_COLORS.length],
      lessonTitle: item.lessonTitle,
    }));
  };

  const handlePrintCertificate = async () => {
    if (!selectedLearner) return;
    try {
      const token = localStorage.getItem('token');
      const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
      );
      const showCertError = async (message) => {
        await themedConfirm({
          title: 'Certificate Error',
          message,
          confirmText: 'OK',
          showCancel: false,
          variant: 'danger'
        });
      };

      const previewRes = await axios.get(`/admin/certificate/generate/${selectedLearner.UserID}`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: null
      });

      if (previewRes.status !== 200) {
        await showCertError(previewRes.data?.error || 'Failed to generate certificate.');
        return;
      }

      if (previewRes.data?.type === 'image') {
        const { templateUrl, userName, date, textConfig } = previewRes.data;
        const zones = {
          name: { x: 15, y: 42, width: 70, height: 12, ...(textConfig?.name || {}) },
          date: { x: 25, y: 57, width: 50, height: 8, ...(textConfig?.date || {}) }
        };
        const templateSrc = `${API_SERVER_URL}${templateUrl}`;
        const nameFontSize = Math.max(2, Math.min(9, zones.name.height * 0.55));
        const dateFontSize = Math.max(1.4, Math.min(5, zones.date.height * 0.55));
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (!printWindow) return;

        printWindow.document.write(`<!doctype html>
<html><head><title>Certificate - ${escHtml(userName || selectedLearner.Name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @page { margin: -15mm 0 -15mm 0; padding: 0; size: A4 landscape; }
  * { margin: 0 !important; padding: 0 !important; box-sizing: border-box; }
  html { margin: 0 !important; padding: 0 !important; width: 100%; height: 100%; }
  body { width: 100vw; height: 100vh; margin: 0 !important; padding: 0 !important; overflow: hidden; position: relative; background: #fff; }
  .certificate { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
  .cert-img { width: 100%; height: 100%; object-fit: cover; display: block; margin: 0 !important; padding: 0 !important; }
  .cert-text { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; font-family: Arial, Helvetica, "DejaVu Sans", "Liberation Sans", sans-serif; }
</style></head>
<body>
  <div class="certificate">
    <img class="cert-img" src="${templateSrc}" alt="Certificate" crossorigin="anonymous" />
    <svg class="cert-text" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <text x="${zones.name.x + zones.name.width / 2}" y="${zones.name.y + zones.name.height / 2}" font-size="${nameFontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000">${escHtml(userName)}</text>
      <text x="${zones.date.x + zones.date.width / 2}" y="${zones.date.y + zones.date.height / 2}" font-size="${dateFontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000">${escHtml(date)}</text>
    </svg>
  </div>
  <script>
    var img = document.querySelector('.cert-img');
    function doPrint() { window.focus(); window.print(); }
    img.onload = doPrint;
    img.onerror = doPrint;
    setTimeout(doPrint, 2000);
  <\/script>
</body></html>`);
        printWindow.document.close();
        return;
      }

      const res = await axios.get(`/admin/certificate/render/${selectedLearner.UserID}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        validateStatus: null
      });

      if (res.status !== 200) {
        const text = new TextDecoder().decode(res.data);
        try {
          const data = JSON.parse(text);
          await showCertError(data.error || 'Unexpected response from server.');
        } catch {
          await showCertError('Failed to generate certificate.');
        }
        return;
      }

      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/pdf')) {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank', 'width=1100,height=800');
        if (printWindow) {
          printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        return;
      }

      const text = new TextDecoder().decode(res.data);
      try {
        const data = JSON.parse(text);
        await showCertError(data.error || 'Unexpected response from server.');
      } catch {
        await showCertError('Unexpected response from server.');
      }
    } catch (err) {
      console.error('Print certificate error:', err);
    }
  };

  const handlePrintReport = () => {
    if (!selectedLearner) return;
    const metricLabel = METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || selectedMetric;
    const rows = selectedLearner.lessonMetrics || [];
    const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const tableRows = rows
      .map((r) => `<tr><td>${escapeHtml(r.lessonLabel)}</td><td>${escapeHtml(r.lessonTitle)}</td><td>${Number(r[selectedMetric] || 0)}</td></tr>`)
      .join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html><head><title>Learner Progress Report</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #0B2B4C; }
  h1 { margin: 0 0 8px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
  th { background: #0B2B4C; color: #fff; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Learner Progress Report</h1>
  <div class="meta">
    <div><strong>Learner:</strong> ${escapeHtml(selectedLearner.Name)}</div>
    <div><strong>Username:</strong> ${escapeHtml(selectedLearner.Username || '')}</div>
    <div><strong>Metric:</strong> ${escapeHtml(metricLabel)}</div>
    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
  </div>
  <table>
    <thead><tr><th>Lesson</th><th>Lesson Title</th><th>${escapeHtml(metricLabel)}</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = function () { window.focus(); window.print(); };<\/script>
</body></html>`);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const rows = visibleLearners;
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Username', 'Gender', 'Age', 'Date Joined', 'Last Login'];
    const csvRows = rows.map((l) => [
      escape(l.Name),
      escape(l.Username),
      escape(['Male', 'Female'].includes(l.Gender) ? l.Gender : 'N/A'),
      escape(l.Age || 'N/A'),
      escape(formatDate(l.created_at)),
      escape(formatDate(l.last_login)),
    ].join(','));

    const csv = [header.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `learners_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeLearners = sortLearnerList(filteredLearners.filter(l => !l.is_archived));
  const archivedLearners = sortLearnerList(filteredLearners.filter(l => l.is_archived));
  const visibleLearners = activeTab === 'archived' ? archivedLearners : activeLearners;
  const totalPages = Math.max(1, Math.ceil(visibleLearners.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLearners = visibleLearners.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="flex items-center justify-center h-96">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-learners-page min-h-screen bg-background">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Header Tabs (hidden in detail view to maximize screen space) */}
        {!showDetails && (
          <div className="mb-5 border-b border-border">
            <div className="flex items-end gap-8 text-[22px] font-semibold text-text-primary">
              <button onClick={() => { setActiveTab('active'); setCurrentPage(1); }} className={`pb-3 ${activeTab === 'active' ? 'border-b-4 border-primary' : 'opacity-80'}`}>Active Learners</button>
              <button onClick={() => { setActiveTab('archived'); setCurrentPage(1); }} className={`pb-3 ${activeTab === 'archived' ? 'border-b-4 border-primary' : 'opacity-80'}`}>Archived Learners</button>
            </div>
          </div>
        )}

        {!showDetails && (
          <>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-4xl font-bold text-primary mb-2">Learners</h1>
              <p className="text-text-secondary">Manage and monitor student accounts</p>
            </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-border flex items-center space-x-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Total Learners</p>
              <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-border flex items-center space-x-3">
            <div className="w-12 h-12 bg-highlight/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-highlight-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Active Users</p>
              <p className="text-2xl font-bold text-text-primary">{stats.active}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-border flex items-center space-x-3">
            <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Inactive Users</p>
              <p className="text-2xl font-bold text-text-primary">{stats.inactive}</p>
            </div>
          </div>
          </div>

          {/* Search Bar */}
          <div className="card mb-6">
            <div className="flex flex-col xl:flex-row xl:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search learners by name or username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 border-none focus:outline-none focus:ring-0 bg-transparent text-text-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center xl:justify-end">
                <div className="flex items-center gap-2">
                  <label htmlFor="learner-gender-filter" className="text-sm font-medium text-text-secondary whitespace-nowrap">
                    Gender
                  </label>
                  <select
                    id="learner-gender-filter"
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="all">All</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="learner-metric-filter" className="text-sm font-medium text-text-secondary whitespace-nowrap">
                    Metric Filter
                  </label>
                  <select
                    id="learner-metric-filter"
                    value={metricFilter}
                    onChange={(e) => setMetricFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="all">All Learners</option>
                    {METRIC_OPTIONS.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metric.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="learner-sort-field" className="text-sm font-medium text-text-secondary whitespace-nowrap">
                    Sort By
                  </label>
                  <select
                    id="learner-sort-field"
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="alphabetical">Alphabetically</option>
                    <option value="dateJoined">Date Joined</option>
                    <option value="lastOnline">Last Online</option>
                    <option value="age">Age</option>
                    <option value="selectedMetric">Selected Metric</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="learner-sort-order" className="text-sm font-medium text-text-secondary whitespace-nowrap">
                    Order
                  </label>
                  <select
                    id="learner-sort-order"
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>

              </div>
            </div>

            {metricFilter !== 'all' && metricFilterLoading && (
              <p className="mt-3 text-xs text-text-secondary">Loading learner metric filter data...</p>
            )}
          </div>

            {/* Learners Table */}
            <div className="card overflow-hidden">
              {visibleLearners.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-text-secondary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-text-secondary text-lg">
                {searchQuery ? 'No learners found matching your search' : 'No learners registered yet'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Learner
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Gender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Age
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-border">
                  {paginatedLearners.map((learner) => (
                    <tr key={learner.UserID} className="hover:bg-background/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar user={learner} size="md" />
                          <div>
                            <p className="font-semibold text-text-primary">{learner.Name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-text-secondary text-sm">{learner.Username}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-text-primary text-sm">
                          {['Male', 'Female'].includes(learner.Gender) ? learner.Gender : 'N/A'}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-text-primary text-sm">{learner.Age || 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-text-secondary text-sm">
                          {formatDate(learner.created_at)}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleViewDetails(learner)}
                          className="text-primary hover:text-primary-dark font-semibold text-sm"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </div>

            {/* Pagination */}
            {visibleLearners.length > 0 && (
              <div className="mt-4 flex items-center justify-between px-2">
                <span className="text-sm text-text-secondary">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, visibleLearners.length)} of {visibleLearners.length} learner{visibleLearners.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-text-primary disabled:opacity-40 hover:bg-background"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-text-secondary">Page {safePage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-text-primary disabled:opacity-40 hover:bg-background"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {showDetails && selectedLearner && (
          <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowDetails(false)} className="text-text-primary hover:text-primary">
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
              </button>
            </div>

            <div className="bg-background border border-border rounded p-6 mb-5">
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
                <div className="flex gap-6 items-start">
                  <Avatar user={selectedLearner} size="2xl" />
                  <div className="text-text-primary text-lg md:text-2xl leading-tight">
                    <p><span className="font-bold">User ID :</span> {selectedLearner.UserID}</p>
                    <p><span className="font-bold">Name :</span> {selectedLearner.Name}</p>
                    <p><span className="font-bold">Username :</span> {selectedLearner.Username}</p>
                    <p><span className="font-bold">Age :</span> {selectedLearner.Age || 'N/A'}</p>
                    <p><span className="font-bold">Password :</span> {selectedLearner.passwordMasked || '********'} <span className="text-gray-500">🔒</span></p>
                  </div>
                </div>

                <div className="min-w-[300px]">
                  {selectedLearner.isCertificateEligible && (
                    <div className="flex items-center gap-2 justify-end mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-semibold border border-green-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Eligible for Certification
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 mb-3 justify-end">
                    <button
                      onClick={handlePrintCertificate}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Certificate
                    </button>
                    <button
                      onClick={() => handleResetPassword(selectedLearner.UserID)}
                      className="px-5 py-2 bg-[#3A70A1] hover:bg-[#2A5D84] text-white rounded-lg font-semibold"
                    >
                      Reset Password
                    </button>
                    {selectedLearner.is_archived ? (
                      <>
                        <button
                          onClick={() => handleUnarchiveLearner(selectedLearner.UserID)}
                          className="px-5 py-2 bg-highlight hover:bg-highlight-dark text-white rounded-lg font-semibold"
                        >
                          Unarchive
                        </button>
                        <button
                          onClick={() => handleDeleteLearner(selectedLearner.UserID)}
                          className="px-5 py-2 bg-[#D93B3B] hover:bg-[#B82E2E] text-white rounded-lg font-semibold"
                        >
                          Delete Learner
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleArchiveLearner(selectedLearner.UserID)}
                        className="px-5 py-2 bg-[#FF7D7D] hover:bg-[#E56B6B] text-white rounded-lg font-semibold"
                      >
                        Archive Learner
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 text-base md:text-lg text-text-primary">
                    <p><span className="font-bold">📘 Lessons Enrolled :</span> {selectedLearner.summary?.lessonsEnrolled || 0}</p>
                    <p><span className="font-bold">🕒 Last Active:</span> {formatDate(selectedLearner.summary?.lastActive)}</p>
                    <p><span className="font-bold">➕ Account Creation :</span> {formatDate(selectedLearner.summary?.accountCreation)}</p>
                    <p><span className="font-bold">🏅 Certificates :</span> {selectedLearner.summary?.certificates || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border rounded p-4">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
                <div className="flex flex-col" style={{ minHeight: '320px' }}>
                  <div className="flex-shrink-0 flex flex-wrap gap-4 mb-2 text-sm text-text-secondary">
                    {getLearnerChartData().map((d, i) => (
                      <div key={`${d.lessonLabel}-${i}`} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }}></span>
                        <span>{d.lessonLabel}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0" style={{ minHeight: '260px' }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={getLearnerChartData()} margin={{ top: 8, right: 16, left: 45, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="0" stroke="#D1D5DB" vertical={false} />
                      <XAxis dataKey="lessonLabel" tick={{ fontSize: 13, fill: '#374151' }} />
                      <YAxis
                        domain={[0, getMetricAxis(getLearnerChartData()).max]}
                        ticks={getMetricAxis(getLearnerChartData()).ticks}
                        allowDecimals
                        label={{ value: METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.yLabel || 'Value', angle: -90, position: 'insideLeft', dx: -4 }}
                      />
                      <Tooltip formatter={(val) => [val, METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || 'Metric']} labelFormatter={(label) => label} />
                      <Bar dataKey="metricValue" radius={[6, 6, 0, 0]}>
                        {getLearnerChartData().map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-4 pl-2">
                  <div className="space-y-2 text-text-primary">
                    {METRIC_OPTIONS.map((metric) => (
                      <label key={metric.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="admin-learner-metric"
                          checked={selectedMetric === metric.key}
                          onChange={() => setSelectedMetric(metric.key)}
                          className="w-4 h-4"
                        />
                        <span className="text-base md:text-lg leading-tight">{metric.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-4">
                <button
                  onClick={handlePrintReport}
                  className="px-6 py-2 bg-[#3A70A1] hover:bg-[#2A5D84] text-white rounded-lg text-sm md:text-2xl leading-tight"
                >
                  Print Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLearners;
