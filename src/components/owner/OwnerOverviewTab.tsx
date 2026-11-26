import React, { useMemo, useState } from 'react';
import { isMissionOverdue } from '../../domain/missionRules';
import type {
  AttendanceRecord,
  BusinessUnit,
  GuestRequestRecord,
  Mission,
  UserProfile,
} from '../../domain/types';
import {
  MissionStatusLabel,
  ProgressBar,
  UserAvatar,
  formatDateTime,
} from '../StatusIndicator';

interface OwnerOverviewTabProps {
  staff: UserProfile[];
  attendanceToday: AttendanceRecord[];
  missions: Mission[];
  units: BusinessUnit[];
  guestRequests: GuestRequestRecord[];
  onSelectMission: (id: string) => void;
  onQuickCreateMission: () => void;
}

export function OwnerOverviewTab({
  staff,
  attendanceToday,
  missions,
  units,
  guestRequests,
  onSelectMission,
  onQuickCreateMission,
}: OwnerOverviewTabProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [staffFilter, setStaffFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const approvedStaff = useMemo(
    () => staff.filter((s) => s.status === 'Approved'),
    [staff]
  );

  const filteredMissions = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      period === 'day'
        ? now - 24 * 3600 * 1000
        : period === 'week'
          ? now - 7 * 24 * 3600 * 1000
          : now - 30 * 24 * 3600 * 1000;

    return missions.filter((m) => {
      const createdMs = Date.parse(m.createdAt);
      if (!Number.isNaN(createdMs) && createdMs < cutoffMs) {
        // Keep active missions visible even in day view
        if (m.status === 'Completed' || m.status === 'Cancelled') return false;
      }
      if (unitFilter && m.unitId !== unitFilter) return false;
      if (typeFilter && m.missionType !== typeFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (
        staffFilter &&
        m.leadStaffId !== staffFilter &&
        !m.additionalStaff.some((a) => a.staffId === staffFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [missions, period, staffFilter, unitFilter, typeFilter, statusFilter]);

  const attStats = useMemo(() => {
    const present = attendanceToday.filter((a) => a.status === 'Working').length;
    const off = attendanceToday.filter((a) => a.status === 'Off').length;
    const izin = attendanceToday.filter(
      (a) => a.status === 'Izin' || a.status === 'Emergency Leave'
    ).length;
    const sick = attendanceToday.filter((a) => a.status === 'Sick').length;
    const late = attendanceToday.filter((a) => a.isLate).length;
    const attendedIds = new Set(attendanceToday.map((a) => a.staffId));
    const notCheckedIn = approvedStaff.filter((s) => !attendedIds.has(s.id)).length;
    return {
      registered: staff.length,
      present,
      off,
      izin,
      sick,
      late,
      notCheckedIn,
    };
  }, [staff, approvedStaff, attendanceToday]);

  const missionStats = useMemo(() => {
    return {
      total: filteredMissions.length,
      available: filteredMissions.filter((m) => m.status === 'Available').length,
      inProgress: filteredMissions.filter(
        (m) => m.status === 'In Progress' || m.status === 'Accepted'
      ).length,
      completed: filteredMissions.filter((m) => m.status === 'Completed').length,
      overdue: filteredMissions.filter((m) => isMissionOverdue(m)).length,
      guestReq: guestRequests.filter((g) => g.status !== 'Completed').length,
    };
  }, [filteredMissions, guestRequests]);

  const activeStaffMissions = useMemo(
    () =>
      missions.filter((m) =>
        ['Accepted', 'In Progress', 'Paused'].includes(m.status)
      ),
    [missions]
  );

  // SVG chart values
  const attChartBars = [
    { label: 'Hadir', value: attStats.present, color: '#0F766E' },
    { label: 'Terlambat', value: attStats.late, color: '#D97706' },
    { label: 'Off', value: attStats.off, color: '#64748B' },
    { label: 'Izin', value: attStats.izin, color: '#0284C7' },
    { label: 'Sakit', value: attStats.sick, color: '#DC2626' },
    { label: 'Belum Absen', value: attStats.notCheckedIn, color: '#CBD5E1' },
  ];
  const maxAttBar = Math.max(1, ...attChartBars.map((b) => b.value));

  const missionChartBars = [
    { label: 'Available', value: missionStats.available, color: '#0F766E' },
    { label: 'Berjalan', value: missionStats.inProgress, color: '#D97706' },
    { label: 'Selesai', value: missionStats.completed, color: '#16A34A' },
    { label: 'Terlambat', value: missionStats.overdue, color: '#DC2626' },
  ];
  const maxMissionBar = Math.max(1, ...missionChartBars.map((b) => b.value));

  return (
    <div className="space-y-6">
      {/* Header + Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Ringkasan Operasional The Wina
          </h1>
          <p className="text-sm text-slate-500">
            Pantau kehadiran staf, progres misi lapangan, dan permintaan tamu secara real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={onQuickCreateMission}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium whitespace-nowrap shrink-0"
        >
          + Buat Misi Baru
        </button>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(
            [
              { id: 'day', label: 'Hari' },
              { id: 'week', label: 'Minggu' },
              { id: 'month', label: 'Bulan' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`flex-1 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                period === p.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter Staf"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Staf</option>
          {approvedStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter Unit Usaha"
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Unit Usaha</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter Jenis Misi"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Jenis Misi</option>
          {[
            'Room Cleaning',
            'Laundry',
            'Garden Cleaning',
            'General Cleaning',
            'Bathroom Cleaning',
            'Pool Cleaning',
            'Maintenance',
            'Restocking',
            'Guest Request',
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter Status Misi"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Status Misi</option>
          {[
            'Available',
            'Accepted',
            'In Progress',
            'Paused',
            'Completed',
            'Revision Required',
            'Cancelled',
          ].map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </section>

      {/* Attendance KPI Grid (7 Metrics) */}
      <section className="space-y-2.5">
        <h2 className="font-display text-sm font-bold text-slate-700">
          Status Kehadiran Staf Hari Ini
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Staf Terdaftar', value: attStats.registered, tone: 'text-slate-900' },
            { label: 'Hadir Hari Ini', value: attStats.present, tone: 'text-teal-700' },
            { label: 'Staf Off', value: attStats.off, tone: 'text-slate-600' },
            { label: 'Staf Izin', value: attStats.izin, tone: 'text-sky-700' },
            { label: 'Staf Sakit', value: attStats.sick, tone: 'text-red-700' },
            { label: 'Terlambat', value: attStats.late, tone: 'text-amber-700' },
            { label: 'Belum Absen', value: attStats.notCheckedIn, tone: 'text-slate-500' },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white border border-slate-200 rounded-xl p-3.5"
            >
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`font-display text-2xl font-bold tabular-nums mt-1 ${k.tone}`}>
                {k.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission & Guest KPI Grid (7 Metrics) */}
      <section className="space-y-2.5">
        <h2 className="font-display text-sm font-bold text-slate-700">
          Operasional Misi & Permintaan Tamu
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Misi', value: missionStats.total, tone: 'text-slate-900' },
            { label: 'Belum Diambil', value: missionStats.available, tone: 'text-teal-700' },
            { label: 'Sedang Jalan', value: missionStats.inProgress, tone: 'text-amber-700' },
            { label: 'Misi Selesai', value: missionStats.completed, tone: 'text-emerald-700' },
            { label: 'Misi Terlambat', value: missionStats.overdue, tone: 'text-red-700' },
            { label: 'Guest Request QR', value: missionStats.guestReq, tone: 'text-sky-700' },
            { label: 'Staf Jalankan Misi', value: activeStaffMissions.length, tone: 'text-slate-900' },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white border border-slate-200 rounded-xl p-3.5"
            >
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`font-display text-2xl font-bold tabular-nums mt-1 ${k.tone}`}>
                {k.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900">
            Statistik Kehadiran Staf
          </h3>
          <div className="space-y-2.5">
            {attChartBars.map((b) => (
              <div key={b.label} className="flex items-center gap-3 text-xs">
                <span className="w-24 text-slate-600 shrink-0">{b.label}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${Math.round((b.value / maxAttBar) * 100)}%`,
                      backgroundColor: b.color,
                    }}
                  />
                </div>
                <span className="font-mono font-semibold text-slate-900 tabular-nums w-6 text-right">
                  {b.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mission Progress Chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900">
            Statistik Progres & Status Misi
          </h3>
          <div className="space-y-2.5">
            {missionChartBars.map((b) => (
              <div key={b.label} className="flex items-center gap-3 text-xs">
                <span className="w-24 text-slate-600 shrink-0">{b.label}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${Math.round((b.value / maxMissionBar) * 100)}%`,
                      backgroundColor: b.color,
                    }}
                  />
                </div>
                <span className="font-mono font-semibold text-slate-900 tabular-nums w-6 text-right">
                  {b.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Active Staff Running Missions & Guest QR Requests */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">
            Staf yang Sedang Menjalankan Misi
          </h3>
          {activeStaffMissions.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              Belum ada misi yang sedang dikerjakan saat ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeStaffMissions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMission(m.id)}
                  className="w-full text-left py-3 hover:bg-slate-50 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar name={m.leadStaffName || 'Staf'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {m.leadStaffName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {m.title} · {m.unitName}
                        </p>
                      </div>
                    </div>
                    <MissionStatusLabel
                      status={m.status}
                      isOverdue={isMissionOverdue(m)}
                    />
                  </div>
                  <ProgressBar progress={m.progress} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">
            Permintaan Tamu via QR Code Terbaru
          </h3>
          {guestRequests.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              Belum ada permintaan tamu melalui QR Code.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {guestRequests.slice(0, 6).map((gr) => (
                <button
                  key={gr.id}
                  type="button"
                  onClick={() => onSelectMission(gr.missionId)}
                  className="w-full text-left py-3 hover:bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {gr.requestType} · {gr.roomName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {gr.unitName} · {formatDateTime(gr.requestedAt)}
                      {gr.assigneeName ? ` · PJ: ${gr.assigneeName}` : ''}
                    </p>
                  </div>
                  <MissionStatusLabel status={gr.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
