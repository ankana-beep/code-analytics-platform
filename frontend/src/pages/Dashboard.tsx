import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ExecutiveSummary, Scan } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PAGE_SIZE = 10;
const SUMMARY_LIMIT = 100;

const formatNumber = (value: number) => value.toLocaleString();

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const getScanId = (scan: Scan) => scan.id || scan._id;
const isScanId = (scanId: string | undefined): scanId is string => Boolean(scanId);

const chartTextColor = 'var(--text-muted)';
const chartGridColor = 'var(--border)';

export const Dashboard: React.FC = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingScans, setIsLoadingScans] = useState(false);
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummary | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    totalFiles: 0,
    totalLoc: 0,
    avgComplexity: 0,
    avgDocCoverage: 0,
    totalIssues: 0,
    totalDependencies: 0,
    avgScanDuration: 0
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadScans();
  }, [currentPage]);

  useEffect(() => {
    const hasActiveScan = scans.some(scan => scan.status === 'queued' || scan.status === 'processing');

    if (!hasActiveScan) {
      return;
    }

    const interval = window.setInterval(() => loadScans(), 3000);
    return () => window.clearInterval(interval);
  }, [scans, currentPage]);

  const loadScans = async () => {
    setIsLoadingScans(true);
    const summaryData = await api.getScans(0, SUMMARY_LIMIT);
    const executiveData = await api.getExecutiveSummary();
    const completedScans = summaryData.filter(s => s.status === 'completed' && s.metrics);
    const metricCount = completedScans.length || 1;

    setScans(summaryData);
    setExecutiveSummary(executiveData);
    setStats({
      total: summaryData.length,
      completed: summaryData.filter(s => s.status === 'completed').length,
      failed: summaryData.filter(s => s.status === 'failed').length,
      processing: summaryData.filter(s => s.status === 'processing' || s.status === 'queued').length,
      totalFiles: completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_files || 0), 0),
      totalLoc: completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_lines_of_code || 0), 0),
      avgComplexity: completedScans.reduce((sum, scan) => (
        sum + (scan.metrics?.complexity_metrics.avg_cyclomatic_complexity || 0)
      ), 0) / metricCount,
      avgDocCoverage: completedScans.reduce((sum, scan) => (
        sum + (scan.metrics?.docstring_coverage || 0)
      ), 0) / metricCount,
      totalIssues: completedScans.reduce((sum, scan) => (
        sum + (scan.metrics?.todo_count || 0) + (scan.metrics?.fixme_count || 0)
      ), 0),
      totalDependencies: completedScans.reduce((sum, scan) => (
        sum + (scan.metrics?.dependencies.length || 0)
      ), 0),
      avgScanDuration: completedScans.reduce((sum, scan) => (
        sum + (scan.metrics?.scan_duration || 0)
      ), 0) / metricCount
    });
    setIsLoadingScans(false);
  };

  const filteredScans = scans.filter(scan => {
    const createdTime = new Date(scan.created_at).getTime();
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTime = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    const haystack = `${scan.repository_path} ${scan.branch} ${scan.status}`.toLowerCase();
    const matchesSearch = !searchQuery || haystack.includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || scan.status === statusFilter;
    const matchesBranch = !branchFilter || scan.branch.toLowerCase().includes(branchFilter.toLowerCase());
    const matchesFrom = fromTime === null || createdTime >= fromTime;
    const matchesTo = toTime === null || createdTime <= toTime;

    return matchesSearch && matchesStatus && matchesBranch && matchesFrom && matchesTo;
  });

  useEffect(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const nextRecentScans = filteredScans.slice(start, start + PAGE_SIZE);
    setRecentScans(nextRecentScans);
    setSelectedScanIds(prevSelectedIds => {
      const pageScanIds = new Set(nextRecentScans.map(getScanId).filter(isScanId));
      return prevSelectedIds.filter(scanId => pageScanIds.has(scanId));
    });
  }, [scans, searchQuery, statusFilter, branchFilter, fromDate, toDate, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, branchFilter, fromDate, toDate]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const currentPageScanIds = recentScans.map(getScanId).filter(isScanId);
  const selectedCount = selectedScanIds.length;
  const allPageScansSelected =
    currentPageScanIds.length > 0 &&
    currentPageScanIds.every(scanId => selectedScanIds.includes(scanId));

  const handleSelectAllScans = (checked: boolean) => {
    setSelectedScanIds(checked ? currentPageScanIds : []);
  };

  const handleSelectScan = (scanId: string, checked: boolean) => {
    setSelectedScanIds(prevSelectedIds => (
      checked
        ? Array.from(new Set([...prevSelectedIds, scanId]))
        : prevSelectedIds.filter(selectedScanId => selectedScanId !== scanId)
    ));
  };

  const handleDeleteScan = async (scan: Scan) => {
    const scanId = getScanId(scan);
    if (!scanId) {
      return;
    }

    setConfirmAction({
      title: 'Delete Scan',
      message: `Remove ${scan.repository_path} from recent scans?`,
      confirmLabel: 'Delete Scan',
      onConfirm: async () => {
        setDeletingScanId(scanId);
        setDeleteError(null);
        try {
          await api.deleteScan(scanId);
          await loadScans();
          setToast('Scan deleted.');
        } catch {
          setDeleteError('Failed to delete repository scan. Please try again.');
        } finally {
          setDeletingScanId(null);
        }
      }
    });
  };

  const handleDeleteSelectedScans = async () => {
    if (selectedScanIds.length === 0) {
      return;
    }

    const count = selectedScanIds.length;
    setConfirmAction({
      title: 'Delete Selected Scans',
      message: `Remove ${count} selected repository scans?`,
      confirmLabel: `Delete ${count} Scans`,
      onConfirm: async () => {
        setIsDeletingSelected(true);
        setDeleteError(null);
        try {
          await Promise.all(selectedScanIds.map(scanId => api.deleteScan(scanId)));
          setSelectedScanIds([]);
          await loadScans();
          setToast(`${count} scans deleted.`);
        } catch {
          setDeleteError('Failed to delete selected repository scans. Please try again.');
        } finally {
          setIsDeletingSelected(false);
        }
      }
    });
  };

  const confirmAndClose = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    await action.onConfirm();
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setBranchFilter('');
    setFromDate('');
    setToDate('');
  };

  const chartData = scans
    .filter(s => s.metrics)
    .slice(0, 10)
    .map(s => ({
      name: s.repository_path.split('/').pop(),
      complexity: s.metrics!.complexity_metrics.avg_cyclomatic_complexity,
      loc: s.metrics!.total_lines_of_code / 1000,
      docs: s.metrics!.docstring_coverage
    }));

  const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
  const summary = executiveSummary;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Engineering Intelligence</p>
          <h1>Code Analytics Dashboard</h1>
          <p className="dashboard-subtitle">
            Portfolio health, scan throughput, and maintainability signals across analyzed repositories.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => navigate('/new')}>
          New Scan
        </button>
      </div>

      <div className="executive-grid">
        <div className="executive-card primary">
          <span>Total Scans</span>
          <strong>{summary?.total_scans ?? stats.total}</strong>
          <p>{summary?.active_scans ?? stats.processing} currently active</p>
        </div>
        <div className="executive-card">
          <span>Repositories</span>
          <strong>{summary?.repositories_scanned ?? '-'}</strong>
          <p>{summary?.completed_scans ?? stats.completed} completed scans</p>
        </div>
        <div className="executive-card">
          <span>Analyzed Files</span>
          <strong>{formatNumber(summary?.total_files ?? stats.totalFiles)}</strong>
          <p>{formatNumber(summary?.total_lines_of_code ?? stats.totalLoc)} lines of code</p>
        </div>
        <div className="executive-card">
          <span>Avg Complexity</span>
          <strong>{(summary?.avg_complexity ?? stats.avgComplexity).toFixed(1)}</strong>
          <p>{(summary?.avg_doc_coverage ?? stats.avgDocCoverage).toFixed(1)}% documentation coverage</p>
        </div>
        <div className="executive-card">
          <span>Open Markers</span>
          <strong>{formatNumber((summary?.total_todos ?? 0) + (summary?.total_fixmes ?? 0) || stats.totalIssues)}</strong>
          <p>{formatNumber(summary?.total_dependencies ?? stats.totalDependencies)} dependency references</p>
        </div>
      </div>

      <div className="dashboard-layout">
        <section className="panel chart-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Repository Metrics</p>
              <h2>Recent Scan Overview</h2>
            </div>
            <span className="panel-meta">Last {chartData.length} completed scans</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="name" tick={{ fill: chartTextColor }} axisLine={{ stroke: chartGridColor }} />
              <YAxis tick={{ fill: chartTextColor }} axisLine={{ stroke: chartGridColor }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)'
                }}
                labelStyle={{ color: 'var(--text)' }}
              />
              <Legend wrapperStyle={{ color: chartTextColor }} />
              <Bar dataKey="complexity" fill="var(--chart-blue)" name="Complexity" />
              <Bar dataKey="loc" fill="var(--chart-green)" name="LOC (k)" />
              <Bar dataKey="docs" fill="var(--chart-gold)" name="Docs %" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <aside className="panel operations-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operations</p>
              <h2>Scan Control</h2>
            </div>
          </div>
          <div className="ops-list">
            <div className="ops-row">
              <span>Completed</span>
              <strong>{stats.completed}</strong>
            </div>
            <div className="ops-meter">
              <span style={{ width: `${completionRate}%` }} />
            </div>
            <div className="ops-row">
              <span>Failed</span>
              <strong>{stats.failed}</strong>
            </div>
            <div className="ops-meter danger">
              <span style={{ width: `${failureRate}%` }} />
            </div>
            <div className="ops-row">
              <span>Active Queue</span>
              <strong>{stats.processing}</strong>
            </div>
            <div className="ops-row">
              <span>Avg Scan Time</span>
              <strong>{formatDuration(stats.avgScanDuration)}</strong>
            </div>
            <div className="ops-row">
              <span>Avg Docs</span>
              <strong>{stats.avgDocCoverage.toFixed(1)}%</strong>
            </div>
          </div>
        </aside>
      </div>

      <section className="panel recent-scans">
        <div className="panel-header table-panel-header">
          <div>
            <p className="eyebrow">Scan Register</p>
            <h2>Recent Scans</h2>
            <p>
              Showing {recentScans.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0}
              {' - '}
              {((currentPage - 1) * PAGE_SIZE) + recentScans.length}
              {' '}of {filteredScans.length}
            </p>
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn-danger"
              onClick={handleDeleteSelectedScans}
              disabled={selectedCount === 0 || isDeletingSelected}
            >
              {isDeletingSelected ? 'Deleting...' : `Delete Selected (${selectedCount})`}
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoadingScans}
            >
              Previous
            </button>
            <span>Page {currentPage}</span>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={(currentPage * PAGE_SIZE) >= filteredScans.length || isLoadingScans}
            >
              Next
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories, branches, statuses"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <input
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            placeholder="Branch or commit"
          />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <button type="button" onClick={resetFilters}>Reset</button>
        </div>
        {deleteError && <p className="error-message">{deleteError}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="select-cell">
                  <input
                    type="checkbox"
                    aria-label="Select all recent scans"
                    checked={allPageScansSelected}
                    onChange={(e) => handleSelectAllScans(e.target.checked)}
                    disabled={currentPageScanIds.length === 0 || isDeletingSelected}
                  />
                </th>
                <th>Repository</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Files</th>
                <th>LOC</th>
                <th>Complexity</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingScans && recentScans.length === 0 && Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  <td className="select-cell"><span className="skeleton skeleton-box" /></td>
                  <td><span className="skeleton skeleton-line wide" /></td>
                  <td><span className="skeleton skeleton-pill" /></td>
                  <td><span className="skeleton skeleton-line short" /></td>
                  <td><span className="skeleton skeleton-line short" /></td>
                  <td><span className="skeleton skeleton-line short" /></td>
                  <td><span className="skeleton skeleton-line short" /></td>
                  <td><span className="skeleton skeleton-line" /></td>
                  <td><span className="skeleton skeleton-line" /></td>
                </tr>
              ))}
              {!isLoadingScans && recentScans.map(scan => {
                const scanId = getScanId(scan);

                return (
                <tr key={scanId}>
                  <td className="select-cell">
                    {scanId && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${scan.repository_path}`}
                        checked={selectedScanIds.includes(scanId)}
                        onChange={(e) => handleSelectScan(scanId, e.target.checked)}
                        disabled={deletingScanId === scanId || isDeletingSelected}
                      />
                    )}
                  </td>
                  <td className="repository-cell">{scan.repository_path}</td>
                  <td>
                    <span className={`status ${scan.status}`}>
                      {scan.status}
                    </span>
                  </td>
                  <td>{scan.progress.toFixed(1)}%</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_files) : '-'}</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_lines_of_code) : '-'}</td>
                  <td>
                    {scan.metrics
                      ? scan.metrics.complexity_metrics.avg_cyclomatic_complexity.toFixed(1)
                      : '-'}
                  </td>
                  <td>{new Date(scan.created_at).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        disabled={!scanId || deletingScanId === scanId}
                        onClick={() => scanId && navigate(`/scans/${scanId}`)}
                      >
                        View
                      </button>
                      <button
                        className="btn-danger"
                        disabled={!scanId || deletingScanId === scanId || isDeletingSelected}
                        onClick={() => handleDeleteScan(scan)}
                      >
                        {deletingScanId === scanId ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {!isLoadingScans && recentScans.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <h3>No scans found</h3>
                      <p>Adjust filters or start a new scan to populate this register.</p>
                      <button type="button" className="btn-primary" onClick={() => navigate('/new')}>
                        New Scan
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {confirmAction && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h2>{confirmAction.title}</h2>
            <p>{confirmAction.message}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={confirmAndClose}>
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast success">{toast}</div>}
    </div>
  );
};
