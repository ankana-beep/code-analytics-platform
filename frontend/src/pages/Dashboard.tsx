import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api';
import { Scan, WorkInProgressPoint } from '../types';

const formatNumber = (value: number) => value.toLocaleString();
const getScanId = (scan: Scan) => scan.id || scan._id || '';
const PAGE_SIZE = 5;

const parseGitHubRepository = (repositoryPath: string) => {
  const match = repositoryPath.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+(?:[._-][^/.]+)*)(?:\.git)?\/?$/);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2]
  };
};

export const Dashboard: React.FC = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);
  const [workInProgressData, setWorkInProgressData] = useState<WorkInProgressPoint[]>([]);
  const [workInProgressError, setWorkInProgressError] = useState<string | null>(null);
  const [isWorkInProgressLoading, setIsWorkInProgressLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadScans();
  }, []);

  const loadScans = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setScans(await api.getScans(0, 100));
    } catch {
      setError('Unable to load scans. Start the backend API on port 8000 and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const completedScans = scans.filter(scan => scan.status === 'completed' && scan.metrics);
  const totalFiles = completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_files || 0), 0);
  const totalLines = completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_lines || scan.metrics?.total_lines_of_code || 0), 0);
  const scansWithHealth = completedScans.filter(scan => typeof scan.health_score === 'number');
  const averageHealthScore = scansWithHealth.length
    ? Math.round(scansWithHealth.reduce((sum, scan) => sum + (scan.health_score || 0), 0) / scansWithHealth.length)
    : 0;
  const chartData = completedScans.slice(0, 8).map(scan => ({
    name: scan.repository_name || scan.repository_path.split('/').slice(-2).join('/'),
    files: scan.metrics?.total_files || 0,
    lines: Math.round((scan.metrics?.total_lines || 0) / 100),
    issues: scan.issues?.length || 0
  }));

  const workInProgressRepository = useMemo(() => {
    const githubScan = completedScans.find(scan => parseGitHubRepository(scan.repository_path));
    return githubScan ? parseGitHubRepository(githubScan.repository_path) : null;
  }, [completedScans]);

  const workInProgressChartData = workInProgressData.map(point => {
    const weekNumber = point.week.match(/Week\s+(\d+)/)?.[1];
    const weekStart = new Date(`${point.week_start}T00:00:00`);

    return {
      ...point,
      week_label: weekNumber ? `W${weekNumber}` : point.week,
      week_date: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    };
  });

  const latestWorkInProgress =
    workInProgressChartData[workInProgressChartData.length - 1]?.open_pull_requests ?? 0;
  const previousWorkInProgress =
    workInProgressChartData[workInProgressChartData.length - 2]?.open_pull_requests ?? latestWorkInProgress;
  const workInProgressDelta = latestWorkInProgress - previousWorkInProgress;
  const peakWorkInProgress = workInProgressChartData.reduce(
    (peak, point) => point.open_pull_requests > peak.open_pull_requests ? point : peak,
    { open_pull_requests: 0, week_label: '-', week_date: '-' }
  );
  const workInProgressTrend =
    workInProgressDelta === 0
      ? 'No change from previous week'
      : `${formatNumber(Math.abs(workInProgressDelta))} ${workInProgressDelta > 0 ? 'more' : 'fewer'} than previous week`;

  useEffect(() => {
    const loadWorkInProgress = async () => {
      if (!workInProgressRepository) {
        setWorkInProgressData([]);
        setWorkInProgressError('Run a scan for a public GitHub repository to see open pull request trends.');
        return;
      }

      setIsWorkInProgressLoading(true);
      setWorkInProgressError(null);
      try {
        setWorkInProgressData(
          await api.getWorkInProgress(workInProgressRepository.owner, workInProgressRepository.repo, 8)
        );
      } catch {
        setWorkInProgressData([]);
        setWorkInProgressError('Unable to load open pull request trends from GitHub right now.');
      } finally {
        setIsWorkInProgressLoading(false);
      }
    };

    loadWorkInProgress();
  }, [workInProgressRepository?.owner, workInProgressRepository?.repo]);

  const filteredScans = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const normalizedBranch = branchFilter.trim().toLowerCase();
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTime = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return scans.filter(scan => {
      const createdTime = new Date(scan.created_at).getTime();
      const searchableText = [
        scan.repository_name,
        scan.repository_path,
        scan.branch,
        scan.status,
        scan.health_status
      ].filter(Boolean).join(' ').toLowerCase();

      if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
        return false;
      }

      if (statusFilter !== 'all' && scan.status !== statusFilter) {
        return false;
      }

      if (normalizedBranch && !(scan.branch || '').toLowerCase().includes(normalizedBranch)) {
        return false;
      }

      if (fromTime !== null && createdTime < fromTime) {
        return false;
      }

      if (toTime !== null && createdTime > toTime) {
        return false;
      }

      return true;
    });
  }, [branchFilter, fromDate, scans, searchQuery, statusFilter, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / PAGE_SIZE));
  const currentSafePage = Math.min(currentPage, totalPages);
  const startIndex = (currentSafePage - 1) * PAGE_SIZE;
  const pageScans = filteredScans.slice(startIndex, startIndex + PAGE_SIZE);
  const pageScanIds = pageScans.map(getScanId).filter(Boolean);
  const allPageSelected = pageScanIds.length > 0 && pageScanIds.every(id => selectedScanIds.includes(id));

  useEffect(() => {
    setCurrentPage(1);
    setSelectedScanIds([]);
  }, [branchFilter, fromDate, searchQuery, statusFilter, toDate]);

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setBranchFilter('');
    setFromDate('');
    setToDate('');
  };

  const toggleScanSelection = (scanId: string) => {
    setSelectedScanIds(current =>
      current.includes(scanId)
        ? current.filter(id => id !== scanId)
        : [...current, scanId]
    );
  };

  const togglePageSelection = () => {
    setSelectedScanIds(current => {
      if (allPageSelected) {
        return current.filter(id => !pageScanIds.includes(id));
      }
      return Array.from(new Set([...current, ...pageScanIds]));
    });
  };

  const deleteScans = async (scanIds: string[]) => {
    if (scanIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      scanIds.length === 1
        ? 'Delete this scan report?'
        : `Delete ${scanIds.length} selected scan reports?`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await Promise.all(scanIds.map(scanId => api.deleteScan(scanId)));
      setScans(current => current.filter(scan => !scanIds.includes(getScanId(scan))));
      setSelectedScanIds(current => current.filter(scanId => !scanIds.includes(scanId)));
    } catch {
      setError('Unable to delete one or more scans. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Code Health</p>
          <h1>GitHub Code Analytics Platform</h1>
          <p className="dashboard-subtitle">
            Foundation-level repository scanning with database-backed reports and no authentication required.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => navigate('/new')}>
          New Scan
        </button>
      </div>

      <div className="executive-grid">
        <div className="executive-card primary">
          <span>Scans</span>
          <strong>{scans.length}</strong>
          <p>{completedScans.length} completed</p>
        </div>
        <div className="executive-card">
          <span>Total Files</span>
          <strong>{formatNumber(totalFiles)}</strong>
          <p>Supported files analyzed</p>
        </div>
        <div className="executive-card">
          <span>Total Lines</span>
          <strong>{formatNumber(totalLines)}</strong>
          <p>Code, comment, and blank lines</p>
        </div>
        <div className="executive-card">
          <span>Average Health</span>
          <strong>{scansWithHealth.length ? `${averageHealthScore}%` : '-'}</strong>
          <p>Across completed scans</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      <section className="panel chart-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recent Reports</p>
            <h2>Repository Scan Overview</h2>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fill: 'var(--text-muted)' }} />
            <Tooltip />
            <Bar dataKey="files" fill="var(--chart-blue)" name="Files" />
            <Bar dataKey="lines" fill="var(--chart-gold)" name="Lines / 100" />
            <Bar dataKey="issues" fill="var(--chart-green)" name="Issues" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="panel chart-section work-in-progress-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Pull Requests</p>
            <div className="chart-title-row">
              <h2>Work In Progress</h2>
              <span className="info-tooltip" tabIndex={0}>
                i
                <span className="tooltip-content">
                  Open pull requests grouped by the week they were created.
                </span>
              </span>
            </div>
            <p>Open PRs by week, based on the latest scanned GitHub repository.</p>
            {workInProgressRepository && (
              <p className="wip-repository">{workInProgressRepository.owner}/{workInProgressRepository.repo}</p>
            )}
          </div>
        </div>
        {isWorkInProgressLoading && <p className="chart-empty-message">Loading pull request trends...</p>}
        {!isWorkInProgressLoading && workInProgressError && (
          <p className="chart-empty-message">{workInProgressError}</p>
        )}
        {!isWorkInProgressLoading && !workInProgressError && (
          <>
            <div className="wip-summary-grid">
              <div>
                <span>Current</span>
                <strong>{formatNumber(latestWorkInProgress)}</strong>
                <p>open PRs</p>
              </div>
              <div>
                <span>Peak</span>
                <strong>{formatNumber(peakWorkInProgress.open_pull_requests)}</strong>
                <p>{peakWorkInProgress.week_label} starting {peakWorkInProgress.week_date}</p>
              </div>
              <div>
                <span>Trend</span>
                <strong className={workInProgressDelta > 0 ? 'trend-up' : workInProgressDelta < 0 ? 'trend-down' : ''}>
                  {workInProgressDelta > 0 ? '+' : ''}{formatNumber(workInProgressDelta)}
                </strong>
                <p>{workInProgressTrend}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={workInProgressChartData} margin={{ top: 18, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
              <XAxis
                dataKey="week_label"
                axisLine={false}
                height={38}
                interval={0}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                width={36}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                formatter={(value) => [formatNumber(Number(value)), 'Open PRs']}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload;
                  return point ? `${point.week} · starts ${point.week_date}` : 'Week';
                }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: 'var(--shadow)',
                  color: 'var(--text)'
                }}
              />
              <Line
                type="monotone"
                dataKey="open_pull_requests"
                name="Open pull requests"
                stroke="var(--primary)"
                strokeWidth={3}
                dot={{ r: 3.5, fill: 'var(--surface)', stroke: 'var(--primary)', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </section>

      <section className="panel recent-scans">
        <div className="panel-header table-panel-header">
          <div>
            <p className="eyebrow">Scan Register</p>
            <h2>Recent Scans</h2>
            <p>
              Showing {filteredScans.length === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageScans.length, filteredScans.length)} of {filteredScans.length}
            </p>
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn-danger"
              disabled={selectedScanIds.length === 0 || isDeleting}
              onClick={() => deleteScans(selectedScanIds)}
            >
              Delete Selected ({selectedScanIds.length})
            </button>
            <button
              type="button"
              disabled={currentSafePage <= 1}
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span>Page {currentSafePage}</span>
            <button
              type="button"
              disabled={currentSafePage >= totalPages}
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <input
            type="search"
            placeholder="Search repositories, branches, statuses"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <input
            type="search"
            placeholder="Branch or commit"
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <button type="button" onClick={resetFilters}>Reset</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="select-cell">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    disabled={pageScanIds.length === 0}
                    onChange={togglePageSelection}
                    aria-label="Select all visible scans"
                  />
                </th>
                <th>Repository</th>
                <th>Branch</th>
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
              {isLoading && (
                <tr>
                  <td colSpan={10}>Loading scans...</td>
                </tr>
              )}
              {!isLoading && pageScans.map(scan => {
                const scanId = getScanId(scan);
                return (
                <tr key={scanId}>
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      checked={selectedScanIds.includes(scanId)}
                      onChange={() => toggleScanSelection(scanId)}
                      aria-label={`Select ${scan.repository_name || scan.repository_path}`}
                    />
                  </td>
                  <td className="repository-cell">{scan.repository_name || scan.repository_path}</td>
                  <td>{scan.branch || '-'}</td>
                  <td><span className={`status ${scan.status}`}>{scan.status}</span></td>
                  <td>{Math.round(scan.progress || 0)}%</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_files) : '-'}</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_lines || scan.metrics.total_lines_of_code) : '-'}</td>
                  <td>{scan.metrics ? (scan.metrics.complexity_metrics.avg_cyclomatic_complexity || 0).toFixed(1) : '-'}</td>
                  <td>{new Date(scan.created_at).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => navigate(`/scans/${scanId}`)}>
                        View
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={isDeleting}
                        onClick={() => deleteScans([scanId])}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
              {!isLoading && filteredScans.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <h3>{scans.length === 0 ? 'No scans yet' : 'No scans match your filters'}</h3>
                      <p>{scans.length === 0 ? 'Start with any public GitHub repository URL.' : 'Reset filters or search for another repository.'}</p>
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
    </div>
  );
};
