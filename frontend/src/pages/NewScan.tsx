import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { GitHubBranch, GitHubRepository, ScanStatus } from '../types';

type GitHubInput =
  | { type: 'repo'; owner: string; repo: string; htmlUrl: string }
  | { type: 'username'; username: string };

const GITHUB_USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_PROFILE_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/;
const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

const parseGitHubInput = (value: string): GitHubInput | null => {
  const trimmed = value.trim();
  const repoMatch = trimmed.match(GITHUB_REPO_URL_RE);

  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    return {
      type: 'repo',
      owner,
      repo,
      htmlUrl: `https://github.com/${owner}/${repo}`
    };
  }

  const profileMatch = trimmed.match(GITHUB_PROFILE_URL_RE);
  if (profileMatch) {
    return { type: 'username', username: profileMatch[1] };
  }

  if (GITHUB_USERNAME_RE.test(trimmed)) {
    return { type: 'username', username: trimmed };
  }

  return null;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || 'Request failed.';
  }

  return error instanceof Error ? error.message : 'Request failed.';
};

export const NewScan: React.FC = () => {
  const [githubInput, setGithubInput] = useState('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('');
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branch, setBranch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { progress } = useWebSocket(scanId);
  const navigate = useNavigate();

  const selectedRepository = useMemo(
    () => repositories.find(repo => repo.html_url === selectedRepoUrl) || null,
    [repositories, selectedRepoUrl]
  );

  const selectedRepositoryLabel = selectedRepository?.full_name || selectedRepoUrl;

  const displayProgress = useMemo(() => {
    if (progress) {
      return {
        progress: progress.progress,
        files_processed: progress.files_processed,
        files_total: progress.files_total,
        current_file: progress.current_file
      };
    }

    return scanStatus;
  }, [progress, scanStatus]);

  useEffect(() => {
    if (!selectedRepository) {
      return;
    }

    loadBranchesFromRepoUrl(selectedRepository.html_url, selectedRepository.default_branch);
  }, [selectedRepository?.html_url]);

  useEffect(() => {
    if (!scanId || scanStatus?.status === 'completed' || scanStatus?.status === 'failed') {
      return;
    }

    let cancelled = false;

    const loadStatus = async () => {
      try {
        const nextStatus = await api.getScanStatus(scanId);
        if (!cancelled) {
          setScanStatus(nextStatus);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError('Unable to refresh scan status.');
        }
      }
    };

    loadStatus();
    const interval = window.setInterval(loadStatus, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scanId, scanStatus?.status]);

  const loadBranchesFromRepoUrl = async (repoUrl: string, preferredBranch?: string) => {
    const parsed = parseGitHubInput(repoUrl);
    if (!parsed || parsed.type !== 'repo') {
      setError('Enter a valid public GitHub repository URL.');
      return;
    }

    setLoadingBranches(true);
    setError(null);

    try {
      const nextBranches = await api.getGitHubBranches(parsed.owner, parsed.repo);
      setBranches(nextBranches);

      const nextBranch =
        nextBranches.find(item => item.name === preferredBranch)?.name ||
        nextBranches.find(item => item.name === 'main')?.name ||
        nextBranches.find(item => item.name === 'master')?.name ||
        nextBranches[0]?.name ||
        '';

      setBranch(nextBranch);
      setSelectedRepoUrl(parsed.htmlUrl);
    } catch (requestError) {
      setBranches([]);
      setBranch('');
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRepositories([]);
    setSelectedRepoUrl('');
    setBranches([]);
    setBranch('');

    const parsed = parseGitHubInput(githubInput);
    if (!parsed) {
      setError('Use a public GitHub username, profile URL, or repository URL like https://github.com/owner/repo.');
      return;
    }

    if (parsed.type === 'repo') {
      await loadBranchesFromRepoUrl(parsed.htmlUrl);
      return;
    }

    setLoadingRepos(true);

    try {
      const publicRepos = await api.getGitHubRepositories(parsed.username);
      setRepositories(publicRepos);

      if (publicRepos.length === 0) {
        setError('No public repositories found for this GitHub username.');
        return;
      }

      setSelectedRepoUrl(publicRepos[0].html_url);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRepoUrl || !branch) {
      setError('Choose a public repository and branch before starting the scan.');
      return;
    }

    setScanning(true);
    setError(null);
    setScanStatus(null);

    try {
      const result = await api.createScan(selectedRepoUrl, branch);
      setScanId(result.scan_id);
    } catch (requestError) {
      setError('Failed to create scan: ' + getErrorMessage(requestError));
      setScanning(false);
    }
  };

  return (
    <div className="new-scan">
      <h1>Create New Scan</h1>

      {!scanning ? (
        <>
          <form onSubmit={handleLookup}>
            <div className="form-group">
              <label>Public GitHub Username or Repository URL</label>
              <input
                type="text"
                value={githubInput}
                onChange={(e) => setGithubInput(e.target.value)}
                placeholder="octocat, https://github.com/octocat, or https://github.com/owner/repo"
                required
              />
              <p className="help-text">
                Only public GitHub users and repositories are supported.
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={loadingRepos || loadingBranches}>
              {loadingRepos || loadingBranches ? 'Checking GitHub...' : 'Find Branches'}
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}

          {(repositories.length > 0 || selectedRepoUrl) && (
            <form onSubmit={handleSubmit} className="scan-options-form">
              {repositories.length > 0 && (
                <div className="form-group">
                  <label>Public Repository</label>
                  <select
                    value={selectedRepoUrl}
                    onChange={(e) => setSelectedRepoUrl(e.target.value)}
                    required
                  >
                    {repositories.map(repo => (
                      <option key={repo.html_url} value={repo.html_url}>
                        {repo.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Branch</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={loadingBranches || branches.length === 0}
                  required
                >
                  {branches.map(item => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="selected-repo">
                <strong>Repository:</strong> {selectedRepositoryLabel}
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={!selectedRepoUrl || !branch || loadingBranches}
              >
                Start Scan
              </button>
            </form>
          )}
        </>
      ) : (
        <div className="scan-progress">
          <h2>
            {scanStatus?.status === 'completed'
              ? 'Scan Completed'
              : scanStatus?.status === 'failed'
                ? 'Scan Failed'
                : 'Scanning in Progress...'}
          </h2>

          <p>{selectedRepositoryLabel} ({branch})</p>
          {scanId && <p className="scan-id">Scan ID: {scanId}</p>}
          {error && <p className="error-message">{error}</p>}

          {displayProgress ? (
            <>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${displayProgress.progress}%` }}
                />
              </div>

              <div className="progress-info">
                <p>
                  <strong>{displayProgress.progress.toFixed(1)}%</strong> complete
                </p>
                <p>
                  {displayProgress.files_processed} / {displayProgress.files_total} files processed
                </p>
                {displayProgress.current_file && (
                  <p className="current-file">
                    Current: {displayProgress.current_file}
                  </p>
                )}
              </div>

              {scanStatus?.status === 'failed' && (
                <p className="error-message">
                  {scanStatus.error_message || 'The scan failed.'}
                </p>
              )}

              {scanStatus?.status === 'completed' && (
                <button
                  onClick={() => navigate(`/scans/${scanId}`)}
                  className="btn-primary"
                >
                  View Results
                </button>
              )}
            </>
          ) : (
            <p>Waiting for worker...</p>
          )}
        </div>
      )}
    </div>
  );
};
