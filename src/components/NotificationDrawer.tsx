import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import type { AppNotification } from '../domain/types';
import { formatDateTime } from './StatusIndicator';

interface NotificationDrawerProps {
  open: boolean;
  notifications: AppNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectMission?: (missionId: string) => void;
}

export function NotificationDrawer({
  open,
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onSelectMission,
}: NotificationDrawerProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notifikasi"
      className="fixed inset-0 z-50 bg-slate-950/40 flex justify-end"
    >
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Notifikasi
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="px-2.5 py-1.5 min-h-[40px] text-xs font-medium text-teal-700 hover:bg-teal-50 rounded-lg inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Tandai Semua</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup notifikasi"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada notifikasi saat ini.
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) onMarkRead(n.id);
                  if (n.relatedMissionId && onSelectMission) {
                    onSelectMission(n.relatedMissionId);
                    onClose();
                  }
                }}
                className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors ${
                  n.isRead ? 'bg-white' : 'bg-teal-50/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="text-[11px] font-semibold text-teal-700">
                      Baru
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {n.message}
                </p>
                <p className="font-mono text-[11px] text-slate-400 mt-1.5 tabular-nums">
                  {formatDateTime(n.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
