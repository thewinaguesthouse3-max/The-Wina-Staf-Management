import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  MapPin,
  Send,
  Sparkles,
} from 'lucide-react';
import { apiRequest, compressImageFile } from '../api/client';
import type { GuestRequestType } from '../domain/types';

interface GuestPortalProps {
  qrId: string;
  onExitGuest?: () => void;
}

interface QrLocationInfo {
  qrCodeId: string;
  unitId: string;
  unitName: string;
  roomId: string;
  roomName: string;
  type: 'room' | 'common';
}

const REQUEST_OPTIONS: { value: GuestRequestType; label: string; desc: string }[] = [
  {
    value: 'Room Cleaning',
    label: 'Room Cleaning',
    desc: 'Pembersihan kamar & perapihan tempat tidur',
  },
  {
    value: 'Request Clean Towels',
    label: 'Request Clean Towels',
    desc: 'Permintaan handuk mandi / handuk kolam bersih',
  },
  {
    value: 'Request New Bed Sheets',
    label: 'Request New Bed Sheets',
    desc: 'Penggantian sprei dan sarung bantal baru',
  },
  {
    value: 'Request Drinking Water',
    label: 'Request Drinking Water',
    desc: 'Pengisian ulang air minum kemasan / galon',
  },
  {
    value: 'Request Amenities',
    label: 'Request Amenities',
    desc: 'Sabun, sampo, sikat gigi, tisu, kopi/teh',
  },
  {
    value: 'Request Room Service Assistance',
    label: 'Request Room Service Assistance',
    desc: 'Bantuan layanan kamar atau kebutuhan tamu lainnya',
  },
  {
    value: 'Report Maintenance',
    label: 'Report Maintenance',
    desc: 'Perbaikan AC, lampu, shower, pintu, atau fasilitas',
  },
  {
    value: 'Report Problem',
    label: 'Report Problem',
    desc: 'Kendala kebersihan, kebisingan, atau masalah darurat',
  },
  {
    value: 'Other Request',
    label: 'Other Request',
    desc: 'Permintaan khusus lainnya',
  },
];

export function GuestPortal({ qrId, onExitGuest }: GuestPortalProps) {
  const [location, setLocation] = useState<QrLocationInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [requestType, setRequestType] = useState<GuestRequestType>('Room Cleaning');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    requestId: string;
    missionId: string;
    unitName: string;
    roomName: string;
    requestType: string;
    requestedAt: string;
  } | null>(null);

  useEffect(() => {
    setLoadError('');
    apiRequest<QrLocationInfo>(`/api/public/qr/${encodeURIComponent(qrId)}`)
      .then(setLocation)
      .catch((err: any) =>
        setLoadError(err.message || 'QR Code lokasi tidak ditemukan.')
      );
  }, [qrId]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 960);
      setPhoto(compressed);
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal membaca foto.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const result = await apiRequest('/api/public/guest-requests', {
        method: 'POST',
        body: JSON.stringify({
          qrCodeId: qrId,
          requestType,
          description,
          photo,
        }),
      });
      setConfirmation(result);
      setDescription('');
      setPhoto('');
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal mengirim permintaan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {onExitGuest && (
              <button
                type="button"
                onClick={onExitGuest}
                aria-label="Kembali ke halaman masuk"
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <span className="font-display font-bold text-base text-slate-900 truncate">
              The Wina Guest Service
            </span>
          </div>
          <span className="font-mono text-xs text-slate-500 whitespace-nowrap shrink-0">
            {qrId}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 sm:py-8">
        {loadError ? (
          <div className="bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <p className="font-display font-semibold text-slate-900">
              QR Code Tidak Valid
            </p>
            <p className="text-sm text-slate-600">{loadError}</p>
          </div>
        ) : !location ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
            Memuat informasi kamar...
          </div>
        ) : confirmation ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Permintaan Anda Telah Dikirim
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                Tim operasional kami di <strong>{confirmation.unitName}</strong> telah menerima permintaan untuk{' '}
                <strong>{confirmation.roomName}</strong> dan akan segera menanganinya.
              </p>
            </div>
            <div className="bg-[#F7F6F2] border border-slate-200 rounded-xl p-4 text-left text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">ID Permintaan</span>
                <span className="font-mono text-xs font-semibold text-slate-900">
                  {confirmation.requestId}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Layanan</span>
                <span className="font-medium text-slate-900">
                  {confirmation.requestType}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Lokasi</span>
                <span className="font-medium text-slate-900">
                  {confirmation.roomName}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmation(null)}
              className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors"
            >
              Kirim Permintaan Lainnya
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-teal-700">
                    Lokasi Terdeteksi dari QR Code
                  </p>
                  <h1 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                    {location.roomName}
                  </h1>
                  <p className="text-sm text-slate-600">{location.unitName}</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span>Pilih Jenis Permintaan Layanan</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tidak perlu login. Tim kami siap membantu langsung di kamar atau area Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {REQUEST_OPTIONS.map((opt) => {
                  const active = requestType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRequestType(opt.value)}
                      className={`text-left p-3.5 rounded-xl border transition-colors min-h-[44px] ${
                        active
                          ? 'bg-teal-50/70 border-teal-700 text-slate-900'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div>
                <label
                  htmlFor="guest-notes"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Pesan Tambahan (Opsional)
                </label>
                <textarea
                  id="guest-notes"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Mohon kirim 2 handuk tambahan atau cek AC kamar kurang dingin..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="guest-photo"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Lampirkan Foto (Opsional)
                </label>
                <label
                  htmlFor="guest-photo"
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 cursor-pointer text-sm text-slate-600"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{photo ? 'Foto terlampir (ketuk untuk ganti)' : 'Ambil / Pilih Foto'}</span>
                </label>
                <input
                  id="guest-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhoto}
                  className="sr-only"
                />
                {photo && (
                  <img
                    src={photo}
                    alt="Lampiran tamu"
                    referrerPolicy="no-referrer"
                    className="mt-3 w-full max-h-48 object-cover rounded-xl border border-slate-200"
                  />
                )}
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 min-h-[48px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Mengirim...' : 'Submit Request'}</span>
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
