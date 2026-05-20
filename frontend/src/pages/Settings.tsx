import React, { useState } from 'react';
import { api } from '../services/api';
import { AuthUser } from '../types';

interface SettingsProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
}

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || 'Update failed.';
  }

  return error instanceof Error ? error.message : 'Update failed.';
};

export const Settings: React.FC<SettingsProps> = ({ user, onUserUpdated }) => {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setToast(null);

    try {
      const updated = await api.updateMe({ full_name: fullName || undefined });
      onUserUpdated(updated);
      setToast('Profile settings updated.');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>User Settings</h1>
      <div className="settings-layout">
        <form onSubmit={saveProfile}>
          <div className="form-group">
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <div className="form-group">
            <label>Display Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>

        <section className="panel">
          <p className="eyebrow">Account</p>
          <h2>Profile Details</h2>
          <div className="ops-list">
            <div className="ops-row">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div className="ops-row">
              <span>Name</span>
              <strong>{user.full_name || '-'}</strong>
            </div>
          </div>
        </section>
      </div>

      {toast && <div className="toast success">{toast}</div>}
    </div>
  );
};
