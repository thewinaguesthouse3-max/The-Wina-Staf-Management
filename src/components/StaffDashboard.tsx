import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Briefcase,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Home,
  LogOut,
  Search,
  User,
  Users,
} from 'lucide-react';
import { apiRequest, compressImageFile } from '../api/client';
import { isMissionOverdue } from '../domain/missionRules';
import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  BusinessUnit,
  CoworkerAttendance,
  Mission,
  UserProfile,
} from '../domain/types';
import { MissionDetailModal } from './MissionDetailModal';
import { NotificationDrawer } from './NotificationDrawer';
import {
  MissionStatusLabel,
  PriorityLabel,
  ProgressBar,
  UserAvatar,
  formatDateTime,
  formatShortTime,
} from './StatusIndicator';

type StaffTab = 'home' | 'absensi' | 'misi' | 'rekan' | 'profil';
type MissionSubTab =
  | 'available'
  | 'mine'
  | 'in_progress'
  | 'completed'
  | 'revision';

interface StaffDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export function StaffDashboard({ user, onLogout }: StaffDashboardProps) {
  const [tab, setTab] = useState<StaffTab>('home');
  const [missionTab, setMissionTab] = useState<MissionSubTab>('available');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [todayAtt, setTodayAtt] = useState<AttendanceRecord | null>(null);
  const [attHistory, setAttHistory] = useState<AttendanceRecord[]>([]);
  const [coworkers, setCoworkers] = useState<CoworkerAttendance[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('');

  // Attendance form state
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('Working');
  const [attUnitId, setAttUnitId] = useState('UNIT-01');
  const [attNotes, setAttNotes] = useState('');
  const [attPhoto, setAttPhoto] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutPhoto, setCheckoutPhoto] = useState('');
  const [attMsg, setAttMsg] = useState('');
  const [attError, setAttError] = useState('');
  const [attBusy, setAttBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [mRes, uRes, tRes, hRes, cRes, nRes] = await Promise.all([
        apiRequest<{ missions: Mission[] }>('/api/missions'),
        apiRequest<{ units: BusinessUnit[] }>('/api/units'),
        apiRequest<{ record: AttendanceRecord | null }>('/api/attendance/today'),
        apiRequest<{ records: AttendanceRecord[] }>('/api/attendance'),
        apiRequest<{ coworkers: CoworkerAttendance[] }>('/api/attendance/coworkers'),
        apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
      ]);
      setMissions(mRes.missions);
      setUnits(uRes.units);
      if (uRes.units.length > 0 && !attUnitId) {
        setAttUnitId(uRes.units[0].id);
      }
      setTodayAtt(tRes.record);
      setAttHistory(hRes.records);
      setCoworkers(cRes.coworkers);
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

  const isMine = (m: Mission) =>
    m.leadStaffId === user.id ||
    m.additionalStaff.some((a) => a.staffId === user.id);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayMissions = missions.filter(
      (m) => m.createdAt.slice(0, 10) === todayStr || m.status !== 'Completed'
    );
    return {
      totalToday: todayMissions.length,
      available: missions.filter(
        (m) =>
          m.status === 'Available' && m.distributionType === 'Open Mission'
      ).length,
      claimed: missions.filter((m) => isMine(m)).length,
      inProgress: missions.filter(
        (m) => isMine(m) && (m.status === 'In Progress' || m.status === 'Paused')
      ).length,
      completed: missions.filter((m) => isMine(m) && m.status === 'Completed')
        .length,
      overdue: missions.filter((m) => isMine(m) && isMissionOverdue(m)).length,
    };
  }, [missions, user.id]);

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      if (unitFilter && m.unitId !== unitFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          m.title.toLowerCase().includes(q) ||
          m.unitName.toLowerCase().includes(q) ||
          m.roomName.toLowerCase().includes(q) ||
          m.missionType.toLowerCase().includes(q);
        if (!hit) return false;
      }

      switch (missionTab) {
        case 'available':
          return (
            (m.status === 'Available' && m.distributionType === 'Open Mission') ||
            (m.isTeamMission &&
              !isMine(m) &&
              ['Accepted', 'In Progress', 'Paused'].includes(m.status))
          );
        case 'mine':
          return isMine(m) && m.status !== 'Completed' && m.status !== 'Cancelled';
        case 'in_progress':
          return isMine(m) && (m.status === 'In Progress' || m.status === 'Paused');
        case 'completed':
          return isMine(m) && m.status === 'Completed';
        case 'revision':
          return isMine(m) && m.status === 'Revision Required';
      }
    });
  }, [missions, missionTab, searchQuery, unitFilter, user.id]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttError('');
    setAttMsg('');
    setAttBusy(true);
    try {
      const res = await apiRequest<{ record: AttendanceRecord }>(
        '/api/attendance/check-in',
        {
          method: 'POST',
          body: JSON.stringify({
            status: attStatus,
            unitId: attUnitId,
            notes: attNotes,
            photo: attPhoto,
          }),
        }
      );
      setTodayAtt(res.record);
      setAttMsg(`Absensi ${res.record.status} berhasil dicatat.`);
      setAttNotes('');
      setAttPhoto('');
      loadAll();
    } catch (err: any) {
      setAttError(err.message || 'Gagal mencatat absensi.');
    } finally {
      setAttBusy(false);
    }
  };

  const handleCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttError('');
    setAttMsg('');
    setAttBusy(true);
    try {
      const res = await apiRequest<{ record: AttendanceRecord }>(
        '/api/attendance/check-out',
        {
          method: 'POST',
          body: JSON.stringify({
            notes: checkoutNotes,
            photo: checkoutPhoto,
          }),
        }
      );
      setTodayAtt(res.record);
      setAttMsg('Check-out berhasil dicatat. Terima kasih atas kerja keras Anda hari ini!');
      setCheckoutNotes('');
      setCheckoutPhoto('');
      loadAll();
    } catch (err: any) {
      setAttError(err.message || 'Gagal mencatat check-out.');
    } finally {
      setAttBusy(false);
    }
  };

  const handleFile = async (
    setter: (val: string) => void,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file, 960);
    setter(compressed);
  };

  const navItems: {
    id: StaffTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'absensi', label: 'Absensi', Icon: ClipboardCheck },
    { id: 'misi', label: 'Misi', Icon: Briefcase },
    { id: 'rekan', label: 'Rekan Kerja', Icon: Users },
    { id: 'profil', label: 'Profil', Icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
          <span className="font-display font-bold text-base text-slate-900">
            The Wina Staff
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
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
              <p className="text-xs text-slate-500 truncate">@{user.username}</p>
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

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0 pb-20 md:pb-8">
        {/* Compact Top Bar */}
        <header className="sticky top-0 z-20 h-14 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-display font-bold text-base text-slate-900 md:hidden truncate">
              The Wina Staff
            </span>
            <span className="hidden md:inline font-display font-bold text-base text-slate-900">
              {navItems.find((n) => n.id === tab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Buka notifikasi"
              className="relative min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 text-slate-700"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="font-mono text-xs font-bold text-teal-700 tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
          {/* HOME TAB */}
          {tab === 'home' && (
            <>
              <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <UserAvatar
                    name={user.fullName}
                    src={user.profilePhoto}
                    size="lg"
                  />
                  <div>
                    <p className="text-xs text-slate-500">Halo, selamat bertugas</p>
                    <h1 className="font-display text-xl font-bold text-slate-900">
                      {user.fullName}
                    </h1>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Absensi Hari Ini:{' '}
                      <span className="font-semibold text-teal-800">
                        {todayAtt ? todayAtt.status : 'Belum Absen'}
                      </span>
                      {todayAtt?.checkInTime &&
                        ` · Masuk ${formatShortTime(todayAtt.checkInTime)}`}
                      {todayAtt?.checkOutTime &&
                        ` · Pulang ${formatShortTime(todayAtt.checkOutTime)}`}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('absensi')}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium whitespace-nowrap"
                  >
                    {!todayAtt
                      ? 'Check-In Sekarang'
                      : todayAtt.status === 'Working' && !todayAtt.checkOutTime
                        ? 'Check-Out'
                        : 'Lihat Absensi'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('misi');
                      setMissionTab('available');
                    }}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium whitespace-nowrap"
                  >
                    Cari Misi
                  </button>
                </div>
              </section>

              {/* Mission Counters */}
              <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total Misi', value: stats.totalToday, tone: 'text-slate-900' },
                  { label: 'Tersedia', value: stats.available, tone: 'text-teal-700' },
                  { label: 'Misi Diambil', value: stats.claimed, tone: 'text-sky-700' },
                  { label: 'Berjalan', value: stats.inProgress, tone: 'text-amber-700' },
                  { label: 'Selesai', value: stats.completed, tone: 'text-emerald-700' },
                  { label: 'Terlambat', value: stats.overdue, tone: 'text-red-700' },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                  >
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p
                      className={`font-display text-2xl font-bold tabular-nums mt-1 ${k.tone}`}
                    >
                      {k.value}
                    </p>
                  </div>
                ))}
              </section>

              {/* Quick Available & Active Missions */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Misi Prioritas & Tersedia
                  </h2>
                  <button
                    type="button"
                    onClick={() => setTab('misi')}
                    className="text-xs font-semibold text-teal-700 hover:underline min-h-[44px] px-2"
                  >
                    Semua Misi
                  </button>
                </div>
                {missions.slice(0, 4).length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    Belum ada misi aktif saat ini.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {missions.slice(0, 4).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMissionId(m.id)}
                        className="w-full text-left py-3.5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {m.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {m.unitName} · {m.roomName || m.area} ·{' '}
                            {formatDateTime(m.deadline)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <MissionStatusLabel
                            status={m.status}
                            isOverdue={isMissionOverdue(m)}
                          />
                          <span className="font-mono text-xs text-slate-600 tabular-nums">
                            {m.progress}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ABSENSI TAB */}
          {tab === 'absensi' && (
            <div className="space-y-5">
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Absensi Harian Staf
                </h1>

                {attError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
                  >
                    {attError}
                  </div>
                )}
                {attMsg && (
                  <div
                    role="status"
                    className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
                  >
                    {attMsg}
                  </div>
                )}

                {!todayAtt ? (
                  <form onSubmit={handleCheckIn} className="space-y-4">
                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-2">
                        Pilih Status Kehadiran
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(
                          [
                            'Working',
                            'Off',
                            'Izin',
                            'Sick',
                            'Emergency Leave',
                          ] as AttendanceStatus[]
                        ).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setAttStatus(st)}
                            className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${
                              attStatus === st
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {attStatus === 'Working' && (
                      <div>
                        <label
                          htmlFor="att-unit"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          Unit Kerja Hari Ini
                        </label>
                        <select
                          id="att-unit"
                          value={attUnitId}
                          onChange={(e) => setAttUnitId(e.target.value)}
                          className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                        >
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="att-notes"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Catatan (Opsional)
                      </label>
                      <input
                        id="att-notes"
                        type="text"
                        value={attNotes}
                        onChange={(e) => setAttNotes(e.target.value)}
                        placeholder="Contoh: Shift pagi atau keterangan izin/sakit..."
                        className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <div>
                      <label className="flex items-center justify-center gap-2 py-2.5 px-4 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-xs text-slate-700 cursor-pointer">
                        <Camera className="w-4 h-4" />
                        <span>
                          {attPhoto
                            ? 'Foto Check-In Siap'
                            : 'Foto Check-In (Opsional)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handleFile(setAttPhoto, e)}
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={attBusy}
                      className="w-full py-3 px-4 min-h-[48px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors disabled:opacity-60"
                    >
                      {attBusy
                        ? 'Menyimpan...'
                        : attStatus === 'Working'
                          ? 'Check-In Sekarang'
                          : `Kirim Status ${attStatus}`}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#F7F6F2] border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block">Status</span>
                        <span className="font-semibold text-slate-900">
                          {todayAtt.status}
                          {todayAtt.isLate ? ' (Terlambat)' : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Unit Kerja</span>
                        <span className="font-medium text-slate-900">
                          {todayAtt.unitName || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Check-In</span>
                        <span className="font-mono text-slate-900 tabular-nums">
                          {formatShortTime(todayAtt.checkInTime)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Check-Out</span>
                        <span className="font-mono text-slate-900 tabular-nums">
                          {formatShortTime(todayAtt.checkOutTime)}
                        </span>
                      </div>
                    </div>

                    {todayAtt.status === 'Working' && !todayAtt.checkOutTime && (
                      <form onSubmit={handleCheckOut} className="space-y-3 pt-2">
                        <input
                          type="text"
                          value={checkoutNotes}
                          onChange={(e) => setCheckoutNotes(e.target.value)}
                          placeholder="Catatan check-out (opsional)..."
                          className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                        />
                        <label className="flex items-center justify-center gap-2 py-2.5 px-4 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-xs text-slate-700 cursor-pointer">
                          <Camera className="w-4 h-4" />
                          <span>
                            {checkoutPhoto
                              ? 'Foto Check-Out Siap'
                              : 'Foto Check-Out (Opsional)'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => handleFile(setCheckoutPhoto, e)}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={attBusy}
                          className="w-full py-3 px-4 min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm"
                        >
                          {attBusy ? 'Menyimpan...' : 'Check-Out Selesai Kerja'}
                        </button>
                      </form>
                    )}

                    {todayAtt.checkOutTime && (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Absensi hari ini selesai ({todayAtt.workMinutes} menit kerja).
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Personal Attendance History */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Riwayat Absensi Anda
                </h2>
                {attHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada catatan absensi.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {attHistory.map((rec) => (
                      <div
                        key={rec.id}
                        className="py-3 flex items-center justify-between gap-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {rec.date} · {rec.status}
                            {rec.isLate ? ' (Terlambat)' : ''}
                          </p>
                          <p className="text-xs text-slate-500">
                            {rec.unitName || '-'} {rec.notes ? `· ${rec.notes}` : ''}
                          </p>
                        </div>
                        <div className="font-mono text-xs text-slate-700 tabular-nums text-right">
                          {formatShortTime(rec.checkInTime)} –{' '}
                          {formatShortTime(rec.checkOutTime)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* MISI TAB */}
          {tab === 'misi' && (
            <div className="space-y-4">
              {/* Sub-tabs */}
              <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto">
                {(
                  [
                    { id: 'available', label: 'Available Missions' },
                    { id: 'mine', label: 'My Missions' },
                    { id: 'in_progress', label: 'In Progress' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'revision', label: 'Revision Required' },
                  ] as { id: MissionSubTab; label: string }[]
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setMissionTab(st.id)}
                    className={`px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      missionTab === st.id
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Search & Unit Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama misi, kamar, atau jenis..."
                    className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm"
                  />
                </div>
                <select
                  aria-label="Filter unit usaha"
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm"
                >
                  <option value="">Semua Unit Usaha</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mission Cards */}
              {filteredMissions.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  Tidak ada misi pada kategori ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredMissions.map((m) => {
                    const overdue = isMissionOverdue(m);
                    return (
                      <div
                        key={m.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <MissionStatusLabel
                              status={m.status}
                              isOverdue={overdue}
                            />
                            <PriorityLabel priority={m.priority} />
                          </div>
                          <h3 className="font-display text-base font-bold text-slate-900">
                            {m.title}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {m.unitName} · {m.roomName || m.area} ·{' '}
                            {m.missionType}
                            {m.isTeamMission ? ' · Team' : ''}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">
                              Deadline {formatDateTime(m.deadline)}
                            </span>
                          </div>
                          <ProgressBar progress={m.progress} />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500 truncate">
                            {m.leadStaffName
                              ? `PJ: ${m.leadStaffName}`
                              : 'Siap diambil'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedMissionId(m.id)}
                            className="px-4 py-2 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            {m.status === 'Available'
                              ? 'Lihat & Ambil'
                              : 'Kelola Misi'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* REKAN KERJA TAB (No sensitive info!) */}
          {tab === 'rekan' && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Kehadiran Rekan Kerja Hari Ini
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status operasional rekan satu tim pada hari yang sama.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {coworkers.map((cw) => (
                  <div
                    key={cw.staffId}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar name={cw.fullName} src={cw.profilePhoto} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {cw.fullName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {cw.unitName}
                          {cw.currentMissionTitle
                            ? ` · ${cw.currentMissionTitle}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                        cw.status === 'Working'
                          ? 'text-emerald-700'
                          : cw.status === 'Off'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                      }`}
                    >
                      {cw.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PROFIL TAB */}
          {tab === 'profil' && (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-4">
                <UserAvatar
                  name={user.fullName}
                  src={user.profilePhoto}
                  size="lg"
                />
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    {user.fullName}
                  </h1>
                  <p className="text-sm text-slate-500">
                    @{user.username} · {user.role} · {user.status}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">
                    Nomor WhatsApp
                  </span>
                  <span className="font-mono font-medium text-slate-900">
                    {user.whatsapp || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">
                    Tanggal Mulai Kerja
                  </span>
                  <span className="font-mono font-medium text-slate-900">
                    {user.startDate || '-'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-500 block">
                    Akses Unit Usaha
                  </span>
                  <span className="font-medium text-slate-900">
                    {units
                      .filter(
                        (u) =>
                          user.assignedUnitIds.length === 0 ||
                          user.assignedUnitIds.includes(u.id)
                      )
                      .map((u) => u.name)
                      .join(', ') || 'Semua Unit'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            </section>
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (64px <= 15% cap) */}
      <nav
        aria-label="Navigasi Staf"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center"
      >
        {navItems.map((item) => {
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
                {item.label}
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
