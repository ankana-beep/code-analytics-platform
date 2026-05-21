import axios from 'axios';
import {
  AuthResponse,
  AuthUser,
  ExecutiveSummary,
  GitHubBranch,
  GitHubRepository,
  Scan,
  ScanComparison,
  ScanStatus,
  FileMetric,
  ShareReportResponse,
  SavedRepository
} from '../types';

const API_BASE = 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'auth_token';

axios.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const setAuthToken = (token: string) => {
  window.localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  window.localStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => window.localStorage.getItem(TOKEN_KEY);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const filenameFromDisposition = (disposition: string | undefined, fallback: string) => {
  const match = disposition?.match(/filename="?(?<filename>[^";]+)"?/);
  return match?.groups?.filename || fallback;
};

export const api = {
  async register(email: string, password: string, fullName?: string) {
    const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/register`, {
      email,
      password,
      full_name: fullName || undefined
    });
    setAuthToken(data.access_token);
    return data;
  },

  async login(email: string, password: string) {
    const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/login`, {
      email,
      password
    });
    setAuthToken(data.access_token);
    return data;
  },

  async logout() {
    await axios.post(`${API_BASE}/auth/logout`);
    clearAuthToken();
  },

  async getMe() {
    const { data } = await axios.get<AuthUser>(`${API_BASE}/auth/me`);
    return data;
  },

  async updateMe(input: { full_name?: string }) {
    const { data } = await axios.patch<AuthUser>(`${API_BASE}/auth/me`, input);
    return data;
  },

  async createScan(repositoryPath: string, branch = 'main', savedRepositoryId?: string) {
    const { data } = await axios.post<Scan>(`${API_BASE}/basic-scans`, {
      repository_url: repositoryPath,
      branch,
      saved_repository_id: savedRepositoryId
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
    await axios.delete(`${API_BASE}/scans/${scanId}`);
  },

  async getScanFiles(scanId: string, skip = 0, limit = 100) {
    const { data } = await axios.get<FileMetric[]>(
      `${API_BASE}/scans/${scanId}/files`,
      { params: { skip, limit } }
    );
    return data;
  },

  async compareScans(baseScanId: string, targetScanId: string) {
    const { data } = await axios.get<ScanComparison>(`${API_BASE}/scans/compare`, {
      params: {
        base_scan_id: baseScanId,
        target_scan_id: targetScanId
      }
    });
    return data;
  },

  async getExecutiveSummary() {
    const { data } = await axios.get<ExecutiveSummary>(`${API_BASE}/reports/executive-summary`);
    return data;
  },

  async exportScan(scanId: string, format: 'csv' | 'pdf') {
    const response = await axios.get<Blob>(`${API_BASE}/reports/scans/${scanId}/export.${format}`, {
      responseType: 'blob'
    });
    downloadBlob(
      response.data,
      filenameFromDisposition(response.headers['content-disposition'], `scan-${scanId}.${format}`)
    );
  },

  async createShareReport(scanId: string) {
    const { data } = await axios.post<ShareReportResponse>(`${API_BASE}/reports/scans/${scanId}/share`);
    return data;
  },

  async getSharedReport(shareToken: string) {
    const { data } = await axios.get<Scan>(`${API_BASE}/reports/share/${shareToken}`);
    return data;
  },

  async getSavedRepositories(params?: { team_name?: string; tag?: string; label?: string }) {
    const { data } = await axios.get<SavedRepository[]>(`${API_BASE}/repositories`, { params });
    return data;
  },

  async createSavedRepository(input: {
    name: string;
    repository_path: string;
    default_branch?: string;
    team_name?: string;
    labels?: string[];
    tags?: string[];
  }) {
    const { data } = await axios.post<SavedRepository>(`${API_BASE}/repositories`, input);
    return data;
  },

  async updateSavedRepository(repositoryId: string, input: Partial<{
    name: string;
    repository_path: string;
    default_branch: string;
    team_name: string;
    labels: string[];
    tags: string[];
  }>) {
    const { data } = await axios.patch<SavedRepository>(`${API_BASE}/repositories/${repositoryId}`, input);
    return data;
  },

  async deleteSavedRepository(repositoryId: string) {
    await axios.delete(`${API_BASE}/repositories/${repositoryId}`);
  },

  async getSavedRepositoryScans(repositoryId: string, branch?: string) {
    const { data } = await axios.get<Scan[]>(`${API_BASE}/repositories/${repositoryId}/scans`, {
      params: { branch: branch || undefined }
    });
    return data;
  },

  async scanSavedRepository(repository: SavedRepository, branch?: string) {
    const { data } = await axios.post(`${API_BASE}/repositories/${repository.id || repository._id}/scans`, {
      repository_path: repository.repository_path,
      branch: branch || repository.default_branch,
      saved_repository_id: repository.id || repository._id
    });
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
