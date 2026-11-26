import express from 'express';
import QRCode from 'qrcode';
import {
  calculateProgressFromChecklist,
  canStaffAccessMission,
  computeAttendanceSummary,
  isMissionOverdue,
  snapProgressStep,
  validateMissionTransition,
} from '../src/domain/missionRules';
import type {
  AttendanceStatus,
  GuestRequestType,
  MissionPriority,
  MissionProgress,
  UserRole,
} from '../src/domain/types';
import {
  createAuthMiddleware,
  hashPassword,
  hashSecretCode,
  requireOwner,
  signSessionToken,
  validateSafePhotoUrl,
  verifyPassword,
  verifySecretCode,
  type AuthenticatedRequest,
} from './auth';
import {
  GOOGLE_SHEETS_SCHEMA,
  generateGoogleAppsScriptCode,
} from './appsScriptTemplate';
import {
  createNotification,
  db,
  getSettingsObject,
  getTodayDateStr,
  hydrateMission,
  makeId,
  mapAttendanceRow,
  mapGuestRequestRow,
  mapRoomRow,
  mapUnitRow,
  mapUserRow,
} from './db';

function getUserAuthRecord(userId: string): { role: UserRole; status: string } | null {
  const row = db
    .prepare('SELECT role, status FROM users WHERE id = ?')
    .get(userId) as { role: UserRole; status: string } | undefined;
  return row || null;
}

const requireAuth = createAuthMiddleware(getUserAuthRecord);

function getFullUserProfile(userId: string) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return row ? mapUserRow(row) : null;
}

function getAllOwnerIds(): string[] {
  const rows = db
    .prepare("SELECT id FROM users WHERE role = 'OWNER' AND status = 'Approved'")
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

function getApprovedStaffForUnit(unitId: string): string[] {
  const rows = db
    .prepare("SELECT id, assigned_unit_ids FROM users WHERE role = 'STAFF' AND status = 'Approved'")
    .all() as { id: string; assigned_unit_ids: string }[];
  return rows
    .filter((r) => {
      try {
        const units = JSON.parse(r.assigned_unit_ids || '[]') as string[];
        return units.length === 0 || units.includes(unitId);
      } catch {
        return true;
      }
    })
    .map((r) => r.id);
}

function isOwnerCodeValid(code: string): boolean {
  const envCode = process.env.OWNER_CONFIRMATION_CODE?.trim();
  if (envCode && code.trim() === envCode) {
    return true;
  }
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'owner_code_hash'")
    .get() as { value: string } | undefined;
  if (!row?.value) return false;
  return verifySecretCode(code, row.value);
}

function escapeCsvCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function createApiRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // ==========================================
  // PUBLIC QR & GUEST REQUEST ROUTES (NO AUTH)
  // ==========================================
  router.get('/public/qr-list', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT r.qr_code_id, r.name as room_name, r.type, u.id as unit_id, u.name as unit_name
         FROM rooms r JOIN units u ON r.unit_id = u.id
         ORDER BY u.id ASC, r.type DESC, r.id ASC`
      )
      .all() as any[];
    res.json({
      locations: rows.map((r) => ({
        qrCodeId: r.qr_code_id,
        unitId: r.unit_id,
        unitName: r.unit_name,
        roomName: r.room_name,
        type: r.type,
      })),
    });
  });

  router.get('/public/qr/:qrId', (req, res) => {
    const qrId = String(req.params.qrId || '').trim();
    const row = db
      .prepare(
        `SELECT r.id as room_id, r.name as room_name, r.type, r.qr_code_id,
                u.id as unit_id, u.name as unit_name
         FROM rooms r JOIN units u ON r.unit_id = u.id
         WHERE r.qr_code_id = ?`
      )
      .get(qrId) as any;

    if (!row) {
      res.status(404).json({ error: 'Lokasi QR Code tidak ditemukan.' });
      return;
    }

    res.json({
      qrCodeId: row.qr_code_id,
      unitId: row.unit_id,
      unitName: row.unit_name,
      roomId: row.room_id,
      roomName: row.room_name,
      type: row.type,
    });
  });

  router.post('/public/guest-requests', (req, res) => {
    const { qrCodeId, requestType, description, photo } = req.body || {};
    const room = db
      .prepare(
        `SELECT r.id as room_id, r.name as room_name, r.type, r.qr_code_id,
                u.id as unit_id, u.name as unit_name
         FROM rooms r JOIN units u ON r.unit_id = u.id
         WHERE r.qr_code_id = ?`
      )
      .get(String(qrCodeId || '').trim()) as any;

    if (!room) {
      res.status(404).json({ error: 'QR Code lokasi tidak valid.' });
      return;
    }

    const allowedTypes: GuestRequestType[] = [
      'Room Cleaning',
      'Request Clean Towels',
      'Request New Bed Sheets',
      'Request Drinking Water',
      'Request Amenities',
      'Request Room Service Assistance',
      'Report Maintenance',
      'Report Problem',
      'Other Request',
    ];
    if (!allowedTypes.includes(requestType)) {
      res.status(400).json({ error: 'Jenis permintaan tamu tidak valid.' });
      return;
    }

    const safeDesc = String(description || '').trim().slice(0, 1000);
    const safePhoto = validateSafePhotoUrl(photo);
    const nowIso = new Date().toISOString();
    const settings = getSettingsObject();
    const priority: MissionPriority =
      requestType === 'Report Maintenance' || requestType === 'Report Problem'
        ? 'Urgent'
        : settings.autoAssignGuestPriority || 'High';

    const missionId = makeId('MSN');
    const requestId = makeId('REQ');
    const deadlineIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const missionTitle = `Guest Request: ${requestType} (${room.room_name})`;

    const area =
      requestType === 'Report Maintenance'
        ? 'Maintenance'
        : room.type === 'common'
          ? 'Common Area'
          : 'Guest Room';

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO missions (id, title, unit_id, unit_name, area, room_id, room_name, mission_type, description, priority, distribution_type, is_team_mission, created_at, deadline, progress, status, recurrence, before_photo, guest_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Guest Request', ?, ?, 'Open Mission', 0, ?, ?, 0, 'Available', 'none', ?, ?)`
      ).run(
        missionId,
        missionTitle,
        room.unit_id,
        room.unit_name,
        area,
        room.room_id,
        room.room_name,
        safeDesc || `Permintaan tamu dari ${room.room_name}: ${requestType}`,
        priority,
        nowIso,
        deadlineIso,
        safePhoto,
        requestId
      );

      db.prepare(
        `INSERT INTO mission_checklists (id, mission_id, title, is_completed, sort_order)
         VALUES (?, ?, ?, 0, 1), (?, ?, ?, 0, 2), (?, ?, ?, 0, 3)`
      ).run(
        makeId('CHK'),
        missionId,
        `Konfirmasi & tanggapi permintaan: ${requestType}`,
        makeId('CHK'),
        missionId,
        `Selesaikan layanan di ${room.room_name}`,
        makeId('CHK'),
        missionId,
        'Pastikan tamu puas / foto hasil jika perlu'
      );

      db.prepare(
        `INSERT INTO guest_requests (id, mission_id, unit_id, unit_name, room_id, room_name, qr_code_id, request_type, description, photo_url, requested_at, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`
      ).run(
        requestId,
        missionId,
        room.unit_id,
        room.unit_name,
        room.room_id,
        room.room_name,
        room.qr_code_id,
        requestType,
        safeDesc,
        safePhoto,
        nowIso,
        priority
      );

      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note, photo_url)
         VALUES (?, ?, 'GUEST', ?, 'Misi dibuat', '', 'Available', 0, 0, ?, ?, ?)`
      ).run(
        makeId('HIS'),
        missionId,
        `Tamu (${room.room_name})`,
        nowIso,
        safeDesc || requestType,
        safePhoto
      );

      for (const ownerId of getAllOwnerIds()) {
        createNotification({
          recipientId: ownerId,
          recipientRole: 'OWNER',
          title: 'Permintaan Tamu Baru',
          message: `${room.unit_name} · ${room.room_name}: ${requestType}`,
          category: 'guest_request',
          relatedMissionId: missionId,
        });
      }

      for (const staffId of getApprovedStaffForUnit(room.unit_id)) {
        createNotification({
          recipientId: staffId,
          recipientRole: 'STAFF',
          title: 'Guest Request Baru',
          message: `${room.unit_name} · ${room.room_name} meminta ${requestType}. Dapat langsung diambil.`,
          category: 'guest_request',
          relatedMissionId: missionId,
        });
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.status(201).json({
      requestId,
      missionId,
      unitName: room.unit_name,
      roomName: room.room_name,
      requestType,
      requestedAt: nowIso,
    });
  });

  // Public QR SVG generator for printing & previews
  router.get('/qr-svg/:qrId', async (req, res) => {
    const qrId = String(req.params.qrId || '').trim();
    const exists = db
      .prepare('SELECT qr_code_id FROM rooms WHERE qr_code_id = ?')
      .get(qrId);
    if (!exists) {
      res.status(404).send('Not found');
      return;
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const targetUrl = `${proto}://${host}/?qr=${encodeURIComponent(qrId)}`;
    const svg = await QRCode.toString(targetUrl, {
      type: 'svg',
      margin: 1,
      width: 240,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  });

  // ==========================================
  // AUTHENTICATION & REGISTRATION
  // ==========================================
  router.get('/auth/setup-status', (_req, res) => {
    const owner = db
      .prepare("SELECT id, username, password_hash FROM users WHERE role = 'OWNER' LIMIT 1")
      .get() as { id: string; username: string; password_hash: string } | undefined;
    res.json({
      ownerConfigured: Boolean(owner && owner.password_hash && owner.password_hash.length > 0),
      suggestedOwnerUsername: owner?.username || 'owner',
    });
  });

  router.post('/auth/setup-owner', (req, res) => {
    const { fullName, username, password, ownerConfirmationCode } = req.body || {};
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');
    const cleanName = String(fullName || 'Owner The Wina').trim();

    if (!cleanUser || cleanUser.length < 3) {
      res.status(400).json({ error: 'Username minimal 3 karakter.' });
      return;
    }
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db
        .prepare("SELECT id, password_hash FROM users WHERE role = 'OWNER' LIMIT 1")
        .get() as { id: string; password_hash: string } | undefined;

      if (existing && existing.password_hash && existing.password_hash.length > 0) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Akun Owner sudah dikonfigurasi. Silakan login.' });
        return;
      }

      const conflict = db
        .prepare('SELECT id FROM users WHERE username = ? AND role != ?')
        .get(cleanUser, 'OWNER');
      if (conflict) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Username sudah dipakai oleh akun lain.' });
        return;
      }

      const ownerId = existing?.id || 'USR-OWNER-01';
      const passHash = hashPassword(cleanPass);
      const nowIso = new Date().toISOString();

      if (existing) {
        db.prepare(
          'UPDATE users SET full_name = ?, username = ?, password_hash = ? WHERE id = ?'
        ).run(cleanName, cleanUser, passHash, ownerId);
      } else {
        db.prepare(
          `INSERT INTO users (id, full_name, username, password_hash, role, status, whatsapp, profile_photo, start_date, assigned_unit_ids, created_at)
           VALUES (?, ?, ?, ?, 'OWNER', 'Approved', '', '/src/assets/images/avatar_owner_wina_1795663025062.jpg', ?, '[]', ?)`
        ).run(ownerId, cleanName, cleanUser, passHash, getTodayDateStr(), nowIso);
      }

      if (typeof ownerConfirmationCode === 'string' && ownerConfirmationCode.trim().length >= 4) {
        db.prepare(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
        ).run('owner_code_hash', hashSecretCode(ownerConfirmationCode.trim()), nowIso);
      }

      db.exec('COMMIT');

      const user = getFullUserProfile(ownerId)!;
      const token = signSessionToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });
      res.status(201).json({ token, user });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  router.post('/auth/register', (req, res) => {
    const {
      fullName,
      username,
      password,
      confirmPassword,
      whatsapp,
      profilePhoto,
      startDate,
      ownerConfirmationCode,
    } = req.body || {};

    const cleanName = String(fullName || '').trim();
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');
    const cleanConfirm = String(confirmPassword || '');
    const cleanWa = String(whatsapp || '').trim();
    const cleanStart = String(startDate || getTodayDateStr()).trim();
    const safePhoto = validateSafePhotoUrl(profilePhoto);

    if (!cleanName || cleanName.length < 2) {
      res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
      return;
    }
    if (!cleanUser || !/^[a-z0-9_.-]{3,30}$/.test(cleanUser)) {
      res.status(400).json({
        error: 'Username harus 3-30 karakter (huruf kecil, angka, titik, atau underscore).',
      });
      return;
    }
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (cleanPass !== cleanConfirm) {
      res.status(400).json({ error: 'Konfirmasi kata sandi tidak cocok.' });
      return;
    }
    if (!cleanWa || cleanWa.length < 8) {
      res.status(400).json({ error: 'Nomor WhatsApp wajib diisi dengan benar.' });
      return;
    }

    const exists = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(cleanUser);
    if (exists) {
      res.status(409).json({ error: 'Username sudah terdaftar. Gunakan username lain.' });
      return;
    }

    const codeProvided =
      typeof ownerConfirmationCode === 'string' && ownerConfirmationCode.trim().length > 0;
    const autoApproved = codeProvided && isOwnerCodeValid(ownerConfirmationCode);
    if (codeProvided && !autoApproved) {
      res.status(400).json({
        error: 'Kode konfirmasi Owner tidak valid. Kosongkan jika menunggu persetujuan dashboard Owner.',
      });
      return;
    }

    const status = autoApproved ? 'Approved' : 'Pending Approval';
    const userId = makeId('USR');
    const nowIso = new Date().toISOString();
    const allUnits = ['UNIT-01', 'UNIT-02', 'UNIT-03', 'UNIT-04'];

    db.prepare(
      `INSERT INTO users (id, full_name, username, password_hash, role, status, whatsapp, profile_photo, start_date, assigned_unit_ids, created_at)
       VALUES (?, ?, ?, ?, 'STAFF', ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      cleanName,
      cleanUser,
      hashPassword(cleanPass),
      status,
      cleanWa,
      safePhoto,
      cleanStart,
      JSON.stringify(allUnits),
      nowIso
    );

    for (const ownerId of getAllOwnerIds()) {
      createNotification({
        recipientId: ownerId,
        recipientRole: 'OWNER',
        title: autoApproved ? 'Staf Baru Terverifikasi' : 'Pendaftaran Staf Baru',
        message: autoApproved
          ? `${cleanName} (@${cleanUser}) mendaftar menggunakan kode konfirmasi Owner.`
          : `${cleanName} (@${cleanUser}) mendaftar dan menunggu persetujuan Owner.`,
        category: 'staff_registration',
      });
    }

    res.status(201).json({
      status,
      message: autoApproved
        ? 'Pendaftaran berhasil disetujui. Silakan login.'
        : 'Pendaftaran berhasil dikirim. Akun Anda menunggu persetujuan Owner sebelum dapat login.',
    });
  });

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(cleanUser) as any;

    if (!row || !row.password_hash || !verifyPassword(cleanPass, row.password_hash)) {
      res.status(401).json({ error: 'Username atau kata sandi salah.' });
      return;
    }

    if (row.status === 'Pending Approval') {
      res.status(403).json({
        error: 'Akun Anda masih berstatus Pending Approval. Menunggu persetujuan Owner.',
      });
      return;
    }
    if (row.status === 'Rejected') {
      res.status(403).json({ error: 'Pendaftaran akun Anda ditolak oleh Owner.' });
      return;
    }
    if (row.status === 'Suspended') {
      res.status(403).json({ error: 'Akun Anda sedang ditangguhkan (Suspended).' });
      return;
    }

    const user = mapUserRow(row);
    const token = signSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    res.json({ token, user });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    res.json({ user });
  });

  router.post('/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  // ==========================================
  // UNITS & ROOMS
  // ==========================================
  router.get('/units', requireAuth, (_req, res) => {
    const units = (db.prepare('SELECT * FROM units ORDER BY id ASC').all() as any[]).map(
      mapUnitRow
    );
    const rooms = (
      db
        .prepare(
          `SELECT r.*, u.name as unit_name FROM rooms r
           JOIN units u ON r.unit_id = u.id
           ORDER BY r.unit_id ASC, r.type DESC, r.id ASC`
        )
        .all() as any[]
    ).map(mapRoomRow);
    res.json({ units, rooms });
  });

  router.patch('/rooms/:id', requireAuth, requireOwner, (req, res) => {
    const { name } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Nama kamar tidak boleh kosong.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Kamar tidak ditemukan.' });
      return;
    }
    db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(cleanName, req.params.id);
    const updated = db
      .prepare(
        `SELECT r.*, u.name as unit_name FROM rooms r
         JOIN units u ON r.unit_id = u.id WHERE r.id = ?`
      )
      .get(req.params.id);
    res.json({ room: mapRoomRow(updated) });
  });

  router.post('/units/:unitId/rooms', requireAuth, requireOwner, (req, res) => {
    const unit = db
      .prepare('SELECT * FROM units WHERE id = ?')
      .get(req.params.unitId) as any;
    if (!unit) {
      res.status(404).json({ error: 'Unit usaha tidak ditemukan.' });
      return;
    }
    const cleanName = String(req.body?.name || '').trim();
    const roomType = req.body?.type === 'common' ? 'common' : 'room';
    if (!cleanName) {
      res.status(400).json({ error: 'Nama kamar/lokasi wajib diisi.' });
      return;
    }
    const roomId = makeId('ROOM');
    const qrCodeId = `QR-${unit.id}-${roomId.slice(-4)}`;
    db.prepare(
      'INSERT INTO rooms (id, unit_id, name, type, qr_code_id) VALUES (?, ?, ?, ?, ?)'
    ).run(roomId, unit.id, cleanName, roomType, qrCodeId);

    if (roomType === 'room') {
      const cnt = (
        db
          .prepare("SELECT COUNT(*) as c FROM rooms WHERE unit_id = ? AND type = 'room'")
          .get(unit.id) as { c: number }
      ).c;
      db.prepare('UPDATE units SET room_count = ? WHERE id = ?').run(cnt, unit.id);
    }

    const updated = db
      .prepare(
        `SELECT r.*, u.name as unit_name FROM rooms r
         JOIN units u ON r.unit_id = u.id WHERE r.id = ?`
      )
      .get(roomId);
    res.status(201).json({ room: mapRoomRow(updated) });
  });

  // ==========================================
  // STAFF MANAGEMENT (OWNER ONLY)
  // ==========================================
  router.get('/staff', requireAuth, requireOwner, (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM users WHERE role = 'STAFF' ORDER BY created_at DESC")
      .all() as any[];
    res.json({ staff: rows.map(mapUserRow) });
  });

  router.post('/staff', requireAuth, requireOwner, (req, res) => {
    const { fullName, username, password, whatsapp, startDate, assignedUnitIds } =
      req.body || {};
    const cleanName = String(fullName || '').trim();
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanName || !cleanUser || cleanPass.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, username, dan kata sandi (min 6 karakter) wajib diisi.',
      });
      return;
    }
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
    if (exists) {
      res.status(409).json({ error: 'Username sudah terdaftar.' });
      return;
    }
    const userId = makeId('USR');
    const units = Array.isArray(assignedUnitIds)
      ? assignedUnitIds
      : ['UNIT-01', 'UNIT-02', 'UNIT-03', 'UNIT-04'];
    db.prepare(
      `INSERT INTO users (id, full_name, username, password_hash, role, status, whatsapp, profile_photo, start_date, assigned_unit_ids, created_at)
       VALUES (?, ?, ?, ?, 'STAFF', 'Approved', ?, '', ?, ?, ?)`
    ).run(
      userId,
      cleanName,
      cleanUser,
      hashPassword(cleanPass),
      String(whatsapp || ''),
      String(startDate || getTodayDateStr()),
      JSON.stringify(units),
      new Date().toISOString()
    );
    res.status(201).json({ staff: getFullUserProfile(userId) });
  });

  router.patch('/staff/:id', requireAuth, requireOwner, (req, res) => {
    const existing = db
      .prepare("SELECT * FROM users WHERE id = ? AND role = 'STAFF'")
      .get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Akun staf tidak ditemukan.' });
      return;
    }
    const { status, assignedUnitIds, newPassword, fullName, whatsapp } = req.body || {};
    const allowedStatuses = ['Pending Approval', 'Approved', 'Rejected', 'Suspended'];
    const nextStatus = allowedStatuses.includes(status) ? status : existing.status;
    const nextUnits = Array.isArray(assignedUnitIds)
      ? JSON.stringify(assignedUnitIds)
      : existing.assigned_unit_ids;
    const nextName = fullName ? String(fullName).trim() : existing.full_name;
    const nextWa = whatsapp !== undefined ? String(whatsapp).trim() : existing.whatsapp;
    const nextHash =
      typeof newPassword === 'string' && newPassword.trim().length >= 6
        ? hashPassword(newPassword.trim())
        : existing.password_hash;

    db.prepare(
      `UPDATE users SET status = ?, assigned_unit_ids = ?, full_name = ?, whatsapp = ?, password_hash = ? WHERE id = ?`
    ).run(nextStatus, nextUnits, nextName, nextWa, nextHash, req.params.id);

    if (nextStatus !== existing.status) {
      createNotification({
        recipientId: req.params.id,
        recipientRole: 'STAFF',
        title: `Status Akun: ${nextStatus}`,
        message: `Owner memperbarui status akun Anda menjadi ${nextStatus}.`,
        category: 'account',
      });
    }

    res.json({ staff: getFullUserProfile(req.params.id) });
  });

  router.get('/owner/confirmation-code-status', requireAuth, requireOwner, (_req, res) => {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'owner_code_hash'")
      .get() as { value: string } | undefined;
    const hasEnv = Boolean(process.env.OWNER_CONFIRMATION_CODE?.trim());
    res.json({ configured: Boolean(row?.value || hasEnv) });
  });

  router.post('/owner/confirmation-code', requireAuth, requireOwner, (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (code.length < 4) {
      res.status(400).json({ error: 'Kode konfirmasi Owner minimal 4 karakter.' });
      return;
    }
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run('owner_code_hash', hashSecretCode(code), new Date().toISOString());
    res.json({ ok: true, configured: true });
  });

  // ==========================================
  // ATTENDANCE SYSTEM
  // ==========================================
  router.get('/attendance/today', requireAuth, (req: AuthenticatedRequest, res) => {
    const todayStr = getTodayDateStr();
    const row = db
      .prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ? LIMIT 1')
      .get(req.auth!.userId, todayStr);
    res.json({ record: row ? mapAttendanceRow(row) : null });
  });

  // Coworkers today — STRICTLY hides sensitive info (only name, photo, status, unit, active mission)
  router.get('/attendance/coworkers', requireAuth, (_req, res) => {
    const todayStr = getTodayDateStr();
    const staffRows = db
      .prepare("SELECT id, full_name, profile_photo FROM users WHERE role = 'STAFF' AND status = 'Approved'")
      .all() as { id: string; full_name: string; profile_photo: string }[];

    const attRows = db
      .prepare('SELECT staff_id, status, unit_name FROM attendance WHERE date = ?')
      .all(todayStr) as { staff_id: string; status: AttendanceStatus; unit_name: string }[];
    const attMap = new Map(attRows.map((a) => [a.staff_id, a]));

    const activeMissions = db
      .prepare(
        `SELECT m.title, m.unit_name, m.lead_staff_id, ma.staff_id as member_id
         FROM missions m
         LEFT JOIN mission_assignments ma ON m.id = ma.mission_id
         WHERE m.status IN ('Accepted', 'In Progress', 'Paused')`
      )
      .all() as {
      title: string;
      unit_name: string;
      lead_staff_id: string | null;
      member_id: string | null;
    }[];

    const missionByStaff = new Map<string, { title: string; unitName: string }>();
    for (const m of activeMissions) {
      if (m.lead_staff_id && !missionByStaff.has(m.lead_staff_id)) {
        missionByStaff.set(m.lead_staff_id, { title: m.title, unitName: m.unit_name });
      }
      if (m.member_id && !missionByStaff.has(m.member_id)) {
        missionByStaff.set(m.member_id, { title: m.title, unitName: m.unit_name });
      }
    }

    const coworkers = staffRows.map((s) => {
      const att = attMap.get(s.id);
      const active = missionByStaff.get(s.id);
      return {
        staffId: s.id,
        fullName: s.full_name,
        profilePhoto: s.profile_photo || '',
        status: att?.status || 'Belum Absen',
        unitName: att?.unit_name || active?.unitName || '-',
        currentMissionTitle: active?.title || null,
      };
    });

    res.json({ coworkers });
  });

  router.get('/attendance', requireAuth, (req: AuthenticatedRequest, res) => {
    const { date, from, to, staffId, unitId } = req.query;
    const clauses: string[] = [];
    const params: any[] = [];

    if (req.auth!.role === 'STAFF') {
      clauses.push('staff_id = ?');
      params.push(req.auth!.userId);
    } else if (staffId) {
      clauses.push('staff_id = ?');
      params.push(String(staffId));
    }

    if (date) {
      clauses.push('date = ?');
      params.push(String(date));
    }
    if (from) {
      clauses.push('date >= ?');
      params.push(String(from));
    }
    if (to) {
      clauses.push('date <= ?');
      params.push(String(to));
    }
    if (unitId) {
      clauses.push('unit_id = ?');
      params.push(String(unitId));
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM attendance ${whereSql} ORDER BY date DESC, check_in_time DESC`)
      .all(...params) as any[];
    const records = rows.map(mapAttendanceRow);
    const summary = computeAttendanceSummary(records);
    res.json({ records, summary });
  });

  router.post('/attendance/check-in', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    const todayStr = getTodayDateStr();
    const existing = db
      .prepare('SELECT id FROM attendance WHERE staff_id = ? AND date = ?')
      .get(user.id, todayStr);
    if (existing) {
      res.status(409).json({ error: 'Anda sudah melakukan absensi hari ini.' });
      return;
    }

    const { status, unitId, notes, photo } = req.body || {};
    const allowed: AttendanceStatus[] = [
      'Working',
      'Off',
      'Izin',
      'Sick',
      'Emergency Leave',
    ];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Status absensi tidak valid.' });
      return;
    }

    const settings = getSettingsObject();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (status === 'Working' && !settings.allowEarlyCheckIn && hhmm < settings.checkInStartHour) {
      res.status(400).json({
        error: `Check-in baru dibuka pukul ${settings.checkInStartHour} sesuai aturan Owner.`,
      });
      return;
    }

    const unitRow = unitId
      ? (db.prepare('SELECT id, name FROM units WHERE id = ?').get(String(unitId)) as
          | { id: string; name: string }
          | undefined)
      : undefined;

    if (status === 'Working' && !unitRow) {
      res.status(400).json({ error: 'Pilih unit kerja terlebih dahulu.' });
      return;
    }

    const isLate = status === 'Working' && hhmm > settings.lateCutoffTime ? 1 : 0;
    const nowIso = now.toISOString();
    const attId = makeId('ATT');
    const safePhoto = validateSafePhotoUrl(photo);

    db.prepare(
      `INSERT INTO attendance (id, staff_id, staff_name, date, check_in_time, status, is_late, notes, unit_id, unit_name, check_in_photo, work_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      attId,
      user.id,
      user.fullName,
      todayStr,
      status === 'Working' ? nowIso : null,
      status,
      isLate,
      String(notes || '').trim().slice(0, 500),
      unitRow?.id || '',
      unitRow?.name || '-',
      safePhoto
    );

    for (const ownerId of getAllOwnerIds()) {
      createNotification({
        recipientId: ownerId,
        recipientRole: 'OWNER',
        title: `Absensi: ${user.fullName}`,
        message: `${user.fullName} mencatat status ${status}${unitRow ? ` di ${unitRow.name}` : ''}${isLate ? ' (Terlambat)' : ''}.`,
        category: 'attendance',
      });
    }

    const saved = db.prepare('SELECT * FROM attendance WHERE id = ?').get(attId);
    res.status(201).json({ record: mapAttendanceRow(saved) });
  });

  router.post('/attendance/check-out', requireAuth, (req: AuthenticatedRequest, res) => {
    const todayStr = getTodayDateStr();
    const existing = db
      .prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ?')
      .get(req.auth!.userId, todayStr) as any;

    if (!existing) {
      res.status(400).json({ error: 'Anda belum melakukan check-in hari ini.' });
      return;
    }
    if (existing.status !== 'Working') {
      res.status(400).json({ error: 'Check-out hanya berlaku untuk status Working.' });
      return;
    }
    if (existing.check_out_time) {
      res.status(409).json({ error: 'Anda sudah melakukan check-out hari ini.' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const checkInMs = existing.check_in_time ? Date.parse(existing.check_in_time) : now.getTime();
    const workMinutes = Math.max(1, Math.round((now.getTime() - checkInMs) / 60000));
    const safePhoto = validateSafePhotoUrl(req.body?.photo);
    const noteAppend = String(req.body?.notes || '').trim();
    const mergedNotes = noteAppend
      ? [existing.notes, noteAppend].filter(Boolean).join(' | ').slice(0, 500)
      : existing.notes;

    db.prepare(
      `UPDATE attendance SET check_out_time = ?, check_out_photo = ?, work_minutes = ?, notes = ? WHERE id = ?`
    ).run(nowIso, safePhoto, workMinutes, mergedNotes, existing.id);

    const updated = db.prepare('SELECT * FROM attendance WHERE id = ?').get(existing.id);
    res.json({ record: mapAttendanceRow(updated) });
  });

  // ==========================================
  // MISSIONS, CHECKLISTS, TEAM, HISTORY
  // ==========================================
  router.get('/missions', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const rows = db
      .prepare('SELECT * FROM missions ORDER BY created_at DESC')
      .all() as any[];

    let missions = rows.map((r) => hydrateMission(r, false));

    if (user.role === 'STAFF') {
      missions = missions.filter((m) => canStaffAccessMission(user, m));
    }

    const { unitId, status, missionType, staffId, search } = req.query;
    if (unitId) missions = missions.filter((m) => m.unitId === String(unitId));
    if (status) missions = missions.filter((m) => m.status === String(status));
    if (missionType) missions = missions.filter((m) => m.missionType === String(missionType));
    if (staffId) {
      const sid = String(staffId);
      missions = missions.filter(
        (m) =>
          m.leadStaffId === sid || m.additionalStaff.some((a) => a.staffId === sid)
      );
    }
    if (search) {
      const q = String(search).toLowerCase();
      missions = missions.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.roomName.toLowerCase().includes(q) ||
          m.unitName.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }

    res.json({ missions });
  });

  router.get('/missions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, true);
    const user = getFullUserProfile(req.auth!.userId)!;
    if (user.role === 'STAFF' && !canStaffAccessMission(user, mission)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke misi ini.' });
      return;
    }
    res.json({ mission });
  });

  router.post('/missions', requireAuth, requireOwner, (req: AuthenticatedRequest, res) => {
    const owner = getFullUserProfile(req.auth!.userId)!;
    const {
      title,
      unitId,
      area,
      roomId,
      missionType,
      description,
      priority,
      distributionType,
      isTeamMission,
      leadStaffId,
      deadline,
      recurrence,
      ownerNotes,
      checklistItems,
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      res.status(400).json({ error: 'Nama misi wajib diisi.' });
      return;
    }
    const unit = db
      .prepare('SELECT id, name FROM units WHERE id = ?')
      .get(String(unitId || '')) as { id: string; name: string } | undefined;
    if (!unit) {
      res.status(400).json({ error: 'Unit usaha tidak valid.' });
      return;
    }
    const room = roomId
      ? (db.prepare('SELECT id, name FROM rooms WHERE id = ?').get(String(roomId)) as
          | { id: string; name: string }
          | undefined)
      : undefined;

    const dist =
      distributionType === 'Assigned Mission' ? 'Assigned Mission' : 'Open Mission';

    let assignee: { id: string; full_name: string } | undefined;
    if (dist === 'Assigned Mission') {
      if (!leadStaffId) {
        res.status(400).json({ error: 'Pilih staf untuk Assigned Mission.' });
        return;
      }
      assignee = db
        .prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'STAFF' AND status = 'Approved'")
        .get(String(leadStaffId)) as { id: string; full_name: string } | undefined;
      if (!assignee) {
        res.status(400).json({ error: 'Staf yang ditugaskan tidak ditemukan atau belum disetujui.' });
        return;
      }
    }

    const missionId = makeId('MSN');
    const nowIso = new Date().toISOString();
    const deadlineIso = deadline
      ? new Date(String(deadline)).toISOString()
      : new Date(Date.now() + 4 * 3600 * 1000).toISOString();

    const items: { title: string; assignedToId?: string | null; assignedToName?: string | null }[] =
      Array.isArray(checklistItems)
        ? checklistItems
            .map((item: any) =>
              typeof item === 'string'
                ? { title: item.trim() }
                : {
                    title: String(item?.title || '').trim(),
                    assignedToId: item?.assignedToId || null,
                    assignedToName: item?.assignedToName || null,
                  }
            )
            .filter((i) => i.title.length > 0)
        : [];

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO missions (id, title, unit_id, unit_name, area, room_id, room_name, mission_type, description, priority, distribution_type, is_team_mission, lead_staff_id, lead_staff_name, created_at, deadline, progress, status, recurrence, owner_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Available', ?, ?)`
      ).run(
        missionId,
        cleanTitle,
        unit.id,
        unit.name,
        String(area || 'Guest Room'),
        room?.id || null,
        room?.name || 'Umum',
        String(missionType || 'Room Cleaning'),
        String(description || '').trim(),
        String(priority || 'Normal'),
        dist,
        isTeamMission ? 1 : 0,
        assignee?.id || null,
        assignee?.full_name || null,
        nowIso,
        deadlineIso,
        String(recurrence || 'none'),
        String(ownerNotes || '').trim()
      );

      if (assignee) {
        // Assigned Mission can be accepted/started immediately by the assigned staff (status stays Accepted or Available to start)
        db.prepare("UPDATE missions SET status = 'Accepted', claimed_at = ? WHERE id = ?").run(
          nowIso,
          missionId
        );
        db.prepare(
          `INSERT INTO mission_assignments (id, mission_id, staff_id, staff_name, role, joined_at)
           VALUES (?, ?, ?, ?, 'lead', ?)`
        ).run(makeId('ASN'), missionId, assignee.id, assignee.full_name, nowIso);
      }

      const insertChk = db.prepare(
        `INSERT INTO mission_checklists (id, mission_id, title, is_completed, assigned_to_id, assigned_to_name, sort_order)
         VALUES (?, ?, ?, 0, ?, ?, ?)`
      );
      items.forEach((item, idx) => {
        insertChk.run(
          makeId('CHK'),
          missionId,
          item.title,
          item.assignedToId || null,
          item.assignedToName || null,
          idx + 1
        );
      });

      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
         VALUES (?, ?, ?, ?, 'Misi dibuat', '', ?, 0, 0, ?, ?)`
      ).run(
        makeId('HIS'),
        missionId,
        owner.id,
        owner.fullName,
        assignee ? 'Accepted' : 'Available',
        nowIso,
        assignee ? `Ditugaskan ke ${assignee.full_name}` : 'Open Mission dibuat Owner'
      );

      if (assignee) {
        createNotification({
          recipientId: assignee.id,
          recipientRole: 'STAFF',
          title: 'Assigned Mission Baru',
          message: `Anda ditugaskan untuk "${cleanTitle}" (${unit.name}).`,
          category: 'assigned_mission',
          relatedMissionId: missionId,
        });
      } else {
        for (const staffId of getApprovedStaffForUnit(unit.id)) {
          createNotification({
            recipientId: staffId,
            recipientRole: 'STAFF',
            title: 'Misi Baru Tersedia',
            message: `${cleanTitle} di ${unit.name} siap diambil.`,
            category: 'new_mission',
            relatedMissionId: missionId,
          });
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const created = db.prepare('SELECT * FROM missions WHERE id = ?').get(missionId);
    res.status(201).json({ mission: hydrateMission(created, true) });
  });

  // Atomic Claim Open Mission (no owner approval required; prevents double-claim race!)
  router.post('/missions/:id/claim', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db
        .prepare('SELECT * FROM missions WHERE id = ?')
        .get(req.params.id) as any;
      if (!row) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Misi tidak ditemukan.' });
        return;
      }

      const mission = hydrateMission(row, false);
      const transition = validateMissionTransition(mission, 'claim', user);
      if (!transition.allowed) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: transition.reason });
        return;
      }

      const updateRes = db
        .prepare(
          `UPDATE missions SET status = 'Accepted', lead_staff_id = ?, lead_staff_name = ?, claimed_at = ?
           WHERE id = ? AND status = 'Available' AND lead_staff_id IS NULL`
        )
        .run(user.id, user.fullName, nowIso, mission.id);

      if (updateRes.changes === 0) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Misi baru saja diambil staf lain.' });
        return;
      }

      db.prepare(
        `INSERT OR IGNORE INTO mission_assignments (id, mission_id, staff_id, staff_name, role, joined_at)
         VALUES (?, ?, ?, ?, 'lead', ?)`
      ).run(makeId('ASN'), mission.id, user.id, user.fullName, nowIso);

      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
         VALUES (?, ?, ?, ?, 'Misi diambil', ?, 'Accepted', ?, ?, ?, ?)`
      ).run(
        makeId('HIS'),
        mission.id,
        user.id,
        user.fullName,
        mission.status,
        mission.progress,
        mission.progress,
        nowIso,
        'Staf mengambil misi secara langsung.'
      );

      if (mission.guestRequestId) {
        db.prepare(
          "UPDATE guest_requests SET status = 'Accepted', assignee_name = ? WHERE id = ?"
        ).run(user.fullName, mission.guestRequestId);
      }

      for (const ownerId of getAllOwnerIds()) {
        createNotification({
          recipientId: ownerId,
          recipientRole: 'OWNER',
          title: 'Misi Diambil Staf',
          message: `${user.fullName} mengambil misi "${mission.title}".`,
          category: 'mission_claimed',
          relatedMissionId: mission.id,
        });
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Join Team Mission
  router.post('/missions/:id/join', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
      if (!row) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Misi tidak ditemukan.' });
        return;
      }
      const mission = hydrateMission(row, false);
      const transition = validateMissionTransition(mission, 'join', user);
      if (!transition.allowed) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: transition.reason });
        return;
      }

      db.prepare(
        `INSERT INTO mission_assignments (id, mission_id, staff_id, staff_name, role, joined_at)
         VALUES (?, ?, ?, ?, 'member', ?)`
      ).run(makeId('ASN'), mission.id, user.id, user.fullName, nowIso);

      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
         VALUES (?, ?, ?, ?, 'Staf bergabung', ?, ?, ?, ?, ?, ?)`
      ).run(
        makeId('HIS'),
        mission.id,
        user.id,
        user.fullName,
        mission.status,
        mission.status,
        mission.progress,
        mission.progress,
        nowIso,
        `${user.fullName} bergabung dalam Team Mission.`
      );

      if (mission.leadStaffId) {
        createNotification({
          recipientId: mission.leadStaffId,
          recipientRole: 'STAFF',
          title: 'Rekan Bergabung ke Misi',
          message: `${user.fullName} bergabung di misi "${mission.title}".`,
          category: 'team_join',
          relatedMissionId: mission.id,
        });
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Start Mission
  router.post('/missions/:id/start', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, false);
    const transition = validateMissionTransition(mission, 'start', user);
    if (!transition.allowed) {
      res.status(400).json({ error: transition.reason });
      return;
    }
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE missions SET status = 'In Progress', started_at = COALESCE(started_at, ?) WHERE id = ?`
    ).run(nowIso, mission.id);

    if (mission.guestRequestId) {
      db.prepare("UPDATE guest_requests SET status = 'In Progress' WHERE id = ?").run(
        mission.guestRequestId
      );
    }

    db.prepare(
      `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
       VALUES (?, ?, ?, ?, 'Misi dimulai', ?, 'In Progress', ?, ?, ?, ?)`
    ).run(
      makeId('HIS'),
      mission.id,
      user.id,
      user.fullName,
      mission.status,
      mission.progress,
      mission.progress,
      nowIso,
      'Pekerjaan dimulai.'
    );

    for (const ownerId of getAllOwnerIds()) {
      createNotification({
        recipientId: ownerId,
        recipientRole: 'OWNER',
        title: 'Misi Dimulai',
        message: `${user.fullName} mulai mengerjakan "${mission.title}".`,
        category: 'mission_started',
        relatedMissionId: mission.id,
      });
    }

    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Pause Mission
  router.post('/missions/:id/pause', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ error: 'Alasan jeda wajib diisi.' });
      return;
    }
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, false);
    const transition = validateMissionTransition(mission, 'pause', user);
    if (!transition.allowed) {
      res.status(400).json({ error: transition.reason });
      return;
    }
    const nowIso = new Date().toISOString();
    const mergedNotes = [mission.staffNotes, `[Dijeda] ${reason}`]
      .filter(Boolean)
      .join('\n');

    db.prepare("UPDATE missions SET status = 'Paused', staff_notes = ? WHERE id = ?").run(
      mergedNotes,
      mission.id
    );
    db.prepare(
      `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
       VALUES (?, ?, ?, ?, 'Misi dijeda', ?, 'Paused', ?, ?, ?, ?)`
    ).run(
      makeId('HIS'),
      mission.id,
      user.id,
      user.fullName,
      mission.status,
      mission.progress,
      mission.progress,
      nowIso,
      reason
    );

    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Resume Mission
  router.post('/missions/:id/resume', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, false);
    const transition = validateMissionTransition(mission, 'resume', user);
    if (!transition.allowed) {
      res.status(400).json({ error: transition.reason });
      return;
    }
    const nowIso = new Date().toISOString();
    db.prepare("UPDATE missions SET status = 'In Progress' WHERE id = ?").run(mission.id);
    db.prepare(
      `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
       VALUES (?, ?, ?, ?, 'Misi dilanjutkan', 'Paused', 'In Progress', ?, ?, ?, ?)`
    ).run(
      makeId('HIS'),
      mission.id,
      user.id,
      user.fullName,
      mission.progress,
      mission.progress,
      nowIso,
      'Pekerjaan dilanjutkan kembali.'
    );
    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Add checklist item
  router.post('/missions/:id/checklist', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Judul item checklist wajib diisi.' });
      return;
    }
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, false);
    if (user.role === 'STAFF' && !canStaffAccessMission(user, mission)) {
      res.status(403).json({ error: 'Akses ditolak.' });
      return;
    }
    const maxOrder = (
      db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM mission_checklists WHERE mission_id = ?')
        .get(mission.id) as { m: number }
    ).m;
    db.prepare(
      `INSERT INTO mission_checklists (id, mission_id, title, is_completed, assigned_to_id, assigned_to_name, sort_order)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    ).run(
      makeId('CHK'),
      mission.id,
      title,
      req.body?.assignedToId || null,
      req.body?.assignedToName || null,
      maxOrder + 1
    );
    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
    res.status(201).json({ mission: hydrateMission(updated, true) });
  });

  // Toggle Checklist Item -> Auto calculates progress -> Auto completes at 100%!
  router.patch(
    '/missions/:id/checklist/:itemId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = getFullUserProfile(req.auth!.userId)!;
      const nowIso = new Date().toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db
          .prepare('SELECT * FROM missions WHERE id = ?')
          .get(req.params.id) as any;
        if (!row) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: 'Misi tidak ditemukan.' });
          return;
        }
        const mission = hydrateMission(row, false);
        const isParticipant =
          user.role === 'OWNER' ||
          mission.leadStaffId === user.id ||
          mission.additionalStaff.some((a) => a.staffId === user.id);

        if (!isParticipant) {
          db.exec('ROLLBACK');
          res.status(403).json({
            error: 'Ambil atau bergabung dengan misi terlebih dahulu sebelum mengisi checklist.',
          });
          return;
        }
        if (mission.status === 'Cancelled') {
          db.exec('ROLLBACK');
          res.status(400).json({ error: 'Misi sudah dibatalkan.' });
          return;
        }

        const item = mission.checklist.find((c) => c.id === req.params.itemId);
        if (!item) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: 'Item checklist tidak ditemukan.' });
          return;
        }

        const nextDone =
          typeof req.body?.isCompleted === 'boolean'
            ? req.body.isCompleted
            : !item.isCompleted;

        db.prepare(
          `UPDATE mission_checklists
           SET is_completed = ?, completed_by_id = ?, completed_by_name = ?, completed_at = ?
           WHERE id = ? AND mission_id = ?`
        ).run(
          nextDone ? 1 : 0,
          nextDone ? user.id : null,
          nextDone ? user.fullName : null,
          nextDone ? nowIso : null,
          item.id,
          mission.id
        );

        const updatedChecklist = mission.checklist.map((c) =>
          c.id === item.id ? { ...c, isCompleted: nextDone } : c
        );
        const nextProgress = calculateProgressFromChecklist(
          updatedChecklist,
          mission.progress
        );

        let nextStatus = mission.status;
        let completedAt = mission.completedAt;
        let startedAt = mission.startedAt;

        if (nextProgress === 100) {
          nextStatus = 'Completed';
          completedAt = nowIso;
          startedAt = startedAt || nowIso;
        } else if (mission.status === 'Accepted' || mission.status === 'Revision Required') {
          nextStatus = 'In Progress';
          startedAt = startedAt || nowIso;
        } else if (mission.status === 'Completed' && nextProgress < 100) {
          nextStatus = 'In Progress';
          completedAt = null;
        }

        db.prepare(
          `UPDATE missions SET progress = ?, status = ?, started_at = ?, completed_at = ? WHERE id = ?`
        ).run(nextProgress, nextStatus, startedAt, completedAt, mission.id);

        if (mission.guestRequestId) {
          db.prepare('UPDATE guest_requests SET status = ? WHERE id = ?').run(
            nextStatus,
            mission.guestRequestId
          );
        }

        db.prepare(
          `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, checklist_changed, timestamp, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          makeId('HIS'),
          mission.id,
          user.id,
          user.fullName,
          nextStatus === 'Completed' ? 'Misi diselesaikan' : 'Checklist diperbarui',
          mission.status,
          nextStatus,
          mission.progress,
          nextProgress,
          `${item.title}: ${nextDone ? 'Selesai' : 'Batal'}`,
          nowIso,
          nextStatus === 'Completed' ? 'Seluruh checklist selesai (100%).' : ''
        );

        if (nextStatus === 'Completed' && mission.status !== 'Completed') {
          for (const ownerId of getAllOwnerIds()) {
            createNotification({
              recipientId: ownerId,
              recipientRole: 'OWNER',
              title: 'Misi Selesai (100%)',
              message: `${user.fullName} menyelesaikan "${mission.title}".`,
              category: 'mission_completed',
              relatedMissionId: mission.id,
            });
          }
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id);
      res.json({ mission: hydrateMission(updated, true) });
    }
  );

  // Manual Progress, Photos, Notes (auto completes at 100% without owner approval)
  router.patch('/missions/:id/progress', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = getFullUserProfile(req.auth!.userId)!;
    const nowIso = new Date().toISOString();
    const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Misi tidak ditemukan.' });
      return;
    }
    const mission = hydrateMission(row, false);
    const isParticipant =
      user.role === 'OWNER' ||
      mission.leadStaffId === user.id ||
      mission.additionalStaff.some((a) => a.staffId === user.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'Anda bukan penanggung jawab misi ini.' });
      return;
    }
    if (mission.status === 'Cancelled') {
      res.status(400).json({ error: 'Misi sudah dibatalkan.' });
      return;
    }

    const { progress, staffNotes, beforePhoto, afterPhoto } = req.body || {};
    const nextProgress: MissionProgress =
      progress !== undefined ? snapProgressStep(Number(progress)) : mission.progress;
    const nextNotes =
      staffNotes !== undefined ? String(staffNotes).trim().slice(0, 2000) : mission.staffNotes;
    const nextBefore =
      beforePhoto !== undefined
        ? validateSafePhotoUrl(beforePhoto) || mission.beforePhoto
        : mission.beforePhoto;
    const nextAfter =
      afterPhoto !== undefined
        ? validateSafePhotoUrl(afterPhoto) || mission.afterPhoto
        : mission.afterPhoto;

    let nextStatus = mission.status;
    let startedAt = mission.startedAt;
    let completedAt = mission.completedAt;

    if (nextProgress === 100) {
      nextStatus = 'Completed';
      startedAt = startedAt || nowIso;
      completedAt = nowIso;
    } else if (
      nextProgress > 0 &&
      (mission.status === 'Accepted' || mission.status === 'Revision Required')
    ) {
      nextStatus = 'In Progress';
      startedAt = startedAt || nowIso;
    }

    db.prepare(
      `UPDATE missions SET progress = ?, status = ?, started_at = ?, completed_at = ?, staff_notes = ?, before_photo = ?, after_photo = ? WHERE id = ?`
    ).run(
      nextProgress,
      nextStatus,
      startedAt,
      completedAt,
      nextNotes,
      nextBefore,
      nextAfter,
      mission.id
    );

    if (mission.guestRequestId) {
      db.prepare('UPDATE guest_requests SET status = ? WHERE id = ?').run(
        nextStatus,
        mission.guestRequestId
      );
    }

    const activity =
      nextStatus === 'Completed' && mission.status !== 'Completed'
        ? 'Misi diselesaikan'
        : afterPhoto || beforePhoto
          ? 'Foto diunggah'
          : staffNotes !== undefined && staffNotes !== mission.staffNotes
            ? 'Catatan ditambahkan'
            : 'Progres diperbarui';

    db.prepare(
      `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      makeId('HIS'),
      mission.id,
      user.id,
      user.fullName,
      activity,
      mission.status,
      nextStatus,
      mission.progress,
      nextProgress,
      nowIso,
      nextNotes !== mission.staffNotes ? nextNotes : '',
      validateSafePhotoUrl(afterPhoto) || validateSafePhotoUrl(beforePhoto)
    );

    if (nextStatus === 'Completed' && mission.status !== 'Completed') {
      for (const ownerId of getAllOwnerIds()) {
        createNotification({
          recipientId: ownerId,
          recipientRole: 'OWNER',
          title: 'Misi Selesai',
          message: `${user.fullName} menyelesaikan "${mission.title}".`,
          category: 'mission_completed',
          relatedMissionId: mission.id,
        });
      }
    }

    const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
    res.json({ mission: hydrateMission(updated, true) });
  });

  // Owner Revision Request (NOT completion approval!)
  router.post(
    '/missions/:id/revise',
    requireAuth,
    requireOwner,
    (req: AuthenticatedRequest, res) => {
      const owner = getFullUserProfile(req.auth!.userId)!;
      const note = String(req.body?.note || '').trim();
      if (!note) {
        res.status(400).json({ error: 'Catatan revisi wajib diisi.' });
        return;
      }
      const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
      if (!row) {
        res.status(404).json({ error: 'Misi tidak ditemukan.' });
        return;
      }
      const mission = hydrateMission(row, false);
      const transition = validateMissionTransition(mission, 'revise', owner);
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }
      const nowIso = new Date().toISOString();
      db.prepare(
        `UPDATE missions SET status = 'Revision Required', progress = 75, owner_notes = ?, completed_at = NULL WHERE id = ?`
      ).run(note, mission.id);

      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
         VALUES (?, ?, ?, ?, 'Misi direvisi oleh owner', ?, 'Revision Required', ?, 75, ?, ?)`
      ).run(
        makeId('HIS'),
        mission.id,
        owner.id,
        owner.fullName,
        mission.status,
        mission.progress,
        nowIso,
        note
      );

      if (mission.leadStaffId) {
        createNotification({
          recipientId: mission.leadStaffId,
          recipientRole: 'STAFF',
          title: 'Permintaan Revisi Misi',
          message: `Owner meminta perbaikan pada "${mission.title}": ${note}`,
          category: 'mission_revised',
          relatedMissionId: mission.id,
        });
      }

      const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
      res.json({ mission: hydrateMission(updated, true) });
    }
  );

  // Owner Cancel Mission
  router.post(
    '/missions/:id/cancel',
    requireAuth,
    requireOwner,
    (req: AuthenticatedRequest, res) => {
      const owner = getFullUserProfile(req.auth!.userId)!;
      const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(req.params.id) as any;
      if (!row) {
        res.status(404).json({ error: 'Misi tidak ditemukan.' });
        return;
      }
      const mission = hydrateMission(row, false);
      const transition = validateMissionTransition(mission, 'cancel', owner);
      if (!transition.allowed) {
        res.status(400).json({ error: transition.reason });
        return;
      }
      const nowIso = new Date().toISOString();
      const note = String(req.body?.note || 'Dibatalkan oleh Owner').trim();
      db.prepare("UPDATE missions SET status = 'Cancelled' WHERE id = ?").run(mission.id);
      if (mission.guestRequestId) {
        db.prepare("UPDATE guest_requests SET status = 'Cancelled' WHERE id = ?").run(
          mission.guestRequestId
        );
      }
      db.prepare(
        `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
         VALUES (?, ?, ?, ?, 'Misi dibatalkan', ?, 'Cancelled', ?, ?, ?, ?)`
      ).run(
        makeId('HIS'),
        mission.id,
        owner.id,
        owner.fullName,
        mission.status,
        mission.progress,
        mission.progress,
        nowIso,
        note
      );
      const updated = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission.id);
      res.json({ mission: hydrateMission(updated, true) });
    }
  );

  // Generate next occurrence for recurring missions
  router.post(
    '/missions/generate-recurring',
    requireAuth,
    requireOwner,
    (req: AuthenticatedRequest, res) => {
      const owner = getFullUserProfile(req.auth!.userId)!;
      const recurringRows = db
        .prepare("SELECT * FROM missions WHERE recurrence IN ('daily', 'weekly', 'monthly')")
        .all() as any[];

      let createdCount = 0;
      const nowIso = new Date().toISOString();
      const seenTitles = new Set(
        (
          db
            .prepare("SELECT title FROM missions WHERE status IN ('Available', 'Accepted', 'In Progress')")
            .all() as { title: string }[]
        ).map((r) => r.title)
      );

      for (const r of recurringRows) {
        if (seenTitles.has(r.title)) continue;
        const newId = makeId('MSN');
        const offsetHours = r.recurrence === 'daily' ? 24 : r.recurrence === 'weekly' ? 168 : 720;
        const nextDeadline = new Date(Date.now() + offsetHours * 3600 * 1000).toISOString();
        db.prepare(
          `INSERT INTO missions (id, title, unit_id, unit_name, area, room_id, room_name, mission_type, description, priority, distribution_type, is_team_mission, created_at, deadline, progress, status, recurrence, owner_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open Mission', ?, ?, ?, 0, 'Available', ?, ?)`
        ).run(
          newId,
          r.title,
          r.unit_id,
          r.unit_name,
          r.area,
          r.room_id,
          r.room_name,
          r.mission_type,
          r.description,
          r.priority,
          r.is_team_mission,
          nowIso,
          nextDeadline,
          r.recurrence,
          r.owner_notes || ''
        );
        const items = db
          .prepare('SELECT title, sort_order FROM mission_checklists WHERE mission_id = ?')
          .all(r.id) as { title: string; sort_order: number }[];
        const insertChk = db.prepare(
          'INSERT INTO mission_checklists (id, mission_id, title, is_completed, sort_order) VALUES (?, ?, ?, 0, ?)'
        );
        for (const it of items) {
          insertChk.run(makeId('CHK'), newId, it.title, it.sort_order);
        }
        db.prepare(
          `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, timestamp, note)
           VALUES (?, ?, ?, ?, 'Misi dibuat', '', 'Available', 0, 0, ?, ?)`
        ).run(
          makeId('HIS'),
          newId,
          owner.id,
          owner.fullName,
          nowIso,
          `Jadwal berulang (${r.recurrence}) dibuat otomatis.`
        );
        seenTitles.add(r.title);
        createdCount += 1;
      }

      res.json({ createdCount });
    }
  );

  // ==========================================
  // MISSION TEMPLATES & SYSTEM SETTINGS
  // ==========================================
  router.get('/templates', requireAuth, (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM mission_templates ORDER BY is_default DESC, id ASC')
      .all() as any[];
    res.json({
      templates: rows.map((r) => ({
        id: r.id,
        name: r.name,
        missionType: r.mission_type,
        defaultArea: r.default_area,
        checklistItems: JSON.parse(r.checklist_items || '[]'),
        isDefault: Boolean(r.is_default),
      })),
    });
  });

  router.post('/templates', requireAuth, requireOwner, (req, res) => {
    const { name, missionType, defaultArea, checklistItems } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Nama template wajib diisi.' });
      return;
    }
    const items = Array.isArray(checklistItems)
      ? checklistItems.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const id = makeId('TPL');
    db.prepare(
      'INSERT INTO mission_templates (id, name, mission_type, default_area, checklist_items, is_default) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(
      id,
      cleanName,
      String(missionType || 'General Cleaning'),
      String(defaultArea || 'Common Area'),
      JSON.stringify(items)
    );
    res.status(201).json({
      template: {
        id,
        name: cleanName,
        missionType: String(missionType || 'General Cleaning'),
        defaultArea: String(defaultArea || 'Common Area'),
        checklistItems: items,
        isDefault: false,
      },
    });
  });

  router.patch('/templates/:id', requireAuth, requireOwner, (req, res) => {
    const existing = db
      .prepare('SELECT * FROM mission_templates WHERE id = ?')
      .get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Template tidak ditemukan.' });
      return;
    }
    const name = req.body?.name ? String(req.body.name).trim() : existing.name;
    const missionType = req.body?.missionType
      ? String(req.body.missionType)
      : existing.mission_type;
    const defaultArea = req.body?.defaultArea
      ? String(req.body.defaultArea)
      : existing.default_area;
    const checklistItems = Array.isArray(req.body?.checklistItems)
      ? req.body.checklistItems.map((s: any) => String(s).trim()).filter(Boolean)
      : JSON.parse(existing.checklist_items || '[]');

    db.prepare(
      'UPDATE mission_templates SET name = ?, mission_type = ?, default_area = ?, checklist_items = ? WHERE id = ?'
    ).run(name, missionType, defaultArea, JSON.stringify(checklistItems), req.params.id);

    res.json({
      template: {
        id: req.params.id,
        name,
        missionType,
        defaultArea,
        checklistItems,
        isDefault: Boolean(existing.is_default),
      },
    });
  });

  router.delete('/templates/:id', requireAuth, requireOwner, (req, res) => {
    db.prepare('DELETE FROM mission_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.get('/settings', requireAuth, (_req, res) => {
    res.json({ settings: getSettingsObject() });
  });

  router.patch('/settings', requireAuth, requireOwner, (req, res) => {
    const allowedKeys = [
      'checkInStartHour',
      'lateCutoffTime',
      'checkOutMinHour',
      'allowEarlyCheckIn',
      'autoAssignGuestPriority',
    ];
    const nowIso = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const k of allowedKeys) {
      if (req.body && req.body[k] !== undefined) {
        stmt.run(k, String(req.body[k]), nowIso);
      }
    }
    res.json({ settings: getSettingsObject() });
  });

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        'SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50'
      )
      .all(req.auth!.userId) as any[];
    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        recipientId: r.recipient_id,
        recipientRole: r.recipient_role,
        title: r.title,
        message: r.message,
        category: r.category,
        relatedMissionId: r.related_mission_id || null,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
      })),
    });
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(
      req.params.id,
      req.auth!.userId
    );
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').run(
      req.auth!.userId
    );
    res.json({ ok: true });
  });

  // ==========================================
  // GUEST REQUESTS & OWNER REPORTS & SHEETS EXPORT
  // ==========================================
  router.get('/guest-requests', requireAuth, (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM guest_requests ORDER BY requested_at DESC LIMIT 100')
      .all() as any[];
    res.json({ guestRequests: rows.map(mapGuestRequestRow) });
  });

  router.get('/reports', requireAuth, requireOwner, (req, res) => {
    const { from, to, staffId, unitId, missionType } = req.query;

    let attRows = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all() as any[];
    if (from) attRows = attRows.filter((a) => a.date >= String(from));
    if (to) attRows = attRows.filter((a) => a.date <= String(to));
    if (staffId) attRows = attRows.filter((a) => a.staff_id === String(staffId));
    if (unitId) attRows = attRows.filter((a) => a.unit_id === String(unitId));

    const staffList = (
      db.prepare("SELECT * FROM users WHERE role = 'STAFF' ORDER BY full_name ASC").all() as any[]
    ).map(mapUserRow);

    const attendanceByStaff = staffList
      .filter((s) => !staffId || s.id === String(staffId))
      .map((s) => {
        const recs = attRows.filter((a) => a.staff_id === s.id).map(mapAttendanceRow);
        const stats = computeAttendanceSummary(recs);
        return {
          staffId: s.id,
          staffName: s.fullName,
          ...stats,
        };
      });

    let missionRows = db.prepare('SELECT * FROM missions ORDER BY created_at DESC').all() as any[];
    if (from) missionRows = missionRows.filter((m) => m.created_at.slice(0, 10) >= String(from));
    if (to) missionRows = missionRows.filter((m) => m.created_at.slice(0, 10) <= String(to));
    if (unitId) missionRows = missionRows.filter((m) => m.unit_id === String(unitId));
    if (missionType) missionRows = missionRows.filter((m) => m.mission_type === String(missionType));
    if (staffId) {
      missionRows = missionRows.filter((m) => m.lead_staff_id === String(staffId));
    }

    const hydrated = missionRows.map((r) => hydrateMission(r, false));
    const completedWithTimes = hydrated.filter((m) => m.startedAt && m.completedAt);
    const avgCompletionMinutes =
      completedWithTimes.length > 0
        ? Math.round(
            completedWithTimes.reduce(
              (acc, m) =>
                acc + Math.max(1, (Date.parse(m.completedAt!) - Date.parse(m.startedAt!)) / 60000),
              0
            ) / completedWithTimes.length
          )
        : 0;

    const missionByStaff = staffList.map((s) => {
      const own = hydrated.filter((m) => m.leadStaffId === s.id);
      return {
        staffId: s.id,
        staffName: s.fullName,
        total: own.length,
        completed: own.filter((m) => m.status === 'Completed').length,
        inProgress: own.filter((m) => m.status === 'In Progress').length,
        overdue: own.filter((m) => isMissionOverdue(m)).length,
        revised: own.filter((m) => m.status === 'Revision Required').length,
      };
    });

    const units = (db.prepare('SELECT * FROM units ORDER BY id ASC').all() as any[]).map(mapUnitRow);
    const missionByUnit = units.map((u) => {
      const uMissions = hydrated.filter((m) => m.unitId === u.id);
      return {
        unitId: u.id,
        unitName: u.name,
        total: uMissions.length,
        completed: uMissions.filter((m) => m.status === 'Completed').length,
        pending: uMissions.filter((m) => m.status !== 'Completed' && m.status !== 'Cancelled').length,
        overdue: uMissions.filter((m) => isMissionOverdue(m)).length,
      };
    });

    const categories = [
      'Room Cleaning',
      'Laundry',
      'Garden Cleaning',
      'General Cleaning',
      'Maintenance',
      'Guest Request',
      'Restocking',
      'Pool Cleaning',
    ];
    const operationalByCategory = categories.map((cat) => {
      const catMissions = hydrated.filter((m) => m.missionType === cat);
      return {
        category: cat,
        total: catMissions.length,
        completed: catMissions.filter((m) => m.status === 'Completed').length,
        overdue: catMissions.filter((m) => isMissionOverdue(m)).length,
      };
    });

    res.json({
      attendanceByStaff,
      attendanceRecords: attRows.map(mapAttendanceRow),
      missionSummary: {
        total: hydrated.length,
        completed: hydrated.filter((m) => m.status === 'Completed').length,
        incomplete: hydrated.filter(
          (m) => m.status !== 'Completed' && m.status !== 'Cancelled'
        ).length,
        overdue: hydrated.filter((m) => isMissionOverdue(m)).length,
        revised: hydrated.filter((m) => m.status === 'Revision Required').length,
        avgCompletionMinutes,
      },
      missionByStaff,
      missionByUnit,
      operationalByCategory,
    });
  });

  router.get('/export/csv', requireAuth, requireOwner, (req, res) => {
    const type = String(req.query.type || 'missions');
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'attendance') {
      headers = [
        'ID',
        'ID Staf',
        'Nama Staf',
        'Tanggal',
        'Status',
        'Check-In',
        'Check-Out',
        'Terlambat',
        'Menit Kerja',
        'Unit Kerja',
        'Catatan',
      ];
      const att = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all() as any[];
      rows = att.map((a) => [
        a.id,
        a.staff_id,
        a.staff_name,
        a.date,
        a.status,
        a.check_in_time || '-',
        a.check_out_time || '-',
        a.is_late ? 'Ya' : 'Tidak',
        String(a.work_minutes || 0),
        a.unit_name,
        a.notes,
      ]);
    } else {
      headers = [
        'ID Misi',
        'Judul Misi',
        'Unit Usaha',
        'Kamar/Area',
        'Jenis Misi',
        'Prioritas',
        'Pembagian',
        'Penanggung Jawab',
        'Status',
        'Progres (%)',
        'Deadline',
        'Waktu Selesai',
      ];
      const mRows = db.prepare('SELECT * FROM missions ORDER BY created_at DESC').all() as any[];
      rows = mRows.map((m) => [
        m.id,
        m.title,
        m.unit_name,
        `${m.room_name} (${m.area})`,
        m.mission_type,
        m.priority,
        m.distribution_type,
        m.lead_staff_name || '-',
        m.status,
        String(m.progress),
        m.deadline,
        m.completed_at || '-',
      ]);
    }

    const csv =
      '\uFEFF' +
      [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="thewina-${type}-${getTodayDateStr()}.csv"`
    );
    res.send(csv);
  });

  router.get('/export/sheets-bundle', requireAuth, requireOwner, (_req, res) => {
    const safeUsers = (
      db
        .prepare(
          'SELECT id, full_name, username, role, status, whatsapp, start_date, assigned_unit_ids, created_at FROM users'
        )
        .all() as any[]
    ).map((u) => ({ ...u, password_hash: '[PROTECTED]' }));

    const safeSettings = db
      .prepare("SELECT key, value, updated_at FROM settings WHERE key != 'owner_code_hash'")
      .all();

    res.json({
      schema: GOOGLE_SHEETS_SCHEMA,
      appsScriptCode: generateGoogleAppsScriptCode(),
      sheetsData: {
        Users: safeUsers,
        Attendance: db.prepare('SELECT * FROM attendance').all(),
        Units: db.prepare('SELECT * FROM units').all(),
        Rooms: db.prepare('SELECT * FROM rooms').all(),
        Missions: db.prepare('SELECT * FROM missions').all(),
        Mission_Checklists: db.prepare('SELECT * FROM mission_checklists').all(),
        Mission_Assignments: db.prepare('SELECT * FROM mission_assignments').all(),
        Guest_Requests: db.prepare('SELECT * FROM guest_requests').all(),
        Notifications: db.prepare('SELECT * FROM notifications').all(),
        Mission_History: db.prepare('SELECT * FROM mission_history').all(),
        Mission_Templates: db.prepare('SELECT * FROM mission_templates').all(),
        Settings: safeSettings,
      },
    });
  });

  router.get('/export/apps-script', requireAuth, requireOwner, (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="TheWina_Code.gs"');
    res.send(generateGoogleAppsScriptCode());
  });

  return router;
}
