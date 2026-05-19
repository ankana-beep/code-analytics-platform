import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Scan } from '../types';
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

const chartTextColor = 'var(--text-muted)';
const chartGridColor = 'var(--border)';

export const Dashboard: React.FC = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingScans, setIsLoadingScans] = useState(false);
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
    loadScans(currentPage);
  }, [currentPage]);

  useEffect(() => {
    const hasActiveScan = scans.some(scan => scan.status === 'queued' || scan.status === 'processing');

    if (!hasActiveScan) {
      return;
    }

    const interval = window.setInterval(() => loadScans(currentPage), 3000);
    return () => window.clearInterval(interval);
  }, [scans, currentPage]);

  const loadScans = async (page = currentPage) => {
    setIsLoadingScans(true);
    const [summaryData, pageData] = await Promise.all([
      api.getScans(0, SUMMARY_LIMIT),
      api.getScans((page - 1) * PAGE_SIZE, PAGE_SIZE)
    ]);
    const completedScans = summaryData.filter(s => s.status === 'completed' && s.metrics);
    const metricCount = completedScans.length || 1;

    setScans(summaryData);
    setRecentScans(pageData);
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
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

  return (
    <div className="dashboard">
      <h1>Code Analytics Dashboard</h1>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>{stats.total}</h3>
          <p>Total Scans</p>
        </div>
        <div className="stat-card">
          <h3>{stats.completed}</h3>
          <p>Completed</p>
        </div>
        <div className="stat-card">
          <h3>{stats.failed}</h3>
          <p>Failed</p>
        </div>
        <div className="stat-card">
          <h3>{stats.processing}</h3>
          <p>Active</p>
        </div>
        <div className="stat-card">
          <h3>{formatNumber(stats.totalFiles)}</h3>
          <p>Files Analyzed</p>
        </div>
        <div className="stat-card">
          <h3>{formatNumber(stats.totalLoc)}</h3>
          <p>Lines of Code</p>
        </div>
        <div className="stat-card">
          <h3>{stats.avgComplexity.toFixed(1)}</h3>
          <p>Avg Complexity</p>
        </div>
        <div className="stat-card">
          <h3>{stats.avgDocCoverage.toFixed(1)}%</h3>
          <p>Avg Docs</p>
        </div>
        <div className="stat-card">
          <h3>{formatNumber(stats.totalIssues)}</h3>
          <p>TODOs + FIXMEs</p>
        </div>
        <div className="stat-card">
          <h3>{formatNumber(stats.totalDependencies)}</h3>
          <p>Dependencies</p>
        </div>
        <div className="stat-card">
          <h3>{formatDuration(stats.avgScanDuration)}</h3>
          <p>Avg Scan Time</p>
        </div>
      </div>

      <div className="chart-section">
        <h2>Recent Scans - Metrics Overview</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
            <XAxis dataKey="name" tick={{ fill: chartTextColor }} axisLine={{ stroke: chartGridColor }} />
            <YAxis tick={{ fill: chartTextColor }} axisLine={{ stroke: chartGridColor }} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)'
              }}
              labelStyle={{ color: 'var(--text)' }}
            />
            <Legend wrapperStyle={{ color: chartTextColor }} />
            <Bar dataKey="complexity" fill="#8884d8" name="Complexity" />
            <Bar dataKey="loc" fill="#82ca9d" name="LOC (k)" />
            <Bar dataKey="docs" fill="#ffc658" name="Docs %" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="recent-scans">
        <div className="section-header">
          <div>
            <h2>Recent Scans</h2>
            <p>
              Showing {recentScans.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0}
              {' - '}
              {((currentPage - 1) * PAGE_SIZE) + recentScans.length}
            </p>
          </div>
          <div className="pagination-controls">
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
              disabled={recentScans.length < PAGE_SIZE || isLoadingScans}
            >
              Next
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
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
            {recentScans.map(scan => {
              const scanId = getScanId(scan);

              return (
              <tr key={scanId}>
                <td>{scan.repository_path}</td>
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
                  <button
                    disabled={!scanId}
                    onClick={() => scanId && navigate(`/scans/${scanId}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
              );
            })}
            {!isLoadingScans && recentScans.length === 0 && (
              <tr>
                <td colSpan={8}>No scans found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
