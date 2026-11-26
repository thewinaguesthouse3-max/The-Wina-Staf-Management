import React, { useState } from 'react';
import {
  Building2,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Save,
} from 'lucide-react';
import { apiRequest } from '../../api/client';
import type { BusinessUnit, RoomLocation } from '../../domain/types';

interface OwnerUnitsQrTabProps {
  units: BusinessUnit[];
  rooms: RoomLocation[];
  onRefresh: () => Promise<void>;
  onOpenGuestQr: (qrId: string) => void;
}

export function OwnerUnitsQrTab({
  units,
  rooms,
  onRefresh,
  onOpenGuestQr,
}: OwnerUnitsQrTabProps) {
  const [selectedUnitId, setSelectedUnitId] = useState(units[0]?.id || 'UNIT-01');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<'room' | 'common'>('room');
  const [busy, setBusy] = useState(false);

  const selectedUnit = units.find((u) => u.id === selectedUnitId) || units[0];
  const unitRooms = rooms.filter((r) => r.unitId === selectedUnit?.id);

  const handleRenameRoom = async (roomId: string) => {
    if (!editRoomName.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editRoomName.trim() }),
      });
      setEditingRoomId(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit || !newRoomName.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/units/${selectedUnit.id}/rooms`, {
        method: 'POST',
        body: JSON.stringify({ name: newRoomName.trim(), type: newRoomType }),
      });
      setNewRoomName('');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Unit Usaha, Kamar & QR Code Tamu
          </h1>
          <p className="text-sm text-slate-500">
            Kelola nama kamar secara manual dan cetak QR Code unik untuk setiap kamar maupun area bersama.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Kartu QR</span>
        </button>
      </div>

      {/* 4 Units Selector Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 no-print">
        {units.map((u) => {
          const active = selectedUnit?.id === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUnitId(u.id)}
              className={`text-left bg-white rounded-2xl border overflow-hidden transition-colors ${
                active
                  ? 'border-teal-700 ring-1 ring-teal-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="h-28 w-full bg-slate-200 relative">
                <img
                  src={u.imageUrl}
                  alt={u.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3.5">
                <p className="font-display text-sm font-bold text-slate-900 line-clamp-1">
                  {u.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {u.roomCount} Kamar · {u.hasPool ? 'Ada Kolam' : 'Guest House'}
                </p>
              </div>
            </button>
          );
        })}
      </section>

      {selectedUnit && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {selectedUnit.name}
                </h2>
                <p className="text-xs text-slate-500">{selectedUnit.address}</p>
              </div>
            </div>

            <form onSubmit={handleAddRoom} className="flex flex-wrap gap-2 no-print">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Nama kamar / area baru..."
                className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm"
              />
              <select
                aria-label="Tipe lokasi"
                value={newRoomType}
                onChange={(e) =>
                  setNewRoomType(e.target.value as 'room' | 'common')
                }
                className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="room">Kamar Tamu</option>
                <option value="common">Area Bersama</option>
              </select>
              <button
                type="submit"
                disabled={busy || !newRoomName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah</span>
              </button>
            </form>
          </div>

          {/* Room & QR Code Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unitRooms.map((r) => (
              <div
                key={r.id}
                className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 bg-[#F7F6F2]/50"
              >
                <div className="flex items-start justify-between gap-2">
                  {editingRoomId === r.id ? (
                    <div className="flex-1 flex gap-1.5">
                      <input
                        type="text"
                        value={editRoomName}
                        onChange={(e) => setEditRoomName(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-slate-300 text-sm bg-white"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRenameRoom(r.id)}
                        aria-label="Simpan nama kamar"
                        className="px-2.5 py-1.5 min-h-[38px] rounded-lg bg-teal-700 text-white text-xs"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="font-display text-base font-bold text-slate-900 truncate">
                        {r.name}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {r.qrCodeId} · {r.type === 'common' ? 'Umum' : 'Kamar'}
                      </p>
                    </div>
                  )}

                  {editingRoomId !== r.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoomId(r.id);
                        setEditRoomName(r.name);
                      }}
                      aria-label={`Ubah nama ${r.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 no-print"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Live Scannable QR SVG */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2">
                  <img
                    src={`/api/qr-svg/${encodeURIComponent(r.qrCodeId)}`}
                    alt={`QR Code ${r.name}`}
                    className="w-36 h-36"
                  />
                  <p className="text-[11px] text-slate-500 text-center">
                    Scan untuk Layanan Kamar / Guest Request
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenGuestQr(r.qrCodeId)}
                  className="w-full py-2 px-3 min-h-[40px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 no-print"
                >
                  <QrCode className="w-3.5 h-3.5 text-teal-700" />
                  <span>Buka Form Tamu</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
