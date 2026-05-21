import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { GitHubBranch } from '../types';

const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/;

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || 'Request failed.';
  }

  return error instanceof Error ? error.message : 'Request failed.';
};

export const NewScan: React.FC = () => {
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branch, setBranch] = useState('');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const normalizedUrl = useMemo(() => repositoryUrl.trim().replace(/\.git\/?$/, ''), [repositoryUrl]);
  const isValidRepositoryUrl = GITHUB_REPO_URL_RE.test(repositoryUrl.trim());

  useEffect(() => {
    if (!repositoryUrl.trim()) {
      setBranches([]);
      setBranch('');
      setError(null);
      return;
    }

    if (!isValidRepositoryUrl) {
      setBranches([]);
      setBranch('');
      return;
    }

    let cancelled = false;

    const loadBranches = async () => {
      setIsLoadingBranches(true);
      setError(null);

      try {
        const nextBranches = await api.getBasicScanBranches(normalizedUrl);
        if (cancelled) return;

        setBranches(nextBranches);
        setBranch(
          nextBranches.find(item => item.name === 'main')?.name ||
          nextBranches.find(item => item.name === 'master')?.name ||
          nextBranches[0]?.name ||
          ''
        );
      } catch (requestError) {
        if (cancelled) return;
        setBranches([]);
        setBranch('');
        setError(getErrorMessage(requestError));
      } finally {
        if (!cancelled) {
          setIsLoadingBranches(false);
        }
      }
    };

    const timeout = window.setTimeout(loadBranches, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isValidRepositoryUrl, normalizedUrl, repositoryUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidRepositoryUrl) {
      setError('Enter a valid public GitHub repository URL like https://github.com/owner/repo.');
      return;
    }

    if (!branch) {
      setError('Select a branch before starting the scan.');
      return;
    }

    setError(null);
    setIsScanning(true);

    try {
      const scan = await api.createScan(normalizedUrl, branch);
      navigate(`/scans/${scan.id || scan._id}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="new-scan foundation-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Foundation Scan</p>
          <h1>Scan a Public GitHub Repository</h1>
          <p className="dashboard-subtitle">
            Enter a public repository URL and get a code health report with size, line, issue, and dependency signals.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="foundation-form">
        <div className="form-group">
          <label>GitHub Repository URL</label>
          <input
            type="url"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            required
          />
          {isLoadingBranches && <p className="help-text">Loading branches...</p>}
        </div>

        <div className="form-group">
          <label>Branch</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={!branches.length || isLoadingBranches || isScanning}
            required
          >
            <option value="">
              {isLoadingBranches ? 'Loading branches...' : 'Select a branch'}
            </option>
            {branches.map(item => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="help-text">
            Branches load automatically after a valid public GitHub repository URL is pasted.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={isScanning || isLoadingBranches || !branch}>
          {isScanning ? 'Scanning Repository...' : 'Start Scan'}
        </button>

        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
};
