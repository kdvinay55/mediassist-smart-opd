import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import assistantRuntime from './AssistantRuntime';
import { ASSISTANT_STATUS_EVENT_NAME } from './config';

function formatSummary(status) {
  if (status.startupChecking) {
    return {
      label: 'Checking assistant',
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
      Icon: RefreshCw,
      detail: status.statusMessage || 'Running startup verification'
    };
  }

  if (!status.voiceInputEnabled) {
    return {
      label: 'Mic blocked',
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: AlertTriangle,
      detail: status.statusMessage || 'Microphone permission is denied'
    };
  }

  if (status.recovering) {
    return {
      label: 'Recovering',
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: RefreshCw,
      detail: status.statusMessage || 'Automatic recovery in progress'
    };
  }

  if (status.demoModeActive) {
    return {
      label: 'Demo mode',
      tone: 'text-violet-700 bg-violet-50 border-violet-200',
      Icon: Activity,
      detail: status.statusMessage || 'Using expo-safe local fallback logic'
    };
  }

  if (!status.assistantEnabled || status.microphonePermission === 'denied') {
    return {
      label: 'Assistant offline',
      tone: 'text-red-700 bg-red-50 border-red-200',
      Icon: WifiOff,
      detail: status.statusMessage || 'Startup verification or microphone permission failed'
    };
  }

  if ((status.latencyAlerts || []).length > 0) {
    const latest = status.latencyAlerts[status.latencyAlerts.length - 1];
    return {
      label: 'Slow voice path',
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: AlertTriangle,
      detail: latest?.message || 'Latency threshold exceeded'
    };
  }

  return {
    label: 'Assistant ready',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    Icon: CheckCircle2,
    detail: status.statusMessage || 'Startup verification passed'
  };
}

export default function AssistantStatusIndicator({ compact = false, className = '' } = {}) {
  const [status, setStatus] = useState(assistantRuntime.getSystemStatus());

  useEffect(() => {
    void assistantRuntime.initializeStatusMonitor();

    const handler = (event) => {
      setStatus(event.detail);
    };

    window.addEventListener(ASSISTANT_STATUS_EVENT_NAME, handler);
    return () => window.removeEventListener(ASSISTANT_STATUS_EVENT_NAME, handler);
  }, []);

  const summary = useMemo(() => formatSummary(status), [status]);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${summary.tone} ${className}`.trim()}
      title={summary.detail}
    >
      <summary.Icon className={`h-3.5 w-3.5 ${summary.label === 'Checking assistant' || summary.label === 'Recovering' ? 'animate-spin' : ''}`} />
      <span className="text-xs font-semibold">{summary.label}</span>
      {!compact && <span className="text-xs opacity-80">{summary.detail}</span>}
    </div>
  );
}