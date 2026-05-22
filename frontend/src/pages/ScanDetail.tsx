import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { api } from '../services/api';
import { Scan } from '../types';

const COLORS = ['#2563eb', '#0f766e', '#b7791f', '#9b59b6', '#e74c3c', '#1abc9c'];
const ISSUES_PAGE_SIZE = 10;
const formatNumber = (value: number) => value.toLocaleString();

export const ScanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuesPage, setIssuesPage] = useState(1);

  useEffect(() => {
    if (!id) return;
    api.getScan(id)
      .then(setScan)
      .catch(() => setError('Scan report was not found in memory. Run a new scan to recreate it.'));
  }, [id]);

  if (error) return <p className="error-message">{error}</p>;
  if (!scan || !scan.metrics) return <div>Loading...</div>;

  const { metrics } = scan;
  const lineData = [
    { name: 'Code', value: metrics.code_lines || metrics.total_lines_of_code },
    { name: 'Comments', value: metrics.comment_lines || metrics.total_comment_lines },
    { name: 'Blank', value: metrics.blank_lines || metrics.total_blank_lines }
  ];
  const fileTypeData = Object.entries(metrics.file_types || {})
    .map(([type, count]) => ({ type: type || 'No extension', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const issues = scan.issues || [];
  const totalIssuePages = Math.max(1, Math.ceil(issues.length / ISSUES_PAGE_SIZE));
  const issuePageStart = (issuesPage - 1) * ISSUES_PAGE_SIZE;
  const visibleIssues = issues.slice(issuePageStart, issuePageStart + ISSUES_PAGE_SIZE);
  const dependencySummary = scan.dependency_summary;
  const managerReport = scan.manager_report;

  const changeIssuesPage = (nextPage: number) => {
    setIssuesPage(Math.min(Math.max(nextPage, 1), totalIssuePages));
  };

  return (
    <div className="scan-detail">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Basic Code Health Report</p>
          <h1>{scan.repository_name || scan.repository_path}</h1>
          <p>{scan.repository_path} ({scan.branch})</p>
        </div>
      </div>

      <section className="panel report-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Summary</p>
            <h2>Repository Health</h2>
          </div>
          <span className="panel-meta">Scanned {new Date(scan.created_at).toLocaleString()}</span>
        </div>
        <p>
          This scan analyzed {formatNumber(metrics.total_files)} supported files across {formatNumber(metrics.total_folders || 0)} folders,
          finding {formatNumber(issues.length)} quality signals and {formatNumber(dependencySummary?.possibly_unused.length || 0)} possibly unused dependencies.
        </p>
      </section>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>{typeof scan.health_score === 'number' ? `${scan.health_score}%` : '-'}</h3>
          <p>Health Status</p>
        </div>
        <div className="metric-card"><h3>{formatNumber(metrics.total_files)}</h3><p>Total Files</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.total_folders || 0)}</h3><p>Total Folders</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.total_lines || 0)}</h3><p>Total Lines</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.code_lines || metrics.total_lines_of_code)}</h3><p>Code Lines</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.comment_lines || metrics.total_comment_lines)}</h3><p>Comment Lines</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.blank_lines || metrics.total_blank_lines)}</h3><p>Blank Lines</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.todo_count + metrics.fixme_count)}</h3><p>TODO / FIXME</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.console_logs || 0)}</h3><p>Console Logs</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.debugger_statements || 0)}</h3><p>Debuggers</p></div>
        <div className="metric-card"><h3>{formatNumber(metrics.commented_out_code || 0)}</h3><p>Commented Code</p></div>
      </div>

      {managerReport && (
        <section className="panel manager-report">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Manager View</p>
              <h2>Risk, Debt, and Release Readiness</h2>
            </div>
            <div className={`readiness-badge ${managerReport.release_readiness.status.toLowerCase().replace(/\s/g, '-')}`}>
              <strong>{managerReport.release_readiness.percentage}%</strong>
              <span>{managerReport.release_readiness.status}</span>
            </div>
          </div>

          <div className="manager-grid">
            <div className="manager-card readiness-card">
              <h3>Release Readiness</h3>
              <div className="readiness-meter" aria-label={`Release readiness ${managerReport.release_readiness.percentage}%`}>
                <span style={{ width: `${managerReport.release_readiness.percentage}%` }} />
              </div>
              <ul className="compact-list">
                {managerReport.release_readiness.blocking_issues.map(issue => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>

            <div className="manager-card debt-card">
              <div className="card-title-row">
                <h3>Technical Debt Estimate</h3>
                <span
                  className="info-tooltip"
                  tabIndex={0}
                  aria-label="Technical debt estimates cleanup effort from large files, long functions, TODOs, debug statements, commented-out code, and unused dependency signals."
                >
                  i
                  <span className="tooltip-content" role="tooltip">
                    Estimated cleanup effort based on complexity signals, TODOs, debug statements, commented-out code, and dependency cleanup.
                  </span>
                </span>
              </div>
              <strong>{managerReport.technical_debt.estimated_hours} hours</strong>
              <div className="debt-breakdown">
                <span>High: {managerReport.technical_debt.high_priority_hours}h</span>
                <span>Medium: {managerReport.technical_debt.medium_priority_hours}h</span>
                <span>Low: {managerReport.technical_debt.low_priority_hours}h</span>
              </div>
              <p>{managerReport.technical_debt.debt_trend}</p>
            </div>
          </div>

          <div className="risk-category-grid">
            {managerReport.risk_categories.map(category => (
              <div className="risk-category-card" key={category.name}>
                <div>
                  <span className={`risk-pill ${category.level.toLowerCase()}`}>{category.level}</span>
                  <h3>{category.name}</h3>
                </div>
                <strong>{category.score}</strong>
                <p>{category.reason}</p>
              </div>
            ))}
          </div>

          <div className="manager-grid lower">
            <div className="manager-card">
              <h3>Top Risky Modules</h3>
              <div className="module-list">
                {managerReport.top_risky_modules.map((item, index) => (
                  <div className="module-row" key={item.module}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item.module}</strong>
                      <p>Risk: {item.risk} - {item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="manager-card">
              <h3>Debt by Module</h3>
              <div className="module-list">
                {managerReport.technical_debt.debt_by_module.map(item => (
                  <div className="debt-row" key={item.module}>
                    <span>{item.module}</span>
                    <strong>{item.hours}h</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="chart-row">
        <div className="chart-container">
          <h2>Line Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={lineData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {lineData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h2>File Type Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fileTypeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--chart-blue)" name="Files" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Largest Files</p>
            <h2>Files by Line Count</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Total</th>
                <th>Code</th>
                <th>Comments</th>
                <th>Blank</th>
                <th>TODOs</th>
              </tr>
            </thead>
            <tbody>
              {(metrics.largest_files || []).map(file => (
                <tr key={file.path}>
                  <td className="repository-cell">{file.path}</td>
                  <td>{file.total_lines}</td>
                  <td>{file.code_lines}</td>
                  <td>{file.comment_lines}</td>
                  <td>{file.blank_lines}</td>
                  <td>{file.todo_count + file.fixme_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Issues</p>
            <h2>Quality Checks</h2>
            <p>
              Showing {issues.length ? issuePageStart + 1 : 0}
              {' - '}
              {Math.min(issuePageStart + ISSUES_PAGE_SIZE, issues.length)}
              {' '}of {issues.length}
            </p>
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              onClick={() => changeIssuesPage(issuesPage - 1)}
              disabled={issuesPage === 1}
            >
              Previous
            </button>
            <span>Page {issuesPage} of {totalIssuePages}</span>
            <button
              type="button"
              onClick={() => changeIssuesPage(issuesPage + 1)}
              disabled={issuesPage === totalIssuePages}
            >
              Next
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>File</th>
                <th>Line</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map((issue, index) => (
                <tr key={`${issue.file}-${issue.line}-${index}`}>
                  <td><span className={`issue-severity ${issue.severity}`}>{issue.severity}</span></td>
                  <td>{issue.type.replace(/_/g, ' ')}</td>
                  <td className="repository-cell">{issue.file}</td>
                  <td>{issue.line || '-'}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr><td colSpan={5}>No basic quality issues detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel dependencies-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Dependencies</p>
            <h2>package.json Summary</h2>
          </div>
        </div>
        {dependencySummary?.has_package_json ? (
          <>
            <div className="metrics-grid compact">
              <div className="metric-card"><h3>{dependencySummary.total_dependencies}</h3><p>Dependencies</p></div>
              <div className="metric-card"><h3>{dependencySummary.total_dev_dependencies}</h3><p>Dev Dependencies</p></div>
              <div className="metric-card"><h3>{dependencySummary.possibly_unused.length}</h3><p>Possibly Unused</p></div>
            </div>
            <p className="dependency-list">
              <strong>Dependencies:</strong> {dependencySummary.dependencies.join(', ') || 'None'}
            </p>
            <p className="dependency-list">
              <strong>Dev dependencies:</strong> {dependencySummary.dev_dependencies.join(', ') || 'None'}
            </p>
            <p className="dependency-list">
              <strong>Possibly unused:</strong> {dependencySummary.possibly_unused.join(', ') || 'None detected'}
            </p>
          </>
        ) : (
          <p>No package.json file was found.</p>
        )}
      </section>

      <section className="panel suggestions-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Suggestions</p>
            <h2>Next Improvements</h2>
          </div>
        </div>
        <ul className="suggestion-list">
          {(scan.suggestions || []).map(suggestion => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
