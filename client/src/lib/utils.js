import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function getTriageColor(level) {
  const colors = {
    green: 'badge-green',
    yellow: 'badge-yellow',
    orange: 'badge-orange',
    red: 'badge-red'
  };
  return colors[level] || 'badge-blue';
}

export function getStatusColor(status) {
  const map = {
    scheduled: 'badge-blue',
    'checked-in': 'badge-yellow',
    'in-queue': 'badge-yellow',
    'vitals-done': 'badge-orange',
    'in-consultation': 'badge-orange',
    completed: 'badge-green',
    cancelled: 'badge-red',
    'no-show': 'badge-red'
  };
  return map[status] || 'badge-blue';
}
