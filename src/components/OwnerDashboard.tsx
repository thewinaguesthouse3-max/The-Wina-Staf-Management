import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Layers,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import type {
  AppNotification,
  AttendanceRecord,
  BusinessUnit,
  GuestRequestRecord,
  Mission,
  MissionTemplate,
  RoomLocation,
  UserProfile,
} from '../domain/types';
import { MissionDetailModal } from './MissionDetailModal';
import { NotificationDrawer } from './NotificationDrawer';
import { UserAvatar } from './StatusIndicator';
import { OwnerMissionsTab } from './owner/OwnerMissionsTab';
import { OwnerOverviewTab } from './owner/OwnerOverviewTab';
import { OwnerReportsSettingsTab } from './owner/OwnerReportsSettingsTab';
import { OwnerStaffTab } from './owner/OwnerStaffTab';
import { OwnerUnitsQrTab } from './owner/OwnerUnitsQrTab';

type OwnerNavTab =
  | 'overview'
  | 'missions'
  | 'staff'
  | 'units'
  | 'templates'
  | 'reports'
  | 'settings';

interface OwnerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
  onOpenGuestQr: (qrId: string) => void;
}

export function OwnerDashboard({
  user,
  onLogout,
  onOpenGuestQr,
}: OwnerDashboardProps) {
  const [tab, setTab] = useState<OwnerNavTab>('overview');
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [rooms, setRooms] = useState<RoomLocation[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<AttendanceRecord[]>([]);
  const [guestRequests, setGuestRequests] = useState<GuestRequestRecord[]>([]);
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadAll = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const [sRes, uRes, mRes, aRes, gRes, tRes, nRes] = await Promise.all([
        apiRequest<{ staff: UserProfile[] }>('/api/staff'),
        apiRequest<{ units: BusinessUnit[]; rooms: RoomLocation[] }>('/api/units'),
        apiRequest<{ missions: Mission[] }>('/api/missions'),
        apiRequest<{ records: AttendanceRecord[] }>(
          `/api/attendance?date=${todayStr}`
        ),
        apiRequest<{ guestRequests: GuestRequestRecord[] }>('/api/guest-requests'),
        apiRequest<{ templates: MissionTemplate[] }>('/api/templates'),
        apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
      ]);
      setStaff(sRes.staff);
      setUnits(uRes.units);
      setRooms(uRes.rooms);
      setMissions(mRes.missions);
      setAttendanceToday(aRes.records);
      setGuestRequests(gRes.guestRequests);
      setTemplates(tRes.templates);
      setNotifications(nRes.notifications);
    } catch {
      // silent refresh error
    }
  };

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 20000);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const pendingStaffCount = useMemo(
    () => staff.filter((s) => s.status === 'Pending Approval').length,
    [staff]
  );

  const navItems: {
    id: OwnerNavTab;
    label: string;
    mobileLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      mobileLabel: 'Home',
      Icon: LayoutDashboard,
    },
    {
      id: 'missions',
      label: 'Monitoring Misi',
      mobileLabel: 'Misi',
      Icon: ClipboardList,
    },
    {
      id: 'staff',
      label: 'Staf & Approval',
      mobileLabel: 'Staf',
      Icon: Users,
      badge: pendingStaffCount,
    },
    {
      id: 'units',
      label: 'Unit & QR Code',
      mobileLabel: 'Unit QR',
      Icon: Building2,
    },
    {
      id: 'reports',
      label: 'Laporan & Ekspor',
      mobileLabel: 'Laporan',
      Icon: BarChart3,
    },
    {
      id: 'templates',
      label: 'Template Misi',
      mobileLabel: 'Template',
      Icon: Layers,
    },
    {
      id: 'settings',
      label: 'Pengaturan & Sheets',
      mobileLabel: 'Setelan',
      Icon: Settings,
    },
  ];

  const mobileNavItems = navItems.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30 no-print">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center">
          <span className="font-display font-bold text-base text-slate-900">
            The Wina Owner
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <item.Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="font-mono text-xs font-bold text-amber-700 tabular-nums">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.fullName} src={user.profilePhoto} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user.fullName}
              </p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 min-h-[44px] rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0 pb-20 md:pb-10">
        <header className="sticky top-0 z-20 h-14 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <span className="font-display font-bold text-base text-slate-900 truncate">
            {navItems.find((n) => n.id === tab)?.label}
          </span>

          <div className="flex items-center gap-2">
            <div className="md:hidden flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab('templates')}
                className="px-2.5 py-1.5 min-h-[40px] rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Template
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                className="px-2.5 py-1.5 min-h-[40px] rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Setelan
              </button>
            </div>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Buka notifikasi"
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 text-slate-700"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="font-mono text-xs font-bold text-teal-700 tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar"
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          {tab === 'overview' && (
            <OwnerOverviewTab
              staff={staff}
              attendanceToday={attendanceToday}
              missions={missions}
              units={units}
              guestRequests={guestRequests}
              onSelectMission={(id) => setSelectedMissionId(id)}
              onQuickCreateMission={() => {
                setTab('missions');
                setShowCreateMission(true);
              }}
            />
          )}

          {tab === 'missions' && (
            <OwnerMissionsTab
              missions={missions}
              units={units}
              rooms={rooms}
              staff={staff}
              templates={templates}
              showCreateModal={showCreateMission}
              setShowCreateModal={setShowCreateMission}
              onSelectMission={(id) => setSelectedMissionId(id)}
              onRefresh={loadAll}
            />
          )}

          {tab === 'staff' && (
            <OwnerStaffTab staff={staff} units={units} onRefresh={loadAll} />
          )}

          {tab === 'units' && (
            <OwnerUnitsQrTab
              units={units}
              rooms={rooms}
              onRefresh={loadAll}
              onOpenGuestQr={onOpenGuestQr}
            />
          )}

          {(tab === 'reports' || tab === 'templates' || tab === 'settings') && (
            <OwnerReportsSettingsTab
              mode={tab}
              units={units}
              staff={staff}
              templates={templates}
              onRefresh={loadAll}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav (64px <= 15% cap) */}
      <nav
        aria-label="Navigasi Owner"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center no-print"
      >
        {mobileNavItems.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 ${
                active ? 'text-teal-700 font-semibold' : 'text-slate-500'
              }`}
            >
              <item.Icon className="w-5 h-5" />
              <span className="text-[10px] leading-tight whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {selectedMissionId && (
        <MissionDetailModal
          missionId={selectedMissionId}
          currentUser={user}
          onClose={() => setSelectedMissionId(null)}
          onMissionUpdated={() => loadAll()}
        />
      )}

      <NotificationDrawer
        open={notifOpen}
        notifications={notifications}
        onClose={() => setNotifOpen(false)}
        onSelectMission={(mId) => setSelectedMissionId(mId)}
        onMarkRead={async (id) => {
          await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
          );
        }}
        onMarkAllRead={async () => {
          await apiRequest('/api/notifications/read-all', { method: 'POST' });
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }}
      />
    </div>
  );
}
