import React, { useEffect, useState } from 'react';
import {
  Building2,
  KeyRound,
  QrCode,
  ShieldCheck,
  Upload,
  UserPlus,
} from 'lucide-react';
import { apiRequest, compressImageFile, setAuthToken } from '../api/client';
import type { UserProfile } from '../domain/types';

interface PublicQrLocation {
  qrCodeId: string;
  unitId: string;
  unitName: string;
  roomName: string;
  type: 'room' | 'common';
}

interface AuthScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  onOpenGuestQr: (qrId: string) => void;
}

export function AuthScreen({ onLoginSuccess, onOpenGuestQr }: AuthScreenProps) {
  const [ownerConfigured, setOwnerConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'register' | 'setup-owner'>('login');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // First-Run Owner Setup fields
  const [ownerName, setOwnerName] = useState('Wina Management');
  const [ownerUsername, setOwnerUsername] = useState('owner');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerConfirmCode, setOwnerConfirmCode] = useState('');

  // Staff Registration fields
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [regStartDate, setRegStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [regPhoto, setRegPhoto] = useState('');
  const [regOwnerCode, setRegOwnerCode] = useState('');

  // Public QR Demo Drawer
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLocations, setQrLocations] = useState<PublicQrLocation[]>([]);

  useEffect(() => {
    apiRequest<{ ownerConfigured: boolean; suggestedOwnerUsername: string }>(
      '/api/auth/setup-status'
    )
      .then((res) => {
        setOwnerConfigured(res.ownerConfigured);
        if (!res.ownerConfigured) {
          setOwnerUsername(res.suggestedOwnerUsername || 'owner');
          setMode('setup-owner');
        }
      })
      .catch(() => setOwnerConfigured(true));
  }, []);

  const loadQrLocations = async () => {
    setQrOpen((prev) => !prev);
    if (qrLocations.length === 0) {
      try {
        const data = await apiRequest<{ locations: PublicQrLocation[] }>(
          '/api/public/qr-list'
        );
        setQrLocations(data.locations);
      } catch {
        // ignore
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username: loginUsername,
            password: loginPassword,
          }),
        }
      );
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Gagal masuk.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>(
        '/api/auth/setup-owner',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: ownerName,
            username: ownerUsername,
            password: ownerPassword,
            ownerConfirmationCode: ownerConfirmCode,
          }),
        }
      );
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Gagal mengaktifkan akun Owner.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (regPassword !== regConfirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ status: string; message: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: regName,
            username: regUsername,
            password: regPassword,
            confirmPassword: regConfirmPassword,
            whatsapp: regWhatsapp,
            startDate: regStartDate,
            profilePhoto: regPhoto,
            ownerConfirmationCode: regOwnerCode,
          }),
        }
      );
      setSuccessMsg(res.message);
      setRegPassword('');
      setRegConfirmPassword('');
      setRegOwnerCode('');
      if (res.status === 'Approved') {
        setLoginUsername(regUsername);
        setMode('login');
      }
    } catch (err: any) {
      setError(err.message || 'Pendaftaran gagal.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 512);
      setRegPhoto(compressed);
    } catch (err: any) {
      setError(err.message || 'Gagal memproses foto.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col">
      <header className="w-full border-b border-slate-200/80 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            The Wina Operations
          </div>
          <button
            type="button"
            onClick={loadQrLocations}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200/80 transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>Portal Tamu (QR)</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Brand & Property Overview */}
        <section className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="relative h-64 sm:h-72 lg:h-80 w-full bg-slate-200">
            <img
              src="/src/assets/images/wina_echo_beach_1795663025366.jpg"
              alt="The Wina Echo Beach Guest House"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 text-white">
              <p className="text-xs font-medium text-teal-200 tracking-wide">
                Manajemen Operasional Properti
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1 leading-tight [text-wrap:balance]">
                Koordinasi Staf, Misi & Layanan Tamu dalam Satu Sistem
              </h1>
            </div>
          </div>

          <div className="p-6 space-y-5 flex-1 flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-slate-200/70">
                <p className="text-xs text-slate-500">Unit Usaha Aktif</p>
                <p className="font-display text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                  4 Properti · 24 Kamar
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-slate-200/70">
                <p className="text-xs text-slate-500">Alur Kerja Lapangan</p>
                <p className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  Absensi & Checklist Real-time
                </p>
              </div>
            </div>

            <div className="text-sm text-slate-600 space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                <span>Unit The Wina Terintegrasi</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Echo Beach Guest House (6 kamar) · Guest House 2 (4 kamar) · Guest House 3 (12 kamar) · Villa 2 (2 kamar)
              </p>
            </div>
          </div>
        </section>

        {/* Right Auth Panel */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
          {/* Segmented Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            {ownerConfigured === false && (
              <button
                type="button"
                onClick={() => {
                  setMode('setup-owner');
                  setError('');
                }}
                className={`flex-1 py-2 px-3 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'setup-owner'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aktivasi Owner
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2 px-3 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk Akun
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex-1 py-2 px-3 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar Staf
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
            >
              {successMsg}
            </div>
          )}

          {mode === 'setup-owner' && ownerConfigured === false && (
            <form onSubmit={handleSetupOwner} className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  <span>Aktivasi Akun Owner Pertama</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Tetapkan kata sandi Owner untuk mengamankan akses manajemen dan menyetujui pendaftaran staf.
                </p>
              </div>

              <div>
                <label
                  htmlFor="owner-fullname"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Nama Owner / Manajemen
                </label>
                <input
                  id="owner-fullname"
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="owner-username"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Username Owner
                </label>
                <input
                  id="owner-username"
                  type="text"
                  required
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="owner-password"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kata Sandi Owner (minimal 6 karakter)
                </label>
                <input
                  id="owner-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Buat kata sandi rahasia Owner"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="owner-confirm-code"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kode Konfirmasi Owner (Opsional)
                </label>
                <input
                  id="owner-confirm-code"
                  type="password"
                  placeholder="Kode rahasia untuk verifikasi instan staf baru"
                  value={ownerConfirmCode}
                  onChange={(e) => setOwnerConfirmCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Menyimpan...' : 'Aktifkan & Masuk sebagai Owner'}
              </button>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-teal-700" />
                  <span>Login Sistem Operasional</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Masuk sebagai Owner atau Staf menggunakan username dan kata sandi Anda.
                </p>
              </div>

              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="contoh: owner atau sari_dewi"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kata Sandi
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Memverifikasi...' : 'Masuk'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-700" />
                  <span>Pendaftaran Staf Baru</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Akun baru memerlukan persetujuan Owner atau kode konfirmasi rahasia Owner.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-fullname"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nama Lengkap
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Nama lengkap staf"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-username"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Username
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="huruf_kecil_angka"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Kata Sandi
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-confirm"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Konfirmasi Kata Sandi
                  </label>
                  <input
                    id="reg-confirm"
                    type="password"
                    required
                    minLength={6}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-wa"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nomor WhatsApp
                  </label>
                  <input
                    id="reg-wa"
                    type="tel"
                    required
                    value={regWhatsapp}
                    onChange={(e) => setRegWhatsapp(e.target.value)}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-start"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Tanggal Mulai Bekerja
                  </label>
                  <input
                    id="reg-start"
                    type="date"
                    required
                    value={regStartDate}
                    onChange={(e) => setRegStartDate(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-photo"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Foto Profil (Opsional)
                  </label>
                  <label
                    htmlFor="reg-photo"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 min-h-[44px] rounded-xl border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 shrink-0" />
                    <span>{regPhoto ? 'Foto dipilih' : 'Pilih Foto'}</span>
                  </label>
                  <input
                    id="reg-photo"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-code"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Kode Konfirmasi Owner (Opsional)
                  </label>
                  <input
                    id="reg-code"
                    type="password"
                    value={regOwnerCode}
                    onChange={(e) => setRegOwnerCode(e.target.value)}
                    placeholder="Kosongkan jika belum ada"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Mengirim Pendaftaran...' : 'Daftar Akun Staf'}
              </button>
            </form>
          )}
        </section>
      </main>

      {/* Public Guest QR Directory Drawer */}
      {qrOpen && (
        <section className="max-w-6xl w-full mx-auto px-4 sm:px-6 pb-10">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Akses Langsung Halaman Tamu (Simulasi Scan QR Kamar)
                </h3>
                <p className="text-xs text-slate-500">
                  Tamu dapat memindai QR Code kamar atau area umum tanpa login untuk mengirim permintaan layanan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Tutup
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {qrLocations.map((loc) => (
                <button
                  key={loc.qrCodeId}
                  type="button"
                  onClick={() => onOpenGuestQr(loc.qrCodeId)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                >
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {loc.roomName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {loc.unitName.replace('The Wina ', '')}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
