import React, { useEffect, useState } from 'react';
import { Check, KeyRound, Plus, ShieldAlert, UserCheck, X } from 'lucide-react';
import { apiRequest } from '../../api/client';
import type { BusinessUnit, UserProfile } from '../../domain/types';
import { UserAvatar } from '../StatusIndicator';

interface OwnerStaffTabProps {
  staff: UserProfile[];
  units: BusinessUnit[];
  onRefresh: () => Promise<void>;
}

export function OwnerStaffTab({ staff, units, onRefresh }: OwnerStaffTabProps) {
  const [codeConfigured, setCodeConfigured] = useState(false);
  const [newOwnerCode, setNewOwnerCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newWa, setNewWa] = useState('');
  const [addError, setAddError] = useState('');
  const [resetStaffId, setResetStaffId] = useState<string | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');

  useEffect(() => {
    apiRequest<{ configured: boolean }>('/api/owner/confirmation-code-status')
      .then((res) => setCodeConfigured(res.configured))
      .catch(() => {});
  }, []);

  const pendingStaff = staff.filter((s) => s.status === 'Pending Approval');
  const otherStaff = staff.filter((s) => s.status !== 'Pending Approval');

  const updateStaffStatus = async (
    id: string,
    status: UserProfile['status']
  ) => {
    await apiRequest(`/api/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await onRefresh();
  };

  const toggleUnitAccess = async (s: UserProfile, unitId: string) => {
    const current = new Set(s.assignedUnitIds);
    if (current.has(unitId)) current.delete(unitId);
    else current.add(unitId);
    await apiRequest(`/api/staff/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedUnitIds: Array.from(current) }),
    });
    await onRefresh();
  };

  const saveOwnerCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeMsg('');
    try {
      await apiRequest('/api/owner/confirmation-code', {
        method: 'POST',
        body: JSON.stringify({ code: newOwnerCode }),
      });
      setCodeConfigured(true);
      setNewOwnerCode('');
      setCodeMsg('Kode konfirmasi rahasia Owner berhasil diperbarui.');
    } catch (err: any) {
      setCodeMsg(err.message || 'Gagal menyimpan kode.');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      await apiRequest('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newName,
          username: newUser,
          password: newPass,
          whatsapp: newWa,
        }),
      });
      setNewName('');
      setNewUser('');
      setNewPass('');
      setNewWa('');
      setShowAddStaff(false);
      await onRefresh();
    } catch (err: any) {
      setAddError(err.message || 'Gagal menambah staf.');
    }
  };

  const handleResetPassword = async (staffId: string) => {
    if (resetPassValue.trim().length < 6) return;
    await apiRequest(`/api/staff/${staffId}`, {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: resetPassValue.trim() }),
    });
    setResetStaffId(null);
    setResetPassValue('');
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Manajemen Akun Staf
          </h1>
          <p className="text-sm text-slate-500">
            Setujui pendaftaran staf baru, atur akses unit usaha, dan kelola kode konfirmasi rahasia Owner.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddStaff((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Staf Langsung</span>
        </button>
      </div>

      {/* Add Staff Directly Form */}
      {showAddStaff && (
        <form
          onSubmit={handleCreateStaff}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900">
            Buat Akun Staf Baru (Langsung Aktif)
          </h2>
          {addError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              {addError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Nama Lengkap"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Username"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Kata Sandi (min 6)"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="tel"
              placeholder="Nomor WhatsApp"
              value={newWa}
              onChange={(e) => setNewWa(e.target.value)}
              className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 min-h-[44px] rounded-xl bg-teal-700 text-white text-sm font-medium"
            >
              Simpan Staf
            </button>
            <button
              type="button"
              onClick={() => setShowAddStaff(false)}
              className="px-4 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-700"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Owner Secret Confirmation Code Box (Owner Only) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Kode Konfirmasi Rahasia Owner
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-600">
            Status: {codeConfigured ? 'Aktif (Tersimpan Terenkripsi)' : 'Belum Diatur'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Kode ini hanya diketahui Owner dan tidak pernah ditampilkan ke staf atau publik. Staf yang memasukkan kode ini saat registrasi akan langsung disetujui.
        </p>
        <form onSubmit={saveOwnerCode} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            minLength={4}
            required
            value={newOwnerCode}
            onChange={(e) => setNewOwnerCode(e.target.value)}
            placeholder="Masukkan kode konfirmasi baru (min 4 karakter)"
            className="flex-1 px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium whitespace-nowrap"
          >
            Simpan Kode Rahasia
          </button>
        </form>
        {codeMsg && <p className="text-xs text-teal-700 font-medium">{codeMsg}</p>}
      </section>

      {/* Pending Approvals */}
      {pendingStaff.length > 0 && (
        <section className="bg-white border border-amber-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-800">
            <ShieldAlert className="w-4 h-4" />
            <h2 className="font-display text-base font-bold">
              Menunggu Persetujuan Owner ({pendingStaff.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingStaff.map((s) => (
              <div
                key={s.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar name={s.fullName} src={s.profilePhoto} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {s.fullName}{' '}
                      <span className="font-mono text-xs text-slate-500">
                        @{s.username}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      WA: {s.whatsapp} · Mulai kerja: {s.startDate}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateStaffStatus(s.id, 'Approved')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                  >
                    <Check className="w-4 h-4" />
                    <span>Setujui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStaffStatus(s.id, 'Rejected')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold"
                  >
                    <X className="w-4 h-4" />
                    <span>Tolak</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Staff Directory */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Daftar Staf ({otherStaff.length})
          </h2>
        </div>

        <div className="divide-y divide-slate-100">
          {otherStaff.map((s) => (
            <div key={s.id} className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar name={s.fullName} src={s.profilePhoto} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {s.fullName}{' '}
                      <span className="font-mono text-xs text-slate-500">
                        @{s.username}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      ID: {s.id} · WA: {s.whatsapp || '-'} · Status:{' '}
                      <span
                        className={`font-semibold ${
                          s.status === 'Approved'
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        }`}
                      >
                        {s.status}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStaffId(resetStaffId === s.id ? null : s.id);
                      setResetPassValue('');
                    }}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Atur Sandi
                  </button>
                  {s.status === 'Approved' ? (
                    <button
                      type="button"
                      onClick={() => updateStaffStatus(s.id, 'Suspended')}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateStaffStatus(s.id, 'Approved')}
                      className="px-3 py-2 min-h-[40px] rounded-xl bg-teal-700 text-white text-xs font-medium"
                    >
                      Aktifkan Kembali
                    </button>
                  )}
                </div>
              </div>

              {resetStaffId === s.id && (
                <div className="flex flex-col sm:flex-row gap-2 pl-13">
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Kata sandi baru (minimal 6 karakter)"
                    value={resetPassValue}
                    onChange={(e) => setResetPassValue(e.target.value)}
                    className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleResetPassword(s.id)}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-900 text-white text-xs font-medium"
                  >
                    Simpan Sandi
                  </button>
                </div>
              )}

              {/* Unit Access Toggles */}
              <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-13">
                <span className="text-xs text-slate-500">Akses Unit:</span>
                {units.map((u) => {
                  const has = s.assignedUnitIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUnitAccess(s, u.id)}
                      className={`px-2.5 py-1 min-h-[34px] rounded-lg text-xs font-medium border transition-colors ${
                        has
                          ? 'bg-teal-50 border-teal-600 text-teal-800'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {u.name.replace('The Wina ', '')}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
