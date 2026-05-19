import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Scan, FileMetric } from '../types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const COLORS = ['#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e74c3c', '#1abc9c'];

const formatNumber = (value: number) => value.toLocaleString();

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

export const ScanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [files, setFiles] = useState<FileMetric[]>([]);

  useEffect(() => {
    if (id) loadScan(id);
  }, [id]);

  useEffect(() => {
    if (!id || !scan || (scan.status !== 'queued' && scan.status !== 'processing')) {
      return;
    }

    const interval = window.setInterval(() => loadScan(id), 3000);
    return () => window.clearInterval(interval);
  }, [id, scan?.status]);

  const loadScan = async (scanId: string) => {
    const scanData = await api.getScan(scanId);
    setScan(scanData);

    if (scanData.status === 'completed') {
      const filesData = await api.getScanFiles(scanId, 0, 10);
      setFiles(filesData);
    }
  };

  if (!scan) return <div>Loading...</div>;
  if (!scan.metrics) {
    return (
      <div className="scan-progress">
        <h1>Scan Results</h1>
        <p>{scan.repository_path} ({scan.branch})</p>
        <span className={`status ${scan.status}`}>{scan.status}</span>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${scan.progress}%` }} />
        </div>
        <div className="progress-info">
          <p><strong>{scan.progress.toFixed(1)}%</strong> complete</p>
          <p>{scan.files_processed} / {scan.files_total} files processed</p>
          {scan.current_file && <p className="current-file">Current: {scan.current_file}</p>}
          {scan.error_message && <p className="error-message">{scan.error_message}</p>}
        </div>
      </div>
    );
  }

  const { metrics } = scan;
  const codeData = [
    { name: 'Code', value: metrics.total_lines_of_code },
    { name: 'Comments', value: metrics.total_comment_lines },
    { name: 'Blank', value: metrics.total_blank_lines }
  ];
  const fileTypeData = Object.entries(metrics.file_types || {})
    .map(([type, count]) => ({ type: type || 'No extension', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const folderData = [...metrics.folder_statistics]
    .sort((a, b) => b.total_lines - a.total_lines)
    .slice(0, 8)
    .map(folder => ({
      name: folder.folder_path.split('/').filter(Boolean).pop() || folder.folder_path || 'root',
      files: folder.total_files,
      lines: folder.total_lines,
      complexity: Number(folder.avg_complexity.toFixed(1))
    }));
  const topDependencies = metrics.dependencies.slice(0, 8);

  return (
    <div className="scan-detail">
      <h1>Scan Results</h1>
      <p>{scan.repository_path} ({scan.branch})</p>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>{metrics.total_files}</h3>
          <p>Total Files</p>
        </div>
        <div className="metric-card">
          <h3>{formatNumber(metrics.total_lines_of_code)}</h3>
          <p>Lines of Code</p>
        </div>
        <div className="metric-card">
          <h3>{formatNumber(metrics.total_comment_lines)}</h3>
          <p>Comment Lines</p>
        </div>
        <div className="metric-card">
          <h3>{formatNumber(metrics.total_blank_lines)}</h3>
          <p>Blank Lines</p>
        </div>
        <div className="metric-card">
          <h3>{formatBytes(metrics.total_size)}</h3>
          <p>Total Size</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.docstring_coverage.toFixed(1)}%</h3>
          <p>Docstring Coverage</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.complexity_metrics.avg_cyclomatic_complexity.toFixed(1)}</h3>
          <p>Avg Complexity</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.complexity_metrics.max_cyclomatic_complexity}</h3>
          <p>Max Complexity</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.complexity_metrics.avg_cognitive_complexity.toFixed(1)}</h3>
          <p>Avg Cognitive</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.complexity_metrics.avg_maintainability_index.toFixed(1)}</h3>
          <p>Maintainability</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.test_metrics.total_test_files}</h3>
          <p>Test Files</p>
        </div>
        <div className="metric-card">
          <h3>{metrics.test_metrics.tests_per_module.toFixed(2)}</h3>
          <p>Tests / Module</p>
        </div>
        <div className="metric-card">
          <h3>{formatDuration(metrics.scan_duration)}</h3>
          <p>Scan Duration</p>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-container">
          <h2>Line Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={codeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {codeData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h2>File Types</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fileTypeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3498db" name="Files" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container wide">
          <h2>Largest Folders</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={folderData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="lines" fill="#2ecc71" name="Lines" />
              <Bar dataKey="files" fill="#f39c12" name="Files" />
              <Bar dataKey="complexity" fill="#9b59b6" name="Avg Complexity" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="issues-section">
        <h2>Issues Found</h2>
        <div className="issue-cards">
          <div className="issue-card warn">
            <h3>{metrics.todo_count}</h3>
            <p>TODOs</p>
          </div>
          <div className="issue-card error">
            <h3>{metrics.fixme_count}</h3>
            <p>FIXMEs</p>
          </div>
          <div className="issue-card info">
            <h3>{metrics.duplicate_files.length}</h3>
            <p>Duplicates</p>
          </div>
          <div className="issue-card warn">
            <h3>{metrics.unused_imports}</h3>
            <p>Unused Imports</p>
          </div>
          <div className="issue-card warn">
            <h3>{metrics.unused_variables}</h3>
            <p>Unused Variables</p>
          </div>
          <div className="issue-card info">
            <h3>{metrics.dependencies.length}</h3>
            <p>Dependencies</p>
          </div>
        </div>
      </div>

      <div className="dependencies-section">
        <h2>Top Dependencies</h2>
        <table>
          <thead>
            <tr>
              <th>Package</th>
              <th>Usage Count</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            {topDependencies.map(dependency => (
              <tr key={dependency.package_name}>
                <td>{dependency.package_name}</td>
                <td>{dependency.usage_count}</td>
                <td>{dependency.files.length}</td>
              </tr>
            ))}
            {topDependencies.length === 0 && (
              <tr>
                <td colSpan={3}>No dependencies detected.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="files-section">
        <h2>Most Complex Files</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>LOC</th>
              <th>Complexity</th>
              <th>Cognitive</th>
              <th>Maintainability</th>
              <th>TODOs</th>
              <th>FIXMEs</th>
              <th>Docs %</th>
            </tr>
          </thead>
          <tbody>
            {files
              .sort((a, b) => b.cyclomatic_complexity - a.cyclomatic_complexity)
              .slice(0, 10)
              .map(file => (
                <tr key={file.file_path}>
                  <td>{file.file_path.split('/').pop()}</td>
                  <td>{file.lines_of_code}</td>
                  <td>
                    <span className={file.cyclomatic_complexity > 10 ? 'high' : ''}>
                      {file.cyclomatic_complexity}
                    </span>
                  </td>
                  <td>{file.cognitive_complexity}</td>
                  <td>{file.maintainability_index.toFixed(1)}</td>
                  <td>{file.todo_count}</td>
                  <td>{file.fixme_count}</td>
                  <td>{file.docstring_coverage.toFixed(0)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
