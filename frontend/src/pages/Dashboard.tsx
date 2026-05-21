import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api';
import { Scan } from '../types';

const formatNumber = (value: number) => value.toLocaleString();
const getScanId = (scan: Scan) => scan.id || scan._id;

export const Dashboard: React.FC = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadScans();
  }, []);

  const loadScans = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setScans(await api.getScans(0, 50));
    } catch {
      setError('Unable to load scans. Start the backend API on port 8000 and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const completedScans = scans.filter(scan => scan.status === 'completed' && scan.metrics);
  const totalFiles = completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_files || 0), 0);
  const totalLines = completedScans.reduce((sum, scan) => sum + (scan.metrics?.total_lines || scan.metrics?.total_lines_of_code || 0), 0);
  const chartData = completedScans.slice(0, 8).map(scan => ({
    name: scan.repository_name || scan.repository_path.split('/').slice(-2).join('/'),
    files: scan.metrics?.total_files || 0,
    lines: Math.round((scan.metrics?.total_lines || 0) / 100),
    issues: scan.issues?.length || 0
  }));

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Code Health</p>
          <h1>GitHub Code Analytics Platform</h1>
          <p className="dashboard-subtitle">
            Foundation-level repository scanning with in-memory reports, no authentication, and no database required.
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

      <section className="panel recent-scans">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Reports</p>
            <h2>Scan History</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Health Status</th>
                <th>Files</th>
                <th>Lines</th>
                <th>Issues</th>
                <th>Scan Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8}>Loading scans...</td>
                </tr>
              )}
              {!isLoading && scans.map(scan => (
                <tr key={getScanId(scan)}>
                  <td className="repository-cell">{scan.repository_name || scan.repository_path}</td>
                  <td>{scan.branch || '-'}</td>
                  <td><span className={`status ${scan.status}`}>{scan.status}</span></td>
                  <td>{scan.health_status || '-'}</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_files) : '-'}</td>
                  <td>{scan.metrics ? formatNumber(scan.metrics.total_lines || scan.metrics.total_lines_of_code) : '-'}</td>
                  <td>{scan.issues?.length ?? '-'}</td>
                  <td>{new Date(scan.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => navigate(`/scans/${getScanId(scan)}`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && scans.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <h3>No scans yet</h3>
                      <p>Start with any public GitHub repository URL.</p>
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
