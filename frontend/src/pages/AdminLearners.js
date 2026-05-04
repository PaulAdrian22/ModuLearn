import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { adminApi } from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';
import AdminNavbar from '../components/AdminNavbar';
import Avatar from '../components/Avatar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { themedConfirm } from '../utils/themedConfirm';

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
  const [filteredLearners, setFilteredLearners] = useState([]);
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

  useEffect(() => {
    if (user?.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  // Single source for the learners list. Mutations (delete) call refetch().
  const { data: learnersData, loading, refetch: fetchLearners } = useAsyncData(
    async () => {
      const allUsers = await adminApi.users.listAll();
      return allUsers.filter((u) => u.Role === 'student');
    },
    [],
    { initial: [] },
  );
  const learners = learnersData ?? [];

  // Active/inactive stats derived from learners; 7-day login window.
  const stats = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const active = learners.filter((l) => l.last_login && new Date(l.last_login).getTime() > sevenDaysAgo).length;
    return { total: learners.length, active, inactive: learners.length - active };
  }, [learners]);

  // Per-learner metric summary fetch — fires when the learners list changes.
  useEffect(() => {
    if (!learners.length) {
      setLearnerMetricSummaries({});
      return;
    }
    fetchLearnerMetricSummaries(learners);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learners]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = learners;

    if (query !== '') {
      filtered = filtered.filter((learner) =>
        learner.Name.toLowerCase().includes(query) ||
        learner.Email.toLowerCase().includes(query) ||
        learner.EducationalBackground?.toLowerCase().includes(query)
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
  }, [searchQuery, learners, metricFilter, learnerMetricSummaries, metricFilterLoading]);

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
      // Lesson metrics now come from the learner-metrics Edge Function.
      const summaryEntries = await Promise.all(
        studentLearners.map(async (learner) => {
          try {
            const details = await adminApi.users.details(learner.UserID);
            return [learner.UserID, buildMetricSummary(details?.lessonMetrics || [])];
          } catch (err) {
            console.warn(`learner-metrics failed for ${learner.UserID}`, err?.message);
            return [learner.UserID, null];
          }
        }),
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

  const handleViewDetails = async (learner) => {
    try {
      const details = await adminApi.users.details(learner.UserID);
      setSelectedLearner({ ...learner, ...details });
      setShowDetails(true);
    } catch (err) {
      console.error('Error fetching learner details:', err);
      setSelectedLearner(learner);
      setShowDetails(true);
    }
  };

  const handleDeleteLearner = async (learnerId) => {
    const shouldDelete = await themedConfirm({
      title: 'Delete Learner',
      message: 'Are you sure you want to delete this learner? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!shouldDelete) {
      return;
    }

    try {
      await adminApi.users.delete(learnerId);
      fetchLearners();
      setShowDetails(false);
    } catch (err) {
      console.error('Error deleting learner:', err);
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
        return { type: 'text', value: parseTextValue(learner.EducationalBackground) };
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

  const getMetricMax = (data) => {
    if (!data.length) return 10;
    const max = Math.max(...data.map((d) => Number(d.metricValue || 0)));
    if (max <= 10) return 10;
    return Math.ceil(max / 10) * 10;
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

  const exportAsExcel = () => {
    if (!selectedLearner) return;
    const rows = selectedLearner.lessonMetrics || [];
    const metricLabel = METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || selectedMetric;

    const data = rows.map((r) => ({
      Lesson: r.lessonLabel,
      'Lesson Title': r.lessonTitle,
      [metricLabel]: Number(r[selectedMetric] || 0)
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Learner Progress');
    XLSX.writeFile(workbook, `${selectedLearner.Name.replace(/\s+/g, '_')}_progress_report.xlsx`);
  };

  const exportAsPDF = () => {
    if (!selectedLearner) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const metricLabel = METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || selectedMetric;

    doc.setFontSize(18);
    doc.text('Learner Progress Report', 14, 16);
    doc.setFontSize(11);
    doc.text(`Learner: ${selectedLearner.Name}`, 14, 24);
    doc.text(`Email: ${selectedLearner.Email}`, 14, 30);
    doc.text(`Metric: ${metricLabel}`, 14, 36);

    const tableBody = (selectedLearner.lessonMetrics || []).map((r) => ([
      r.lessonLabel,
      r.lessonTitle,
      String(Number(r[selectedMetric] || 0))
    ]));

    autoTable(doc, {
      startY: 44,
      head: [['Lesson', 'Lesson Title', metricLabel]],
      body: tableBody,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [11, 43, 76] },
    });

    doc.save(`${selectedLearner.Name.replace(/\s+/g, '_')}_progress_report.pdf`);
  };

  const activeLearners = sortLearnerList(filteredLearners);
  const suspendedLearners = sortLearnerList([]);
  const deletedLearners = sortLearnerList([]);
  const visibleLearners = activeTab === 'active' ? activeLearners : activeTab === 'suspended' ? suspendedLearners : deletedLearners;

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
        {/* Header Tabs */}
        <div className="mb-5 border-b border-border">
          <div className="flex items-end gap-8 text-[22px] font-semibold text-text-primary">
            <button onClick={() => setActiveTab('active')} className={`pb-3 ${activeTab === 'active' ? 'border-b-4 border-primary' : 'opacity-80'}`}>Active Learners</button>
            <button onClick={() => setActiveTab('suspended')} className={`pb-3 ${activeTab === 'suspended' ? 'border-b-4 border-primary' : 'opacity-80'}`}>Suspended Learners</button>
            <button onClick={() => setActiveTab('deleted')} className={`pb-3 ${activeTab === 'deleted' ? 'border-b-4 border-primary' : 'opacity-80'}`}>Deleted Learners</button>
          </div>
        </div>

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
                  placeholder="Search learners by name, email, or background..."
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
                    <option value="background">Background</option>
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
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Background
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
                  {visibleLearners.map((learner) => (
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
                        <p className="text-text-secondary text-sm">{learner.Email}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-text-primary text-sm">
                          {learner.EducationalBackground || 'Not specified'}
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

            {/* Results count */}
            {visibleLearners.length > 0 && (
              <div className="mt-4 text-center text-sm text-text-secondary">
                Showing {visibleLearners.length} of {learners.length} learner{learners.length !== 1 ? 's' : ''}
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
                    <p><span className="font-bold">Email :</span> {selectedLearner.Email}</p>
                    <p><span className="font-bold">Age :</span> {selectedLearner.Age || 'N/A'}</p>
                    <p><span className="font-bold">Password :</span> {selectedLearner.passwordMasked || '********'} <span className="text-gray-500">🔒</span></p>
                  </div>
                </div>

                <div className="min-w-[300px]">
                  <div className="flex flex-wrap gap-3 mb-3">
                    <button className="px-5 py-2 bg-highlight text-white rounded-lg font-semibold">Enrolled Lessons</button>
                    <button onClick={() => handleDeleteLearner(selectedLearner.UserID)} className="px-5 py-2 bg-[#FF7D7D] text-white rounded-lg font-semibold">Delete Learner</button>
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
                <div className="h-[320px]">
                  <div className="flex flex-wrap gap-4 mb-2 text-sm text-text-secondary">
                    {getLearnerChartData().map((d, i) => (
                      <div key={`${d.lessonLabel}-${i}`} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }}></span>
                        <span>{d.lessonLabel}</span>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getLearnerChartData()} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="0" stroke="#D1D5DB" vertical={false} />
                      <XAxis dataKey="lessonLabel" tick={{ fontSize: 13, fill: '#374151' }} />
                      <YAxis domain={[0, getMetricMax(getLearnerChartData())]} label={{ value: METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.yLabel || 'Value', angle: -90, position: 'insideLeft', dx: -4 }} />
                      <Tooltip formatter={(val) => [val, METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label || 'Metric']} labelFormatter={(label) => label} />
                      <Bar dataKey="metricValue" radius={[6, 6, 0, 0]}>
                        {getLearnerChartData().map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
                <button onClick={exportAsPDF} className="px-6 py-2 bg-[#3A70A1] text-white rounded-lg text-sm md:text-2xl leading-tight">Download as PDF File</button>
                <button onClick={exportAsExcel} className="px-6 py-2 bg-[#3A70A1] text-white rounded-lg text-sm md:text-2xl leading-tight">Download as Excel File</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLearners;
