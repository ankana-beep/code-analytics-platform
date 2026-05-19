import axios from 'axios';
import { GitHubBranch, GitHubRepository, Scan, ScanStatus, FileMetric } from '../types';

const API_BASE = 'http://localhost:8000/api/v1';

export const api = {
  async createScan(repositoryPath: string, branch = 'main') {
    const { data } = await axios.post(`${API_BASE}/scans`, {
      repository_path: repositoryPath,
      branch
    });
    return data;
  },

  async getScans(skip = 0, limit = 10) {
    const { data } = await axios.get<Scan[]>(`${API_BASE}/scans`, {
      params: { skip, limit }
    });
    return data;
  },

  async getScan(scanId: string) {
    const { data } = await axios.get<Scan>(`${API_BASE}/scans/${scanId}`);
    return data;
  },

  async getScanStatus(scanId: string) {
    const { data } = await axios.get<ScanStatus>(`${API_BASE}/scans/${scanId}/status`);
    return data;
  },

  async getScanFiles(scanId: string, skip = 0, limit = 100) {
    const { data } = await axios.get<FileMetric[]>(
      `${API_BASE}/scans/${scanId}/files`,
      { params: { skip, limit } }
    );
    return data;
  },

  async getHealth() {
    const { data } = await axios.get(`${API_BASE}/health`);
    return data;
  },

  async getGitHubRepositories(username: string) {
    const { data } = await axios.get<GitHubRepository[]>(
      `${API_BASE}/github/users/${encodeURIComponent(username)}/repositories`
    );
    return data;
  },

  async getGitHubBranches(owner: string, repo: string) {
    const { data } = await axios.get<GitHubBranch[]>(
      `${API_BASE}/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`
    );
    return data;
  }
};

export const createWebSocket = (scanId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/ws/scans/${scanId}/progress`);
};
