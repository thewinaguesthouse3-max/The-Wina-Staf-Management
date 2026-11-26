import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckSquare,
  Clock,
  History,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { apiRequest, compressImageFile } from '../api/client';
import { isMissionOverdue } from '../domain/missionRules';
import type {
  Mission,
  MissionProgress,
  UserProfile,
} from '../domain/types';
import {
  MissionStatusLabel,
  PriorityLabel,
  ProgressBar,
  formatDateTime,
} from './StatusIndicator';

interface MissionDetailModalProps {
  missionId: string;
  currentUser: UserProfile;
  onClose: () => void;
  onMissionUpdated: (mission: Mission) => void;
}

export function MissionDetailModal({
  missionId,
  currentUser,
  onClose,
  onMissionUpdated,
}: MissionDetailModalProps) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [showPauseBox, setShowPauseBox] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionBox, setShowRevisionBox] = useState(false);

  const loadMission = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ mission: Mission }>(
        `/api/missions/${missionId}`
      );
      setMission(data.mission);
      setNotesInput(data.mission.staffNotes || '');
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail misi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMission();
  }, [missionId]);

  const runAction = async (
    path: string,
    method: 'POST' | 'PATCH',
    body?: Record<string, unknown>
  ) => {
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest<{ mission: Mission }>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMission(data.mission);
      setNotesInput(data.mission.staffNotes || '');
      onMissionUpdated(data.mission);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui misi.');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoUpload = async (
    kind: 'beforePhoto' | 'afterPhoto',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !mission) return;
    try {
      const compressed = await compressImageFile(file, 1024);
      await runAction(`/api/missions/${mission.id}/progress`, 'PATCH', {
        [kind]: compressed,
      });
    } catch (err: any) {
      setError(err.message || 'Gagal mengunggah foto.');
    }
  };

  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mission || !newChecklistItem.trim()) return;
    await runAction(`/api/missions/${mission.id}/checklist`, 'POST', {
      title: newChecklistItem.trim(),
    });
    setNewChecklistItem('');
  };

  const isParticipant =
    mission &&
    (currentUser.role === 'OWNER' ||
      mission.leadStaffId === currentUser.id ||
      mission.additionalStaff.some((a) => a.staffId === currentUser.id));

  const canClaim =
    mission &&
    currentUser.role === 'STAFF' &&
    mission.distributionType === 'Open Mission' &&
    mission.status === 'Available' &&
    !mission.leadStaffId;

  const canJoinTeam =
    mission &&
    currentUser.role === 'STAFF' &&
    mission.isTeamMission &&
    mission.leadStaffId !== currentUser.id &&
    !mission.additionalStaff.some((a) => a.staffId === currentUser.id) &&
    ['Accepted', 'In Progress', 'Paused', 'Revision Required'].includes(
      mission.status
    );

  const overdue = mission ? isMissionOverdue(mission) : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detail Misi"
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-500">
              {mission ? mission.id : missionId}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900 truncate">
              {mission ? mission.title : 'Memuat misi...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail misi"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {loading || !mission ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Memuat data misi...
            </div>
          ) : (
            <>
              {/* Metadata & Progress */}
              <div className="space-y-3 pb-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MissionStatusLabel
                    status={mission.status}
                    isOverdue={overdue}
                  />
                  <PriorityLabel priority={mission.priority} />
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-slate-800">
                    {mission.unitName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{mission.roomName || mission.area}</span>
                  <span aria-hidden="true">·</span>
                  <span>{mission.missionType}</span>
                  <span aria-hidden="true">·</span>
                  <span>{mission.distributionType}</span>
                  {mission.isTeamMission && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-teal-700 font-medium">
                        Team Mission
                      </span>
                    </>
                  )}
                </div>

                {mission.description && (
                  <p className="text-sm text-slate-700 leading-relaxed bg-[#F7F6F2] p-3.5 rounded-xl border border-slate-200/70">
                    {mission.description}
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block">Deadline</span>
                    <span
                      className={`font-mono font-medium tabular-nums ${
                        overdue ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {formatDateTime(mission.deadline)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Penanggung Jawab</span>
                    <span className="font-medium text-slate-900">
                      {mission.leadStaffName || 'Belum diambil'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Waktu Mulai</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {formatDateTime(mission.startedAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Waktu Selesai</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {formatDateTime(mission.completedAt)}
                    </span>
                  </div>
                </div>

                {mission.additionalStaff.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 pt-1">
                    <Users className="w-4 h-4 text-teal-700 shrink-0" />
                    <span>
                      Tim:{' '}
                      {mission.additionalStaff
                        .map((a) => a.staffName)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {mission.ownerNotes && (
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950">
                    <span className="font-semibold">Catatan Owner: </span>
                    {mission.ownerNotes}
                  </div>
                )}

                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Progres Pekerjaan</span>
                  </div>
                  <ProgressBar progress={mission.progress} />
                </div>
              </div>

              {/* Staff / Owner Action Bar */}
              <div className="flex flex-wrap gap-2">
                {canClaim && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(`/api/missions/${mission.id}/claim`, 'POST')
                    }
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    Ambil Misi
                  </button>
                )}

                {canJoinTeam && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(`/api/missions/${mission.id}/join`, 'POST')
                    }
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    Gabung Team Mission
                  </button>
                )}

                {isParticipant &&
                  ['Accepted', 'Revision Required'].includes(mission.status) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(`/api/missions/${mission.id}/start`, 'POST')
                      }
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <Play className="w-4 h-4" />
                      <span>Start Mission</span>
                    </button>
                  )}

                {isParticipant && mission.status === 'In Progress' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowPauseBox((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Jeda Pekerjaan</span>
                  </button>
                )}

                {isParticipant && mission.status === 'Paused' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(`/api/missions/${mission.id}/resume`, 'POST')
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    <span>Lanjutkan Misi</span>
                  </button>
                )}

                {currentUser.role === 'OWNER' &&
                  mission.status === 'Completed' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowRevisionBox((v) => !v)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-800 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Minta Revisi</span>
                    </button>
                  )}

                {currentUser.role === 'OWNER' &&
                  !['Completed', 'Cancelled'].includes(mission.status) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(`/api/missions/${mission.id}/cancel`, 'POST', {
                          note: 'Dibatalkan oleh Owner',
                        })
                      }
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Batalkan Misi</span>
                    </button>
                  )}
              </div>

              {showPauseBox && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <label
                    htmlFor="pause-reason"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Alasan Menjeda Pekerjaan
                  </label>
                  <input
                    id="pause-reason"
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="Contoh: Menunggu stok linen bersih atau istirahat siang"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !pauseReason.trim()}
                      onClick={async () => {
                        await runAction(
                          `/api/missions/${mission.id}/pause`,
                          'POST',
                          { reason: pauseReason }
                        );
                        setShowPauseBox(false);
                        setPauseReason('');
                      }}
                      className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-medium disabled:opacity-50"
                    >
                      Simpan Jeda
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPauseBox(false)}
                      className="px-3 py-2 text-xs text-slate-600"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {showRevisionBox && (
                <div className="p-4 rounded-xl bg-orange-50/70 border border-orange-200 space-y-2.5">
                  <label
                    htmlFor="revision-note"
                    className="block text-xs font-semibold text-orange-900"
                  >
                    Catatan Revisi untuk Staf
                  </label>
                  <input
                    id="revision-note"
                    type="text"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="Contoh: Kaca kamar mandi masih berembun, mohon lap ulang."
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-orange-300 text-sm bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !revisionNote.trim()}
                      onClick={async () => {
                        await runAction(
                          `/api/missions/${mission.id}/revise`,
                          'POST',
                          { note: revisionNote }
                        );
                        setShowRevisionBox(false);
                        setRevisionNote('');
                      }}
                      className="px-4 py-2 min-h-[44px] rounded-xl bg-orange-700 text-white text-xs font-medium disabled:opacity-50"
                    >
                      Kirim Permintaan Revisi
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRevisionBox(false)}
                      className="px-3 py-2 text-xs text-slate-600"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Checklist Pekerjaan (
                    {mission.checklist.filter((c) => c.isCompleted).length}/
                    {mission.checklist.length})
                  </h3>
                  <span className="text-xs text-slate-500">
                    100% otomatis menyelesaikan misi
                  </span>
                </div>

                {mission.checklist.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Belum ada item checklist. Gunakan tombol progres manual di bawah atau tambah item.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {mission.checklist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!isParticipant || busy || mission.status === 'Cancelled'}
                        onClick={() =>
                          runAction(
                            `/api/missions/${mission.id}/checklist/${item.id}`,
                            'PATCH',
                            { isCompleted: !item.isCompleted }
                          )
                        }
                        className="w-full text-left px-3.5 py-3 min-h-[44px] flex items-start gap-3 hover:bg-slate-50 transition-colors disabled:opacity-70"
                      >
                        {item.isCompleted ? (
                          <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              item.isCompleted
                                ? 'line-through text-slate-400'
                                : 'text-slate-900'
                            }`}
                          >
                            {item.title}
                          </p>
                          {(item.completedByName || item.assignedToName) && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {item.completedByName
                                ? `Selesai oleh ${item.completedByName}`
                                : `Ditugaskan: ${item.assignedToName}`}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {isParticipant && mission.status !== 'Cancelled' && (
                  <form onSubmit={handleAddChecklist} className="flex gap-2">
                    <input
                      type="text"
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      placeholder="Tambah item checklist baru..."
                      className="flex-1 px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busy || !newChecklistItem.trim()}
                      className="px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah</span>
                    </button>
                  </form>
                )}
              </div>

              {/* Manual Progress Controls + Photos + Staff Notes */}
              {isParticipant && mission.status !== 'Cancelled' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Perbarui Progres Manual
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {([0, 25, 50, 75, 100] as MissionProgress[]).map((step) => (
                        <button
                          key={step}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              `/api/missions/${mission.id}/progress`,
                              'PATCH',
                              { progress: step }
                            )
                          }
                          className={`py-2 min-h-[44px] rounded-xl font-mono text-xs font-semibold border transition-colors tabular-nums ${
                            mission.progress === step
                              ? 'bg-teal-700 text-white border-teal-700'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {step}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Photos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-700 block">
                        Foto Sebelum Pekerjaan
                      </span>
                      {mission.beforePhoto && (
                        <img
                          src={mission.beforePhoto}
                          alt="Foto sebelum"
                          referrerPolicy="no-referrer"
                          className="w-full h-36 object-cover rounded-xl border border-slate-200"
                        />
                      )}
                      <label className="flex items-center justify-center gap-2 py-2.5 px-3 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-xs text-slate-700 cursor-pointer">
                        <Camera className="w-4 h-4" />
                        <span>
                          {mission.beforePhoto
                            ? 'Ganti Foto Sebelum'
                            : 'Unggah Foto Sebelum'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handlePhotoUpload('beforePhoto', e)}
                        />
                      </label>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-700 block">
                        Foto Setelah Pekerjaan
                      </span>
                      {mission.afterPhoto && (
                        <img
                          src={mission.afterPhoto}
                          alt="Foto setelah"
                          referrerPolicy="no-referrer"
                          className="w-full h-36 object-cover rounded-xl border border-slate-200"
                        />
                      )}
                      <label className="flex items-center justify-center gap-2 py-2.5 px-3 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-xs text-slate-700 cursor-pointer">
                        <Camera className="w-4 h-4" />
                        <span>
                          {mission.afterPhoto
                            ? 'Ganti Foto Setelah'
                            : 'Unggah Foto Setelah'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handlePhotoUpload('afterPhoto', e)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Staff Notes */}
                  <div className="space-y-2">
                    <label
                      htmlFor="mission-staff-notes"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Catatan Staf
                    </label>
                    <textarea
                      id="mission-staff-notes"
                      rows={2}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Tambahkan catatan hasil pekerjaan atau barang yang perlu diisi ulang..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          `/api/missions/${mission.id}/progress`,
                          'PATCH',
                          { staffNotes: notesInput }
                        )
                      }
                      className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
                    >
                      Simpan Catatan
                    </button>
                  </div>
                </div>
              )}

              {/* Read-only photos for non-participant or overview */}
              {!isParticipant && (mission.beforePhoto || mission.afterPhoto) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  {mission.beforePhoto && (
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1">
                        Foto Sebelum
                      </p>
                      <img
                        src={mission.beforePhoto}
                        alt="Foto sebelum"
                        referrerPolicy="no-referrer"
                        className="w-full h-36 object-cover rounded-xl border border-slate-200"
                      />
                    </div>
                  )}
                  {mission.afterPhoto && (
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1">
                        Foto Setelah
                      </p>
                      <img
                        src={mission.afterPhoto}
                        alt="Foto setelah"
                        referrerPolicy="no-referrer"
                        className="w-full h-36 object-cover rounded-xl border border-slate-200"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Immutable Mission History */}
              <div className="space-y-2.5 pt-3 border-t border-slate-200">
                <h3 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-700" />
                  <span>Riwayat Aktivitas Misi</span>
                </h3>
                {!mission.history || mission.history.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada riwayat aktivitas.</p>
                ) : (
                  <div className="space-y-2">
                    {mission.history.map((h) => (
                      <div
                        key={h.id}
                        className="p-3 rounded-xl bg-[#F7F6F2] border border-slate-200/70 text-xs flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {h.activity} · {h.actorName}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(h.timestamp)}
                          </span>
                        </div>
                        <div className="text-slate-600 flex flex-wrap gap-x-2">
                          {h.newStatus && (
                            <span>
                              Status: {h.previousStatus || '-'} → {h.newStatus}
                            </span>
                          )}
                          <span>
                            Progres: {h.previousProgress}% → {h.newProgress}%
                          </span>
                          {h.checklistChanged && (
                            <span>Checklist: {h.checklistChanged}</span>
                          )}
                        </div>
                        {h.note && (
                          <p className="text-slate-700 italic">"{h.note}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
