import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { isMissionOverdue } from '../../domain/missionRules';
import type {
  BusinessUnit,
  Mission,
  MissionDistribution,
  MissionPriority,
  MissionTemplate,
  MissionType,
  RecurrencePattern,
  RoomLocation,
  UserProfile,
  WorkArea,
} from '../../domain/types';
import {
  MissionStatusLabel,
  PriorityLabel,
  ProgressBar,
  formatDateTime,
} from '../StatusIndicator';

interface OwnerMissionsTabProps {
  missions: Mission[];
  units: BusinessUnit[];
  rooms: RoomLocation[];
  staff: UserProfile[];
  templates: MissionTemplate[];
  showCreateModal: boolean;
  setShowCreateModal: (v: boolean) => void;
  onSelectMission: (id: string) => void;
  onRefresh: () => Promise<void>;
}

const AREAS: WorkArea[] = [
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
];

const MISSION_TYPES: MissionType[] = [
  'Room Cleaning',
  'Laundry',
  'Garden Cleaning',
  'General Cleaning',
  'Bathroom Cleaning',
  'Pool Cleaning',
  'Maintenance',
  'Restocking',
  'Guest Request',
  'Other',
];

export function OwnerMissionsTab({
  missions,
  units,
  rooms,
  staff,
  templates,
  showCreateModal,
  setShowCreateModal,
  onSelectMission,
  onRefresh,
}: OwnerMissionsTabProps) {
  const [statusTab, setStatusTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [recurringBusy, setRecurringBusy] = useState(false);

  // Create mission state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState(units[0]?.id || 'UNIT-01');
  const [roomId, setRoomId] = useState('');
  const [area, setArea] = useState<WorkArea>('Guest Room');
  const [missionType, setMissionType] = useState<MissionType>('Room Cleaning');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MissionPriority>('Normal');
  const [distributionType, setDistributionType] =
    useState<MissionDistribution>('Open Mission');
  const [isTeamMission, setIsTeamMission] = useState(false);
  const [leadStaffId, setLeadStaffId] = useState('');
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('none');
  const [ownerNotes, setOwnerNotes] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const approvedStaff = useMemo(
    () => staff.filter((s) => s.status === 'Approved'),
    [staff]
  );

  const unitRooms = useMemo(
    () => rooms.filter((r) => r.unitId === unitId),
    [rooms, unitId]
  );

  const applyTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setMissionType(tpl.missionType);
    setArea(tpl.defaultArea);
    if (!title.trim()) {
      setTitle(tpl.name);
    }
    setChecklistText(tpl.checklistItems.join('\n'));
  };

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const checklistItems = checklistText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      await apiRequest('/api/missions', {
        method: 'POST',
        body: JSON.stringify({
          title,
          unitId,
          roomId: roomId || null,
          area,
          missionType,
          description,
          priority,
          distributionType,
          isTeamMission,
          leadStaffId: distributionType === 'Assigned Mission' ? leadStaffId : null,
          deadline: new Date(deadline).toISOString(),
          recurrence,
          ownerNotes,
          checklistItems,
        }),
      });
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setOwnerNotes('');
      setChecklistText('');
      setSelectedTemplateId('');
      await onRefresh();
    } catch (err: any) {
      setCreateError(err.message || 'Gagal membuat misi.');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateRecurring = async () => {
    setRecurringBusy(true);
    try {
      await apiRequest('/api/missions/generate-recurring', { method: 'POST' });
      await onRefresh();
    } finally {
      setRecurringBusy(false);
    }
  };

  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (unitFilter && m.unitId !== unitFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit =
          m.title.toLowerCase().includes(q) ||
          m.unitName.toLowerCase().includes(q) ||
          m.roomName.toLowerCase().includes(q) ||
          (m.leadStaffName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusTab === 'all') return true;
      if (statusTab === 'overdue') return isMissionOverdue(m);
      return m.status === statusTab;
    });
  }, [missions, statusTab, search, unitFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Monitoring & Pembagian Misi
          </h1>
          <p className="text-sm text-slate-500">
            Kelola Open Mission, Assigned Mission, pekerjaan bersama, checklist, dan revisi tanpa menghambat penyelesaian staf.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={recurringBusy}
            onClick={handleGenerateRecurring}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold whitespace-nowrap"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Terbitkan Misi Berulang</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Misi</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {[
          { id: 'all', label: 'Semua' },
          { id: 'Available', label: 'Belum Diambil' },
          { id: 'Accepted', label: 'Sudah Diambil' },
          { id: 'In Progress', label: 'Dikerjakan' },
          { id: 'Paused', label: 'Dijeda' },
          { id: 'Completed', label: 'Selesai' },
          { id: 'overdue', label: 'Terlambat' },
          { id: 'Revision Required', label: 'Revisi' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatusTab(t.id)}
            className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              statusTab === t.id
                ? 'bg-teal-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search & Unit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari misi, kamar, atau nama staf..."
            className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm"
          />
        </div>
        <select
          aria-label="Filter Unit"
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm"
        >
          <option value="">Semua Unit Usaha</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mission Table / Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Tidak ada misi sesuai filter saat ini.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-4 font-semibold">Misi</th>
                  <th className="py-3 px-4 font-semibold">Unit & Lokasi</th>
                  <th className="py-3 px-4 font-semibold">Penanggung Jawab</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold w-36">Progres</th>
                  <th className="py-3 px-4 font-semibold">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onSelectMission(m.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {m.missionType} · {m.distributionType}
                        {m.isTeamMission ? ' · Team' : ''} ·{' '}
                        <PriorityLabel priority={m.priority} />
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      <p className="font-medium">{m.unitName}</p>
                      <p className="text-slate-500">{m.roomName || m.area}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      <p className="font-medium">{m.leadStaffName || '-'}</p>
                      {m.additionalStaff.length > 1 && (
                        <p className="text-slate-500">
                          +{m.additionalStaff.length - 1} anggota tim
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <MissionStatusLabel
                        status={m.status}
                        isOverdue={isMissionOverdue(m)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <ProgressBar progress={m.progress} />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateTime(m.deadline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Mission Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buat Misi Baru"
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Buat Misi Operasional Baru
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Tutup form misi"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateMission}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {createError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                  {createError}
                </div>
              )}

              <div>
                <label
                  htmlFor="new-tpl"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Gunakan Template Misi Default (Opsional)
                </label>
                <select
                  id="new-tpl"
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="">-- Buat Manual --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.checklistItems.length} checklist)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-title"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nama Misi
                </label>
                <input
                  id="new-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Room Cleaning Kamar 102"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-unit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Unit Usaha
                  </label>
                  <select
                    id="new-unit"
                    value={unitId}
                    onChange={(e) => {
                      setUnitId(e.target.value);
                      setRoomId('');
                    }}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-room"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Kamar / Lokasi
                  </label>
                  <select
                    id="new-room"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Umum / Seluruh Area</option>
                    {unitRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-type"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Jenis Misi
                  </label>
                  <select
                    id="new-type"
                    value={missionType}
                    onChange={(e) => setMissionType(e.target.value as MissionType)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {MISSION_TYPES.map((mt) => (
                      <option key={mt} value={mt}>
                        {mt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-area"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Area Pekerjaan
                  </label>
                  <select
                    id="new-area"
                    value={area}
                    onChange={(e) => setArea(e.target.value as WorkArea)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-priority"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Prioritas
                  </label>
                  <select
                    id="new-priority"
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as MissionPriority)
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {(['Low', 'Normal', 'High', 'Urgent'] as MissionPriority[]).map(
                      (p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-dist"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Pembagian Misi
                  </label>
                  <select
                    id="new-dist"
                    value={distributionType}
                    onChange={(e) =>
                      setDistributionType(e.target.value as MissionDistribution)
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="Open Mission">
                      Open Mission (Staf ambil langsung)
                    </option>
                    <option value="Assigned Mission">
                      Assigned Mission (Tentukan Staf)
                    </option>
                  </select>
                </div>

                {distributionType === 'Assigned Mission' ? (
                  <div>
                    <label
                      htmlFor="new-staff"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Pilih Staf
                    </label>
                    <select
                      id="new-staff"
                      required
                      value={leadStaffId}
                      onChange={(e) => setLeadStaffId(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Pilih Staf --</option>
                      {approvedStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="new-recur"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Jadwal Berulang
                    </label>
                    <select
                      id="new-recur"
                      value={recurrence}
                      onChange={(e) =>
                        setRecurrence(e.target.value as RecurrencePattern)
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="none">Sekali Saja</option>
                      <option value="daily">Harian (Daily)</option>
                      <option value="weekly">Mingguan (Weekly)</option>
                      <option value="monthly">Bulanan (Monthly)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label
                    htmlFor="new-deadline"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Deadline
                  </label>
                  <input
                    id="new-deadline"
                    type="datetime-local"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <label className="flex items-center gap-2.5 pt-5 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={isTeamMission}
                    onChange={(e) => setIsTeamMission(e.target.checked)}
                    className="w-4 h-4 accent-teal-700"
                  />
                  <span className="text-sm font-medium text-slate-800">
                    Aktifkan Pekerjaan Bersama (Team Mission)
                  </span>
                </label>
              </div>

              <div>
                <label
                  htmlFor="new-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Deskripsi Tugas
                </label>
                <textarea
                  id="new-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instruksi detail untuk staf..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="new-checklist"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Item Checklist (satu baris per item)
                </label>
                <textarea
                  id="new-checklist"
                  rows={5}
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  placeholder="Membersihkan tempat tidur&#10;Mengganti linen&#10;Membersihkan kamar mandi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-sans"
                />
              </div>

              <div>
                <label
                  htmlFor="new-owner-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Catatan Owner (Opsional)
                </label>
                <input
                  id="new-owner-notes"
                  type="text"
                  value={ownerNotes}
                  onChange={(e) => setOwnerNotes(e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium disabled:opacity-60"
                >
                  {creating ? 'Menyimpan...' : 'Terbitkan Misi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
