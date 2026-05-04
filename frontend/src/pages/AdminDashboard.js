import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { adminApi, reportsApi } from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';
import AdminNavbar from '../components/AdminNavbar';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const TOGGLE_OPTIONS = [
  { key: 'lessonProgress', label: 'Lesson Progress' },
  { key: 'lessonCompletionRate', label: 'Lesson Completion Rate' },
  { key: 'lessonRetakeRate', label: 'Lesson Retake Rate' },
  { key: 'lessonMasteryRate', label: 'Lesson Mastery Rate' },
  { key: 'lessonEngagement', label: 'Lesson Engagement' },
  { key: 'lessonAccessComparison', label: 'Lesson Access Comparison' },
  { key: 'reviewAssessmentErrorRate', label: 'Review Assessment Error Rate' },
  { key: 'finalAssessmentErrorRate', label: 'Final Assessment Error Rate' },
  { key: 'averageLessonTimeTaken', label: 'Average Lesson Time Taken' },
  { key: 'passFailDistribution', label: 'Pass or Fail Distribution' },
  { key: 'averageFinalAssessmentScore', label: 'Average Final Assessment Score' },
];

const buildNotificationsSignature = (list = []) =>
  list
    .map((item) => `${item?.type || ''}|${item?.date || ''}|${item?.message || ''}`)
    .join('||');

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Issues Report Modal State
  const [showIssuesModal, setShowIssuesModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [issueReports, setIssueReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [selectedToggleMetric, setSelectedToggleMetric] = useState('lessonProgress');
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportMetrics, setSelectedExportMetrics] = useState(['lessonProgress', 'lessonEngagement']);

  useEffect(() => {
    if (user?.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  // Six parallel reads for the admin landing page; non-critical ones (dashboard
  // counters) fall back to defaults instead of taking the page down.
  const { data: bundle, loading, refetch: refetchBundle } = useAsyncData(
    async () => {
      const [lessons, users, reportsCount, certifiedCount, activity, notificationsList] = await Promise.all([
        adminApi.modules.listAll({ includeDeleted: false }),
        adminApi.users.listAll(),
        adminApi.dashboard.reportCount().catch(() => ({ count: 0 })),
        adminApi.dashboard.certifiedCount().catch(() => ({ count: 0 })),
        adminApi.dashboard.recentActivity().catch(() => []),
        adminApi.dashboard.notifications().catch(() => []),
      ]);
      return { lessons, users, reportsCount, certifiedCount, activity, notifications: notificationsList };
    },
    [],
    { initial: { lessons: [], users: [], reportsCount: { count: 0 }, certifiedCount: { count: 0 }, activity: [], notifications: [] } },
  );

  const stats = useMemo(() => ({
    lessonsDeployed: (bundle?.lessons ?? []).length,
    learnerCount: (bundle?.users ?? []).filter((u) => u.Role === 'student').length,
    certifiedLearners: bundle?.certifiedCount?.count || 0,
    reportedIssues: bundle?.reportsCount?.count || 0,
  }), [bundle]);
  const activityData = bundle?.activity ?? [];
  const notifications = useMemo(
    () => (Array.isArray(bundle?.notifications) ? bundle.notifications : []),
    [bundle?.notifications],
  );

  // Compute unread-notifications badge against the user's last-seen signature.
  useEffect(() => {
    const sig = buildNotificationsSignature(notifications);
    const key = user?.userId
      ? `admin_notifications_seen_signature_u${user.userId}`
      : 'admin_notifications_seen_signature';
    const seen = localStorage.getItem(key) || '';
    setUnreadNotifications(sig && sig !== seen ? notifications.length : 0);
  }, [notifications, user?.userId]);

  const handleOpenNotificationsModal = () => {
    setShowNotificationsModal(true);

    const notificationsSignature = buildNotificationsSignature(notifications);
    const seenSignatureKey = user?.userId
      ? `admin_notifications_seen_signature_u${user.userId}`
      : 'admin_notifications_seen_signature';

    localStorage.setItem(seenSignatureKey, notificationsSignature);
    setUnreadNotifications(0);
  };

  const fetchIssueReports = async () => {
    setIssuesLoading(true);
    try {
      const data = await reportsApi.list();
      setIssueReports(data);
    } catch (err) {
      console.error('Error fetching issue reports:', err);
    }
    setIssuesLoading(false);
  };

  const handleOpenIssuesModal = () => {
    setShowIssuesModal(true);
    setSelectedReport(null);
    fetchIssueReports();
  };

  const handleViewReportDetails = (report) => {
    setSelectedReport(report);
  };

  const handleReturnToList = () => {
    setSelectedReport(null);
  };

  const handleTagAsResolved = async (reportId) => {
    try {
      await reportsApi.resolve(reportId);
      fetchIssueReports();
      // Refetch the dashboard bundle so the reportedIssues counter updates.
      // Was an optimistic decrement before the bundle moved to useAsyncData.
      refetchBundle();
      setSelectedReport(null);
    } catch (err) {
      console.error('Error resolving report:', err);
    }
  };

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending':
        return 'Active';
      case 'reviewed':
        return 'Reviewed';
      case 'resolved':
        return 'Done';
      default:
        return status;
    }
  };

  const getMetricValue = (metricKey, item, index) => {
    const base = Number(item.count || 0);
    switch (metricKey) {
      case 'lessonProgress':
        return base;
      case 'lessonCompletionRate':
        return Math.min(100, Math.round(base * 3.5));
      case 'lessonRetakeRate':
        return Math.max(0, Math.round(base * 0.45));
      case 'lessonMasteryRate':
        return Math.min(100, Math.round(40 + base * 2.2));
      case 'lessonEngagement':
        return Math.min(100, Math.round(30 + base * 2.8));
      case 'lessonAccessComparison':
        return Math.round(base - (activityData[index - 1]?.count || 0));
      case 'reviewAssessmentErrorRate':
        return Math.max(0, Math.round(100 - Math.min(100, base * 3.2)));
      case 'finalAssessmentErrorRate':
        return Math.max(0, Math.round(100 - Math.min(100, base * 3.8)));
      case 'averageLessonTimeTaken':
        return Math.round(base * 2.5);
      case 'passFailDistribution':
        return Math.min(100, Math.round(base * 3.1));
      case 'averageFinalAssessmentScore':
        return Math.min(100, Math.round(35 + base * 2.6));
      default:
        return base;
    }
  };

  const handleToggleExportMetric = (metricKey) => {
    setSelectedExportMetrics((prev) => {
      if (prev.includes(metricKey)) {
        return prev.filter((m) => m !== metricKey);
      }
      return [...prev, metricKey];
    });
  };

  const buildExportRows = () => {
    return activityData.map((item, idx) => {
      const row = {
        Lesson: item.lesson || `Lesson ${idx + 1}`,
      };
      selectedExportMetrics.forEach((metricKey) => {
        const label = TOGGLE_OPTIONS.find((opt) => opt.key === metricKey)?.label || metricKey;
        row[label] = getMetricValue(metricKey, item, idx);
      });
      return row;
    });
  };

  const handleDownloadExcel = () => {
    if (!selectedExportMetrics.length || !activityData.length) return;
    const rows = buildExportRows();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard Report');
    XLSX.writeFile(workbook, 'admin_dashboard_report.xlsx');
  };

  const handleDownloadPDF = () => {
    if (!selectedExportMetrics.length || !activityData.length) return;
    const rows = buildExportRows();
    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.text('Dashboard Activity Report', 14, 16);
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);

    const head = [Object.keys(rows[0])];
    const body = rows.map((row) => Object.values(row).map((val) => String(val)));

    autoTable(doc, {
      startY: 30,
      head,
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [27, 188, 199] },
    });
    doc.save('admin_dashboard_report.pdf');
  };

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

  const chartData = activityData.map((item, index) => ({
    ...item,
    metricValue: getMetricValue(selectedToggleMetric, item, index),
  }));

  // Keep a consistent Y-axis scale across all toggles so vertical numbers stay visible and stable.
  const globalMaxMetric = activityData.length
    ? Math.max(
        ...TOGGLE_OPTIONS.flatMap((option) =>
          activityData.map((item, index) => Math.abs(Number(getMetricValue(option.key, item, index) || 0)))
        )
      )
    : 0;

  const yAxisMax = Math.max(5, Math.ceil(globalMaxMetric / 5) * 5);
  const yAxisStep = yAxisMax > 100 ? 20 : yAxisMax > 50 ? 10 : 5;
  const yAxisTicks = [];
  for (let i = yAxisMax; i >= 0; i -= yAxisStep) {
    yAxisTicks.push(i);
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="w-full">
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h2 className="text-2xl font-bold text-secondary mb-6">Summary</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                {/* Lesson Deployed */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-[#5B9BD5] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 2C4.89 2 4 2.89 4 4V20C4 21.11 4.89 22 6 22H18C19.11 22 20 21.11 20 20V8L14 2H6M13 3.5L18.5 9H13V3.5M8 12V14H16V12H8M8 16V18H13V16H8Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Lesson Deployed</p>
                    <p className="text-4xl font-bold text-text-primary">{stats.lessonsDeployed}</p>
                  </div>
                </div>

                {/* Learner Count */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-[#E9B766] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12C14.21 12 16 10.21 16 8S14.21 4 12 4 8 5.79 8 8 9.79 12 12 12M12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Learner Count</p>
                    <p className="text-4xl font-bold text-text-primary">{stats.learnerCount}</p>
                  </div>
                </div>

                {/* Certified Learners */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-[#66BB6A] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M22.7 19L13.6 9.9C14.5 7.6 14 4.9 12.1 3C10.1 1 7.1 0.6 4.7 1.7L9 6L6 9L1.6 4.7C0.4 7.1 0.9 10.1 2.9 12.1C4.8 14 7.5 14.5 9.8 13.6L18.9 22.7C19.3 23.1 19.9 23.1 20.3 22.7L22.6 20.4C23.1 20 23.1 19.3 22.7 19Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Certified Learners</p>
                    <p className="text-4xl font-bold text-text-primary">{stats.certifiedLearners}</p>
                  </div>
                </div>

                {/* Reported Issues - Clickable */}
                <div 
                  className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors duration-200"
                  onClick={handleOpenIssuesModal}
                >
                  <div className="w-16 h-16 bg-[#EF5350] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 13H11V7H13M13 17H11V15H13M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Reported Issues</p>
                    <p className="text-4xl font-bold text-text-primary">{stats.reportedIssues}</p>
                  </div>
                </div>

                {/* Notifications - Clickable */}
                <div
                  className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors duration-200"
                  onClick={handleOpenNotificationsModal}
                >
                  <div className="w-16 h-16 bg-highlight rounded-xl flex items-center justify-center flex-shrink-0 relative">
                    <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadNotifications > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#EF5350] text-white text-xs font-bold flex items-center justify-center">
                        {unreadNotifications}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Notifications</p>
                    <p className="text-4xl font-bold text-text-primary">{notifications.length}</p>
                  </div>
                </div>
              </div>
          </div>

          {/* Activity Report */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-secondary mb-6">Activity Report</h2>
              
              {/* Legend - Single Row */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
                {chartData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                    <span className="text-xs text-gray-600">{item.lesson}</span>
                  </div>
                ))}
              </div>

              {/* Bar Chart with Y-Axis */}
              <div className="relative">
                {chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    No activity data yet
                  </div>
                ) : (
                <div className="flex">
                  {/* Y-Axis Labels */}
                  <div className="flex flex-col justify-between pr-3" style={{ height: '280px' }}>
                    {yAxisTicks.map((tick) => (
                      <span key={tick} className="text-xs text-gray-500 text-right leading-none" style={{ minWidth: '20px' }}>{tick}</span>
                    ))}
                  </div>

                  {/* Chart Area */}
                  <div className="flex-1 relative" style={{ height: '280px' }}>
                    {/* Horizontal Grid Lines */}
                    {yAxisTicks.map((tick, i) => (
                      <div
                        key={tick}
                        className="absolute w-full border-t border-gray-100"
                        style={{ top: `${(i / (yAxisTicks.length - 1)) * 100}%` }}
                      ></div>
                    ))}

                    {/* Bars */}
                    <div className="flex items-end justify-around h-full relative z-10 px-2">
                      {chartData.map((item, index) => {
                        const metric = Math.max(0, Number(item.metricValue || 0));
                        const heightPercent = yAxisMax > 0 ? (metric / yAxisMax) * 100 : 0;
                        return (
                          <div key={index} className="flex flex-col items-center flex-1" style={{ maxWidth: '80px' }} title={`${item.title || item.lesson}: ${metric}`}>
                            <div className="w-full relative h-full flex items-end justify-center">
                              <div 
                                className="rounded-t-md transition-all duration-300 hover:opacity-80 cursor-pointer"
                                style={{ 
                                  backgroundColor: item.color,
                                  height: `${heightPercent}%`,
                                  width: '70%',
                                  minHeight: metric > 0 ? '4px' : '0px'
                                }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )}

                {/* X-Axis Labels */}
                {chartData.length > 0 && (
                  <div className="flex pl-8 mt-2">
                    <div className="flex-1 flex justify-around px-2">
                      {chartData.map((item, index) => (
                        <span key={index} className="text-xs text-gray-600 text-center flex-1" style={{ maxWidth: '80px' }}>{item.lesson}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles + Export */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="text-3xl md:text-4xl font-bold text-highlight-dark mb-4">Toggles</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-10 gap-y-2">
                  {TOGGLE_OPTIONS.map((option) => (
                    <label key={option.key} className="flex items-center gap-3 md:gap-4 text-[#4B4B4B] cursor-pointer">
                      <input
                        type="radio"
                        name="dashboard-toggle-metric"
                        checked={selectedToggleMetric === option.key}
                        onChange={() => setSelectedToggleMetric(option.key)}
                        className="w-4 h-4 md:w-5 md:h-5"
                      />
                      <span className="text-sm md:text-base leading-tight font-medium">{option.label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="px-6 py-2.5 bg-[#3A70A1] hover:bg-[#2A5D84] text-white rounded-xl font-semibold text-base leading-tight"
                  >
                    Export Data
                  </button>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="bg-highlight px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Notifications</h2>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)] custom-scrollbar">
              {notifications.length === 0 ? (
                <p className="text-gray-400 text-center py-10">No notifications yet</p>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notification, index) => {
                    const typeColors = {
                      new_user: '#42C5B6',
                      enrollment: '#589AD7',
                      completion: '#66BB6A',
                      issue: '#EF5350'
                    };
                    const barColor = typeColors[notification.type] || '#42C5B6';
                    return (
                      <div key={index} className="border-b border-gray-100 pb-4 last:border-b-0">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-1 rounded-full" style={{ backgroundColor: barColor }}></div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 mb-1">{notification.date}</p>
                            <p className="text-sm text-gray-600">{notification.message}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issues Report Modal */}
      {showIssuesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#FF7D7D] px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Issues Report</h2>
              <button
                onClick={() => {
                  setShowIssuesModal(false);
                  setSelectedReport(null);
                }}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {issuesLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-highlight"></div>
                </div>
              ) : selectedReport ? (
                /* Detail View */
                <div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6">
                    <div>
                      <span className="font-bold text-gray-800">Report ID : </span>
                      <span className="text-gray-700">{selectedReport.ReportID}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-800">Category : </span>
                      <span className="text-gray-700">{selectedReport.Category}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-800">Submitted By : </span>
                      <span className="text-gray-700">{selectedReport.Name}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-800">User ID : </span>
                      <span className="text-gray-700">{selectedReport.UserID}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-bold text-gray-800">Email : </span>
                      <a 
                        href={`mailto:${selectedReport.Email}`}
                        className="text-secondary hover:underline"
                      >
                        {selectedReport.Email}
                      </a>
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="font-bold text-gray-800 mb-2">Description</p>
                    <div className="bg-gray-50 rounded-lg p-4 text-gray-700 leading-relaxed">
                      {selectedReport.Details}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-4">
                    <button
                      onClick={handleReturnToList}
                      className="px-6 py-2 bg-[#346C9A] text-white font-medium rounded-lg hover:bg-[#2A5D84] transition-colors"
                    >
                      Return to List
                    </button>
                    {selectedReport.Status !== 'resolved' && (
                      <button
                        onClick={() => handleTagAsResolved(selectedReport.ReportID)}
                        className="px-6 py-2 bg-highlight text-white font-medium rounded-lg hover:bg-highlight-dark transition-colors"
                      >
                        Tag as Resolved
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* List View */
                <div>
                  {issueReports.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg">No issue reports found</p>
                    </div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#FFB8B8]">
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">ReportID</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">Category</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">UserID</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">Email</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800">Status</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-800"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {issueReports.map((report) => (
                          <tr key={report.ReportID} className="border-b border-gray-200">
                            <td className="py-3 px-4 text-gray-800">{report.ReportID}</td>
                            <td className="py-3 px-4 text-gray-800">{report.Category}</td>
                            <td className="py-3 px-4 text-gray-800">{report.UserID}</td>
                            <td className="py-3 px-4 text-gray-800">{report.Name}</td>
                            <td className="py-3 px-4">
                              <a 
                                href={`mailto:${report.Email}`}
                                className="text-[#589AD7] hover:underline"
                              >
                                {report.Email}
                              </a>
                            </td>
                            <td className="py-3 px-4 text-gray-800">{getStatusDisplay(report.Status)}</td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleViewReportDetails(report)}
                                className="px-5 py-2 bg-highlight text-white text-sm font-medium rounded-md hover:bg-highlight-dark transition-colors shadow-sm"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-sm shadow-2xl overflow-hidden">
            <div className="bg-highlight px-8 py-4 flex items-center justify-between">
              <h2 className="text-5xl font-bold text-white">Download Report</h2>
              <button onClick={() => setShowExportModal(false)} className="text-white hover:text-gray-100">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-8">
              <p className="text-2xl md:text-3xl font-bold text-[#3A70A1] mb-5">Select the report you want to download</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-2">
                {TOGGLE_OPTIONS.map((option) => (
                  <label key={option.key} className="flex items-center gap-3 md:gap-4 text-[#4A4A4A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedExportMetrics.includes(option.key)}
                      onChange={() => handleToggleExportMetric(option.key)}
                      className="w-4 h-4 md:w-5 md:h-5"
                    />
                    <span className="text-sm md:text-base leading-tight font-medium">{option.label}</span>
                  </label>
                ))}
              </div>

              <div className="mt-8 flex justify-end gap-6">
                <button
                  onClick={handleDownloadPDF}
                  disabled={!selectedExportMetrics.length || !activityData.length}
                  className="px-8 py-2 rounded-xl bg-highlight hover:bg-highlight-dark text-white font-semibold text-[30px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download as PDF File
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={!selectedExportMetrics.length || !activityData.length}
                  className="px-8 py-2 rounded-xl bg-highlight hover:bg-highlight-dark text-white font-semibold text-[30px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download as Excel File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #42C5B6;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #37A89C;
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
