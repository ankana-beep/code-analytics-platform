import React from 'react';

type TimelineStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface ScanProgressTimelineProps {
  status?: TimelineStatus;
  progress: number;
  filesProcessed: number;
  filesTotal: number;
  currentFile?: string;
  errorMessage?: string;
}

const steps = [
  { key: 'queued', label: 'Queued', threshold: 0 },
  { key: 'discovering', label: 'Discovering Files', threshold: 1 },
  { key: 'analyzing', label: 'Analyzing Code', threshold: 10 },
  { key: 'finalizing', label: 'Finalizing Metrics', threshold: 90 },
  { key: 'completed', label: 'Complete', threshold: 100 }
];

const getStepState = (
  step: typeof steps[number],
  status: TimelineStatus | undefined,
  progress: number
) => {
  if (status === 'failed' || status === 'cancelled') {
    return progress >= step.threshold ? 'complete' : 'pending';
  }

  if (status === 'completed') {
    return 'complete';
  }

  if (progress >= step.threshold && progress < 100) {
    const nextStep = steps[steps.findIndex(item => item.key === step.key) + 1];
    if (!nextStep || progress < nextStep.threshold) {
      return 'active';
    }
    return 'complete';
  }

  return progress >= step.threshold ? 'complete' : 'pending';
};

export const ScanProgressTimeline: React.FC<ScanProgressTimelineProps> = ({
  status = 'queued',
  progress,
  filesProcessed,
  filesTotal,
  currentFile,
  errorMessage
}) => {
  const boundedProgress = Math.max(0, Math.min(progress || 0, 100));

  return (
    <div className="progress-timeline-card">
      <div className="progress-summary">
        <div>
          <p className="eyebrow">Scan Timeline</p>
          <h2>{status === 'completed' ? 'Scan Completed' : status === 'failed' ? 'Scan Failed' : 'Scan In Progress'}</h2>
        </div>
        <strong>{boundedProgress.toFixed(1)}%</strong>
      </div>

      <div className="progress-bar timeline-progress">
        <div className="progress-fill" style={{ width: `${boundedProgress}%` }} />
      </div>

      <ol className="timeline-steps">
        {steps.map(step => (
          <li key={step.key} className={getStepState(step, status, boundedProgress)}>
            <span />
            <p>{step.label}</p>
          </li>
        ))}
      </ol>

      <div className="timeline-meta">
        <div>
          <span>Files</span>
          <strong>{filesProcessed} / {filesTotal || '-'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </div>

      {currentFile && (
        <p className="current-file">
          Current: {currentFile}
        </p>
      )}

      {errorMessage && <p className="error-message">{errorMessage}</p>}
    </div>
  );
};
