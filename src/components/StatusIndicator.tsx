import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { MissionPriority, MissionStatus } from '../domain/types';

export function MissionStatusLabel({
  status,
  isOverdue,
}: {
  status: MissionStatus;
  isOverdue?: boolean;
}) {
  const map: Record<
    MissionStatus,
    { color: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    Available: { color: 'text-teal-700', Icon: Clock },
    Accepted: { color: 'text-sky-700', Icon: UserCheck },
    'In Progress': { color: 'text-amber-700', Icon: PlayCircle },
    Paused: { color: 'text-slate-600', Icon: PauseCircle },
    Completed: { color: 'text-emerald-700', Icon: CheckCircle2 },
    'Revision Required': { color: 'text-orange-700', Icon: RotateCcw },
    Cancelled: { color: 'text-slate-400', Icon: XCircle },
  };
  const cfg = map[status] || map.Available;
  const Icon = isOverdue ? AlertTriangle : cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
        isOverdue ? 'text-red-700' : cfg.color
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{isOverdue ? `${status} (Terlambat)` : status}</span>
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: MissionPriority }) {
  const color =
    priority === 'Urgent'
      ? 'text-red-700'
      : priority === 'High'
        ? 'text-amber-700'
        : priority === 'Normal'
          ? 'text-slate-700'
          : 'text-slate-500';
  return (
    <span className={`text-xs font-medium whitespace-nowrap ${color}`}>
      Prioritas {priority}
    </span>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(100, progress));
  const barColor =
    clamped === 100
      ? 'bg-emerald-600'
      : clamped >= 50
        ? 'bg-teal-600'
        : 'bg-amber-600';

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
        <div
          className={`h-full transition-all duration-200 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-xs font-medium text-slate-700 tabular-nums w-9 text-right">
        {clamped}%
      </span>
    </div>
  );
}

export function UserAvatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = React.useState(false);
  const dims =
    size === 'lg'
      ? 'w-14 h-14 text-base'
      : size === 'sm'
        ? 'w-8 h-8 text-xs'
        : 'w-10 h-10 text-sm';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${dims} rounded-full bg-teal-50 text-teal-800 border border-teal-200/80 font-display font-semibold flex items-center justify-center shrink-0`}
    >
      {initials || 'TW'}
    </div>
  );
}

export function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
