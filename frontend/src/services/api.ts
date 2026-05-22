import axios from 'axios';
import {
  GitHubBranch,
  GitHubRepository,
  Scan,
  ScanStatus
} from '../types';

const API_BASE = 'http://localhost:8000/api/v1';

export const api = {
  async createScan(repositoryPath: string, branch = 'main') {
    const { data } = await axios.post<Scan>(`${API_BASE}/basic-scans`, {
      repository_url: repositoryPath,
      branch
    });
    return data;
  },

  async getScans(skip = 0, limit = 10) {
    const { data } = await axios.get<Scan[]>(`${API_BASE}/basic-scans`, {
      params: { skip, limit }
    });
    return data;
  },

  async getScan(scanId: string) {
    const { data } = await axios.get<Scan>(`${API_BASE}/basic-scans/${scanId}`);
    return data;
  },

  async getScanStatus(scanId: string) {
    const { data } = await axios.get<ScanStatus>(`${API_BASE}/basic-scans/${scanId}/status`);
    return data;
  },

  async getBasicScanBranches(repositoryUrl: string) {
    const { data } = await axios.get<GitHubBranch[]>(`${API_BASE}/basic-scans/branches`, {
      params: { repository_url: repositoryUrl }
    });
    return data;
  },

  async deleteScan(scanId: string) {
    await axios.delete(`${API_BASE}/basic-scans/${scanId}`);
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
