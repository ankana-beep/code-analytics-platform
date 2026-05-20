import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { SavedRepository, Scan, ScanComparison } from '../types';

const getRepositoryId = (repository: SavedRepository) => repository.id || repository._id || '';
const getScanId = (scan: Scan) => scan.id || scan._id || '';
const splitList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || 'Request failed.';
  }

  return error instanceof Error ? error.message : 'Request failed.';
};

export const Repositories: React.FC = () => {
  const [repositories, setRepositories] = useState<SavedRepository[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState('');
  const [historyBranch, setHistoryBranch] = useState('');
  const [scans, setScans] = useState<Scan[]>([]);
  const [baseScanId, setBaseScanId] = useState('');
  const [targetScanId, setTargetScanId] = useState('');
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    repository_path: '',
    default_branch: 'main',
    team_name: '',
    labels: '',
    tags: ''
  });
  const navigate = useNavigate();

  const selectedRepository = useMemo(
    () => repositories.find(repository => getRepositoryId(repository) === selectedRepositoryId) || null,
    [repositories, selectedRepositoryId]
  );

  const completedScans = scans.filter(scan => scan.status === 'completed' && scan.metrics);

  useEffect(() => {
    loadRepositories();
  }, []);

  useEffect(() => {
    if (selectedRepositoryId) {
      loadHistory(selectedRepositoryId, historyBranch);
    } else {
      setScans([]);
    }
  }, [selectedRepositoryId, historyBranch]);

  useEffect(() => {
    setComparison(null);
    const [first, second] = completedScans;
    setBaseScanId(first ? getScanId(first) : '');
    setTargetScanId(second ? getScanId(second) : '');
  }, [selectedRepositoryId, scans.length]);

  const loadRepositories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSavedRepositories();
      setRepositories(data);
      if (!selectedRepositoryId && data.length) {
        setSelectedRepositoryId(getRepositoryId(data[0]));
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async (repositoryId: string, branch?: string) => {
    setError(null);
    try {
      const data = await api.getSavedRepositoryScans(repositoryId, branch || undefined);
      setScans(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const handleSaveRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createSavedRepository({
        name: form.name,
        repository_path: form.repository_path,
        default_branch: form.default_branch || 'main',
        team_name: form.team_name || undefined,
        labels: splitList(form.labels),
        tags: splitList(form.tags)
      });
      setForm({ name: '', repository_path: '', default_branch: 'main', team_name: '', labels: '', tags: '' });
      await loadRepositories();
      setSelectedRepositoryId(getRepositoryId(created));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const handleDeleteRepository = async (repository: SavedRepository) => {
    const repositoryId = getRepositoryId(repository);
    if (!repositoryId || !window.confirm(`Delete saved repository ${repository.name}? Scan history will remain available in Recent Scans.`)) {
      return;
    }

    setError(null);
    try {
      await api.deleteSavedRepository(repositoryId);
      setSelectedRepositoryId('');
      await loadRepositories();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const handleStartScan = async (repository: SavedRepository) => {
    setError(null);
    try {
      const result = await api.scanSavedRepository(repository, historyBranch || repository.default_branch);
      navigate(`/scans/${result.scan_id}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const handleCompare = async () => {
    if (!baseScanId || !targetScanId || baseScanId === targetScanId) {
      setError('Choose two different completed scans to compare.');
      return;
    }

    setError(null);
    try {
      const data = await api.compareScans(baseScanId, targetScanId);
      setComparison(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <div className="repositories-page">
      <h1>Saved Repositories</h1>

      <div className="repository-layout">
        <form onSubmit={handleSaveRepository} className="repository-form">
          <div className="form-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Frontend App"
              required
            />
          </div>
          <div className="form-group">
            <label>Repository URL</label>
            <input
              value={form.repository_path}
              onChange={(e) => setForm({ ...form, repository_path: e.target.value })}
              placeholder="https://github.com/owner/repo"
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Default Branch</label>
              <input
                value={form.default_branch}
                onChange={(e) => setForm({ ...form, default_branch: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Team</label>
              <input
                value={form.team_name}
                onChange={(e) => setForm({ ...form, team_name: e.target.value })}
                placeholder="Platform"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Labels</label>
            <input
              value={form.labels}
              onChange={(e) => setForm({ ...form, labels: e.target.value })}
              placeholder="critical, customer-facing"
            />
          </div>
          <div className="form-group">
            <label>Tags</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="react, api"
            />
          </div>
          <button type="submit" className="btn-primary">Save Repository</button>
        </form>

        <section className="repository-list">
          {repositories.map(repository => {
            const repositoryId = getRepositoryId(repository);
            return (
              <article
                key={repositoryId}
                className={`repository-item ${selectedRepositoryId === repositoryId ? 'active' : ''}`}
              >
                <button type="button" onClick={() => setSelectedRepositoryId(repositoryId)}>
                  <strong>{repository.name}</strong>
                  <span>{repository.repository_path}</span>
                </button>
                <div className="tag-row">
                  {repository.team_name && <span className="tag">Team: {repository.team_name}</span>}
                  {repository.labels.map(label => <span className="tag" key={label}>{label}</span>)}
                  {repository.tags.map(tag => <span className="tag muted" key={tag}>{tag}</span>)}
                </div>
                <div className="table-actions">
                  <button type="button" onClick={() => handleStartScan(repository)}>Scan</button>
                  <button type="button" className="btn-danger" onClick={() => handleDeleteRepository(repository)}>
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {!isLoading && repositories.length === 0 && <p>No saved repositories yet.</p>}
        </section>
      </div>

      {error && <p className="error-message">{error}</p>}

      {selectedRepository && (
        <section className="history-section">
          <div className="section-header">
            <div>
              <h2>Branch / Commit Scan History</h2>
              <p>{selectedRepository.name}</p>
            </div>
            <div className="pagination-controls">
              <input
                value={historyBranch}
                onChange={(e) => setHistoryBranch(e.target.value)}
                placeholder={`Branch or commit, e.g. ${selectedRepository.default_branch}`}
              />
              <button type="button" onClick={() => handleStartScan(selectedRepository)}>
                Scan Branch
              </button>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Status</th>
                <th>Files</th>
                <th>LOC</th>
                <th>Complexity</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scans.map(scan => {
                const scanId = getScanId(scan);
                return (
                  <tr key={scanId}>
                    <td>{scan.branch}</td>
                    <td><span className={`status ${scan.status}`}>{scan.status}</span></td>
                    <td>{scan.metrics ? formatNumber(scan.metrics.total_files) : '-'}</td>
                    <td>{scan.metrics ? formatNumber(scan.metrics.total_lines_of_code) : '-'}</td>
                    <td>{scan.metrics ? scan.metrics.complexity_metrics.avg_cyclomatic_complexity.toFixed(1) : '-'}</td>
                    <td>{new Date(scan.created_at).toLocaleString()}</td>
                    <td>
                      <button type="button" onClick={() => navigate(`/scans/${scanId}`)} disabled={!scanId}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {scans.length === 0 && (
                <tr>
                  <td colSpan={7}>No scan history for this repository.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="compare-panel">
            <h2>Compare Scans</h2>
            <div className="compare-controls">
              <select value={baseScanId} onChange={(e) => setBaseScanId(e.target.value)}>
                <option value="">Base scan</option>
                {completedScans.map(scan => (
                  <option key={getScanId(scan)} value={getScanId(scan)}>
                    {scan.branch} - {new Date(scan.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
              <select value={targetScanId} onChange={(e) => setTargetScanId(e.target.value)}>
                <option value="">Target scan</option>
                {completedScans.map(scan => (
                  <option key={getScanId(scan)} value={getScanId(scan)}>
                    {scan.branch} - {new Date(scan.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-primary" onClick={handleCompare}>
                Compare
              </button>
            </div>

            {comparison && (
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Base</th>
                    <th>Target</th>
                    <th>Delta</th>
                    <th>Delta %</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.metrics.map(metric => (
                    <tr key={metric.metric}>
                      <td>{metric.metric}</td>
                      <td>{formatNumber(metric.base_value)}</td>
                      <td>{formatNumber(metric.target_value)}</td>
                      <td className={metric.delta > 0 ? 'delta-up' : metric.delta < 0 ? 'delta-down' : ''}>
                        {formatNumber(metric.delta)}
                      </td>
                      <td>{metric.delta_percent == null ? '-' : `${formatNumber(metric.delta_percent)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
