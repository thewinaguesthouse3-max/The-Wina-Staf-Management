import React, { useEffect, useState } from 'react';
import { setAuthToken } from './api/client';
import { AuthScreen } from './components/AuthScreen';
import { GuestPortal } from './components/GuestPortal';
import { OwnerDashboard } from './components/OwnerDashboard';
import { StaffDashboard } from './components/StaffDashboard';
import type { UserProfile } from './domain/types';

function readQrParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const qr = params.get('qr');
  return qr && qr.trim().length > 0 ? qr.trim() : null;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestQrId, setGuestQrId] = useState<string | null>(() => readQrParam());

  useEffect(() => {
    const onPopState = () => setGuestQrId(readQrParam());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openGuestQr = (qrId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('qr', qrId);
    window.history.pushState({}, '', url.toString());
    setGuestQrId(qrId);
  };

  const exitGuestQr = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('qr');
    window.history.pushState({}, '', url.toString());
    setGuestQrId(null);
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
  };

  if (guestQrId) {
    return (
      <GuestPortal
        qrId={guestQrId}
        onExitGuest={exitGuestQr}
      />
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onLoginSuccess={(loggedIn) => setUser(loggedIn)}
        onOpenGuestQr={openGuestQr}
      />
    );
  }

  if (user.role === 'OWNER') {
    return (
      <OwnerDashboard
        user={user}
        onLogout={handleLogout}
        onOpenGuestQr={openGuestQr}
      />
    );
  }

  return <StaffDashboard user={user} onLogout={handleLogout} />;
}
