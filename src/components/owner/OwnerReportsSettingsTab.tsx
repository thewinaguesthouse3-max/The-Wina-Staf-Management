import React, { useEffect, useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react';
import { apiRequest, downloadAuthorizedFile } from '../../api/client';
import type {
  AttendanceRecord,
  BusinessUnit,
  MissionPriority,
  MissionTemplate,
  MissionType,
  SystemSettings,
  UserProfile,
  WorkArea,
} from '../../domain/types';

interface OwnerReportsSettingsTabProps {
  mode: 'reports' | 'templates' | 'settings';
  units: BusinessUnit[];
  staff: UserProfile[];
  templates: MissionTemplate[];
  onRefresh: () => Promise<void>;
}

interface ReportData {
  attendanceByStaff: {
    staffId: string;
    staffName: string;
    workingDays: number;
    offDays: number;
    izinDays: number;
    sickDays: number;
    emergencyDays: number;
    lateCount: number;
    totalHours: number;
  }[];
  attendanceRecords: AttendanceRecord[];
  missionSummary: {
    total: number;
    completed: number;
    incomplete: number;
    overdue: number;
    revised: number;
    avgCompletionMinutes: number;
  };
  missionByStaff: {
    staffId: string;
    staffName: string;
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    revised: number;
  }[];
  missionByUnit: {
    unitId: string;
    unitName: string;
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  }[];
  operationalByCategory: {
    category: string;
    total: number;
    completed: number;
    overdue: number;
  }[];
}

export function OwnerReportsSettingsTab({
  mode,
  units,
  staff,
  templates,
  onRefresh,
}: OwnerReportsSettingsTabProps) {
  // Reports state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);

  // Templates state
  const [tplName, setTplName] = useState('');
  const [tplType, setTplType] = useState<MissionType>('Room Cleaning');
  const [tplArea, setTplArea] = useState<WorkArea>('Guest Room');
  const [tplItems, setTplItems] = useState('');
  const [tplMsg, setTplMsg] = useState('');

  // Settings & Google Sheets Blueprint state
  const [settings, setSettings] = useState<SystemSettings>({
    checkInStartHour: '06:00',
    lateCutoffTime: '08:15',
    checkOutMinHour: '15:00',
    allowEarlyCheckIn: true,
    autoAssignGuestPriority: 'High',
  });
  const [settingsMsg, setSettingsMsg] = useState('');
  const [sheetsSchema, setSheetsSchema] = useState<
    { sheetName: string; columns: string[] }[]
  >([]);

  const loadReports = async () => {
    const q = new URLSearchParams();
    if (fromDate) q.set('from', fromDate);
    if (toDate) q.set('to', toDate);
    if (staffFilter) q.set('staffId', staffFilter);
    if (unitFilter) q.set('unitId', unitFilter);
    if (typeFilter) q.set('missionType', typeFilter);
    const data = await apiRequest<ReportData>(`/api/reports?${q.toString()}`);
    setReport(data);
  };

  useEffect(() => {
    if (mode === 'reports') {
      loadReports().catch(() => {});
    }
    if (mode === 'settings') {
      apiRequest<{ settings: SystemSettings }>('/api/settings')
        .then((res) => setSettings(res.settings))
        .catch(() => {});
      apiRequest<{ schema: { sheetName: string; columns: string[] }[] }>(
        '/api/export/sheets-bundle'
      )
        .then((res) => setSheetsSchema(res.schema))
        .catch(() => {});
    }
  }, [mode, fromDate, toDate, staffFilter, unitFilter, typeFilter]);

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplMsg('');
    const checklistItems = tplItems
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await apiRequest('/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: tplName,
        missionType: tplType,
        defaultArea: tplArea,
        checklistItems,
      }),
    });
    setTplName('');
    setTplItems('');
    setTplMsg('Template baru berhasil ditambahkan.');
    await onRefresh();
  };

  const handleDeleteTemplate = async (id: string) => {
    await apiRequest(`/api/templates/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg('');
    await apiRequest('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    setSettingsMsg('Aturan absensi dan operasional berhasil disimpan.');
  };

  if (mode === 'reports') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              Laporan Operasional & Ekspor
            </h1>
            <p className="text-sm text-slate-500">
              Rekap absensi, kinerja misi, dan kategori pekerjaan untuk seluruh unit The Wina.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadAuthorizedFile(
                  '/api/export/csv?type=attendance',
                  'thewina-absensi.csv'
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
            >
              <Download className="w-4 h-4 text-teal-700" />
              <span>CSV Absensi</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadAuthorizedFile(
                  '/api/export/csv?type=missions',
                  'thewina-misi.csv'
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-700" />
              <span>CSV/Excel Misi</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
          <input
            type="date"
            aria-label="Dari tanggal"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm"
          />
          <input
            type="date"
            aria-label="Sampai tanggal"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm"
          />
          <select
            aria-label="Filter Staf"
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">Semua Staf</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter Unit"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">Semua Unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter Jenis Pekerjaan"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">Semua Jenis Pekerjaan</option>
            {[
              'Room Cleaning',
              'Laundry',
              'Garden Cleaning',
              'General Cleaning',
              'Maintenance',
              'Guest Request',
              'Restocking',
              'Pool Cleaning',
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </section>

        {!report ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
            Memuat laporan...
          </div>
        ) : (
          <>
            {/* Mission Summary Cards */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Misi', value: report.missionSummary.total },
                { label: 'Selesai', value: report.missionSummary.completed },
                { label: 'Belum Selesai', value: report.missionSummary.incomplete },
                { label: 'Terlambat', value: report.missionSummary.overdue },
                { label: 'Direvisi', value: report.missionSummary.revised },
                {
                  label: 'Rata-rata (Menit)',
                  value: report.missionSummary.avgCompletionMinutes,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="bg-white border border-slate-200 rounded-xl p-4"
                >
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {m.value}
                  </p>
                </div>
              ))}
            </section>

            {/* Attendance Report Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Laporan Rekap Absensi per Staf
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-4">Nama Staf</th>
                      <th className="py-2.5 px-4 text-right">Hari Kerja</th>
                      <th className="py-2.5 px-4 text-right">Off</th>
                      <th className="py-2.5 px-4 text-right">Izin</th>
                      <th className="py-2.5 px-4 text-right">Sakit</th>
                      <th className="py-2.5 px-4 text-right">Terlambat</th>
                      <th className="py-2.5 px-4 text-right">Total Jam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums font-mono text-xs">
                    {report.attendanceByStaff.map((row) => (
                      <tr key={row.staffId}>
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 text-sm">
                          {row.staffName}
                        </td>
                        <td className="py-2.5 px-4 text-right">{row.workingDays}</td>
                        <td className="py-2.5 px-4 text-right">{row.offDays}</td>
                        <td className="py-2.5 px-4 text-right">{row.izinDays}</td>
                        <td className="py-2.5 px-4 text-right">{row.sickDays}</td>
                        <td className="py-2.5 px-4 text-right text-amber-700">
                          {row.lateCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold">
                          {row.totalHours} jam
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Operational by Category & Unit */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Laporan Operasional per Kategori
                  </h2>
                </div>
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-4">Kategori</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                      <th className="py-2.5 px-4 text-right">Selesai</th>
                      <th className="py-2.5 px-4 text-right">Terlambat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums font-mono text-xs">
                    {report.operationalByCategory.map((c) => (
                      <tr key={c.category}>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-900 text-sm">
                          {c.category}
                        </td>
                        <td className="py-2.5 px-4 text-right">{c.total}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-700">
                          {c.completed}
                        </td>
                        <td className="py-2.5 px-4 text-right text-red-700">
                          {c.overdue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Laporan Misi per Unit Usaha
                  </h2>
                </div>
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-4">Unit Usaha</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                      <th className="py-2.5 px-4 text-right">Selesai</th>
                      <th className="py-2.5 px-4 text-right">Aktif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums font-mono text-xs">
                    {report.missionByUnit.map((u) => (
                      <tr key={u.unitId}>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-900 text-sm">
                          {u.unitName}
                        </td>
                        <td className="py-2.5 px-4 text-right">{u.total}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-700">
                          {u.completed}
                        </td>
                        <td className="py-2.5 px-4 text-right">{u.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}
      </div>
    );
  }

  if (mode === 'templates') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Template Misi Default & Kustom
          </h1>
          <p className="text-sm text-slate-500">
            Kelola daftar checklist standar untuk Room Cleaning, Laundry, Garden, Pool, Maintenance, dan lainnya.
          </p>
        </div>

        <form
          onSubmit={handleSaveTemplate}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900">
            Tambah Template Misi Baru
          </h2>
          {tplMsg && (
            <p className="text-xs font-medium text-emerald-700">{tplMsg}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Nama Template"
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
            <select
              value={tplType}
              onChange={(e) => setTplType(e.target.value as MissionType)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
            >
              {[
                'Room Cleaning',
                'Laundry',
                'Garden Cleaning',
                'General Cleaning',
                'Bathroom Cleaning',
                'Pool Cleaning',
                'Maintenance',
                'Restocking',
                'Other',
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={tplArea}
              onChange={(e) => setTplArea(e.target.value as WorkArea)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
            >
              {[
                'Guest Room',
                'Bathroom',
                'Laundry',
                'Garden',
                'Pool',
                'Common Area',
                'Kitchen',
                'Storage',
                'Maintenance',
                'Other',
              ].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={4}
            required
            value={tplItems}
            onChange={(e) => setTplItems(e.target.value)}
            placeholder="Daftar checklist (satu baris per item)"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Simpan Template</span>
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {t.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t.missionType} · {t.defaultArea} ·{' '}
                    {t.checklistItems.length} item
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(t.id)}
                  aria-label={`Hapus template ${t.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <ul className="text-xs text-slate-600 space-y-1 max-h-40 overflow-y-auto list-disc pl-4">
                {t.checklistItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Settings + Google Sheets 12-Sheet Blueprint
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Pengaturan Aturan & Database 12-Sheet
        </h1>
        <p className="text-sm text-slate-500">
          Konfigurasi jam check-in, batas terlambat, serta ekspor struktur Google Sheets & Apps Script (Code.gs).
        </p>
      </div>

      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Aturan Absensi & Prioritas Guest Request
          </h2>
        </div>
        {settingsMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {settingsMsg}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label
              htmlFor="set-checkin"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Jam Buka Check-In
            </label>
            <input
              id="set-checkin"
              type="time"
              value={settings.checkInStartHour}
              onChange={(e) =>
                setSettings({ ...settings, checkInStartHour: e.target.value })
              }
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="set-late"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Batas Terlambat
            </label>
            <input
              id="set-late"
              type="time"
              value={settings.lateCutoffTime}
              onChange={(e) =>
                setSettings({ ...settings, lateCutoffTime: e.target.value })
              }
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="set-checkout"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Jam Minimal Check-Out
            </label>
            <input
              id="set-checkout"
              type="time"
              value={settings.checkOutMinHour}
              onChange={(e) =>
                setSettings({ ...settings, checkOutMinHour: e.target.value })
              }
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="set-guest-prio"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Prioritas Default Tamu
            </label>
            <select
              id="set-guest-prio"
              value={settings.autoAssignGuestPriority}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autoAssignGuestPriority: e.target.value as MissionPriority,
                })
              }
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
            >
              {(['Normal', 'High', 'Urgent'] as MissionPriority[]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
          <input
            type="checkbox"
            checked={settings.allowEarlyCheckIn}
            onChange={(e) =>
              setSettings({ ...settings, allowEarlyCheckIn: e.target.checked })
            }
            className="w-4 h-4 accent-teal-700"
          />
          <span className="text-sm text-slate-800">
            Izinkan Check-In lebih awal sebelum jam buka
          </span>
        </label>

        <button
          type="submit"
          className="px-5 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium"
        >
          Simpan Pengaturan
        </button>
      </form>

      {/* Google Sheets & Apps Script Mirror */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-700" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Struktur 12 Sheet Google Sheets & Google Apps Script
              </h2>
              <p className="text-xs text-slate-500">
                Unduh file Code.gs siap pakai untuk menginisialisasi 12 sheet di Google Sheets Anda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadAuthorizedFile('/api/export/apps-script', 'TheWina_Code.gs')
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Code.gs</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheetsSchema.map((s) => (
            <div
              key={s.sheetName}
              className="p-3.5 rounded-xl bg-[#F7F6F2] border border-slate-200/80 space-y-1"
            >
              <p className="font-display text-sm font-bold text-slate-900">
                {s.sheetName}
              </p>
              <p className="font-mono text-[11px] text-slate-600 leading-relaxed">
                {s.columns.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
