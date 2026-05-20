import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Scan } from '../types';

const formatNumber = (value: number) => value.toLocaleString();

export const SharedReport: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getSharedReport(token)
      .then(setScan)
      .catch(() => setError('Shared report was not found or is no longer available.'));
  }, [token]);

  if (error) {
    return (
      <div className="shared-report">
        <div className="empty-state">
          <h1>Report unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="shared-report">
        <p>Loading shared report...</p>
      </div>
    );
  }

  if (!scan.metrics) {
    return (
      <div className="shared-report">
        <h1>Shared Scan Report</h1>
        <p>{scan.repository_path} ({scan.branch})</p>
        <span className={`status ${scan.status}`}>{scan.status}</span>
      </div>
    );
  }

  const metrics = scan.metrics;

  return (
    <div className="shared-report">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Shared Report</p>
          <h1>{scan.repository_path.split('/').pop()}</h1>
          <p className="dashboard-subtitle">{scan.repository_path} ({scan.branch})</p>
        </div>
        <span className={`status ${scan.status}`}>{scan.status}</span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card"><h3>{formatNumber(metrics.total_files)}</h3><p>Total Files</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.total_lines_of_code)}</h3><p>Lines of Code</p></div>
        <div className="metric-card"><h3>{metrics.docstring_coverage.toFixed(1)}%</h3><p>Docs</p></div>
        <div className="metric-card"><h3>{metrics.complexity_metrics.avg_cyclomatic_complexity.toFixed(1)}</h3><p>Avg Complexity</p></div>
        <div className="metric-card"><h3>{metrics.todo_count + metrics.fixme_count}</h3><p>Open Markers</p></div>
        <div className="metric-card"><h3>{metrics.dependencies.length}</h3><p>Dependencies</p></div>
      </div>

      <section className="panel">
        <h2>Executive Notes</h2>
        <p>
          This report summarizes the completed scan for {scan.repository_path}. It includes the main
          quality indicators, code volume, maintainability signals, and issue markers captured at scan time.
        </p>
      </section>
    </div>
  );
};
