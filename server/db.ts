import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth';
import type {
  AttendanceRecord,
  BusinessUnit,
  ChecklistItem,
  GuestRequestRecord,
  Mission,
  MissionAssignment,
  MissionHistoryEntry,
  MissionTemplate,
  RoomLocation,
  SystemSettings,
  UserProfile,
} from '../src/domain/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'thewina.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('OWNER', 'STAFF')),
    status TEXT NOT NULL CHECK(status IN ('Pending Approval', 'Approved', 'Rejected', 'Suspended')),
    whatsapp TEXT NOT NULL DEFAULT '',
    profile_photo TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    assigned_unit_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    room_count INTEGER NOT NULL DEFAULT 0,
    address TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    has_pool INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('room', 'common')),
    qr_code_id TEXT NOT NULL UNIQUE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    date TEXT NOT NULL,
    check_in_time TEXT,
    check_out_time TEXT,
    status TEXT NOT NULL,
    is_late INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    unit_id TEXT NOT NULL DEFAULT '',
    unit_name TEXT NOT NULL DEFAULT '',
    check_in_photo TEXT NOT NULL DEFAULT '',
    check_out_photo TEXT NOT NULL DEFAULT '',
    work_minutes INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    area TEXT NOT NULL,
    room_id TEXT,
    room_name TEXT NOT NULL DEFAULT '',
    mission_type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'Normal',
    distribution_type TEXT NOT NULL,
    is_team_mission INTEGER NOT NULL DEFAULT 0,
    lead_staff_id TEXT,
    lead_staff_name TEXT,
    created_at TEXT NOT NULL,
    deadline TEXT NOT NULL,
    claimed_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none',
    before_photo TEXT NOT NULL DEFAULT '',
    after_photo TEXT NOT NULL DEFAULT '',
    staff_notes TEXT NOT NULL DEFAULT '',
    owner_notes TEXT NOT NULL DEFAULT '',
    guest_request_id TEXT
  );

  CREATE TABLE IF NOT EXISTS mission_checklists (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    assigned_to_id TEXT,
    assigned_to_name TEXT,
    completed_by_id TEXT,
    completed_by_name TEXT,
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mission_assignments (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    UNIQUE(mission_id, staff_id),
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS guest_requests (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    room_id TEXT NOT NULL,
    room_name TEXT NOT NULL,
    qr_code_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    requested_at TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'High',
    status TEXT NOT NULL DEFAULT 'Available',
    assignee_name TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    recipient_role TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    related_mission_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mission_history (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    activity TEXT NOT NULL,
    previous_status TEXT NOT NULL DEFAULT '',
    new_status TEXT NOT NULL DEFAULT '',
    previous_progress INTEGER NOT NULL DEFAULT 0,
    new_progress INTEGER NOT NULL DEFAULT 0,
    checklist_changed TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS mission_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mission_type TEXT NOT NULL,
    default_area TEXT NOT NULL,
    checklist_items TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function seedDatabase(): void {
  const nowIso = new Date().toISOString();
  const todayStr = getTodayDateStr();

  // 1. Seed Settings
  const defaultSettings: Record<string, string> = {
    checkInStartHour: '06:00',
    lateCutoffTime: '08:15',
    checkOutMinHour: '15:00',
    allowEarlyCheckIn: 'true',
    autoAssignGuestPriority: 'High',
  };
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value, nowIso);
  }
  if (process.env.OWNER_CONFIRMATION_CODE?.trim()) {
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run('owner_code_hash', hashPassword(process.env.OWNER_CONFIRMATION_CODE.trim()), nowIso);
  }

  // 2. Seed Owner slot (unclaimed until first-run setup OR OWNER_INIT_PASSWORD env var)
  const ownerRow = db
    .prepare("SELECT id, password_hash FROM users WHERE role = 'OWNER' LIMIT 1")
    .get() as { id: string; password_hash: string } | undefined;

  const envOwnerPass = process.env.OWNER_INIT_PASSWORD?.trim();
  if (!ownerRow) {
    db.prepare(
      `INSERT INTO users (id, full_name, username, password_hash, role, status, whatsapp, profile_photo, start_date, assigned_unit_ids, created_at)
       VALUES (?, ?, ?, ?, 'OWNER', 'Approved', ?, ?, ?, '[]', ?)`
    ).run(
      'USR-OWNER-01',
      'Wina Management',
      'owner',
      envOwnerPass ? hashPassword(envOwnerPass) : '',
      '6281234567890',
      '/src/assets/images/avatar_owner_wina_1795663025062.jpg',
      '2022-01-01',
      nowIso
    );
  } else if (envOwnerPass && !ownerRow.password_hash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(envOwnerPass),
      ownerRow.id
    );
  }

  // 3. Seed 4 Business Units + Rooms + Common Area QRs
  const unitCount = (
    db.prepare('SELECT COUNT(*) as c FROM units').get() as { c: number }
  ).c;

  if (unitCount === 0) {
    const units: BusinessUnit[] = [
      {
        id: 'UNIT-01',
        name: 'The Wina Echo Beach Guest House',
        roomCount: 6,
        address: 'Jl. Pantai Batu Mejan, Echo Beach, Canggu',
        imageUrl: '/src/assets/images/wina_echo_beach_1795663025366.jpg',
        hasPool: false,
      },
      {
        id: 'UNIT-02',
        name: 'The Wina Guest House 2',
        roomCount: 4,
        address: 'Jl. Munduk Catu, Canggu',
        imageUrl: '/src/assets/images/wina_echo_beach_1795663025366.jpg',
        hasPool: false,
      },
      {
        id: 'UNIT-03',
        name: 'The Wina Guest House 3',
        roomCount: 12,
        address: 'Jl. Padang Linjong, Canggu',
        imageUrl: '/src/assets/images/wina_echo_beach_1795663025366.jpg',
        hasPool: true,
      },
      {
        id: 'UNIT-04',
        name: 'The Wina Villa 2',
        roomCount: 2,
        address: 'Jl. Pantai Berawa, Canggu',
        imageUrl: '/src/assets/images/wina_villa_pool_1795663025290.jpg',
        hasPool: true,
      },
    ];

    const insertUnit = db.prepare(
      'INSERT INTO units (id, name, room_count, address, image_url, has_pool) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertRoom = db.prepare(
      'INSERT INTO rooms (id, unit_id, name, type, qr_code_id) VALUES (?, ?, ?, ?, ?)'
    );

    for (const u of units) {
      insertUnit.run(u.id, u.name, u.roomCount, u.address, u.imageUrl, u.hasPool ? 1 : 0);
      for (let i = 1; i <= u.roomCount; i++) {
        const roomLabel =
          u.id === 'UNIT-04'
            ? `Villa Suite ${i}`
            : `Kamar ${u.id === 'UNIT-01' ? 100 + i : u.id === 'UNIT-02' ? 200 + i : 300 + i}`;
        const roomId = `ROOM-${u.id.slice(-2)}-${String(i).padStart(2, '0')}`;
        const qrId = `QR-${u.id}-${String(i).padStart(2, '0')}`;
        insertRoom.run(roomId, u.id, roomLabel, 'room', qrId);
      }
      insertRoom.run(
        `ROOM-${u.id.slice(-2)}-COMMON`,
        u.id,
        'Area Bersama / Lobby',
        'common',
        `QR-${u.id}-COMMON`
      );
    }
  }

  // 4. Seed 8 Default Mission Templates (Section J)
  const tplCount = (
    db.prepare('SELECT COUNT(*) as c FROM mission_templates').get() as { c: number }
  ).c;

  if (tplCount === 0) {
    const templates: MissionTemplate[] = [
      {
        id: 'TPL-01',
        name: 'Room Cleaning',
        missionType: 'Room Cleaning',
        defaultArea: 'Guest Room',
        checklistItems: [
          'Membersihkan tempat tidur',
          'Mengganti linen',
          'Mengganti sarung bantal',
          'Membersihkan meja',
          'Membersihkan lantai',
          'Membersihkan kaca',
          'Membersihkan kamar mandi',
          'Membersihkan toilet',
          'Mengisi ulang amenities',
          'Memeriksa handuk',
          'Memeriksa AC',
          'Memeriksa lampu',
          'Memeriksa sampah',
          'Memastikan kamar siap digunakan',
          'Foto hasil cleaning',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-02',
        name: 'Laundry',
        missionType: 'Laundry',
        defaultArea: 'Laundry',
        checklistItems: [
          'Mengambil linen kotor',
          'Mengambil handuk kotor',
          'Memisahkan cucian',
          'Mencuci',
          'Mengeringkan',
          'Melipat',
          'Memeriksa noda',
          'Menyimpan linen bersih',
          'Mengirim linen ke unit',
          'Mencatat linen rusak atau hilang',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-03',
        name: 'Garden Cleaning',
        missionType: 'Garden Cleaning',
        defaultArea: 'Garden',
        checklistItems: [
          'Menyapu daun',
          'Membersihkan rumput',
          'Memotong rumput',
          'Memotong tanaman',
          'Menyiram tanaman',
          'Membersihkan pot',
          'Mengumpulkan sampah',
          'Membersihkan area outdoor',
          'Memeriksa tanaman',
          'Foto hasil pekerjaan',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-04',
        name: 'General Cleaning',
        missionType: 'General Cleaning',
        defaultArea: 'Common Area',
        checklistItems: [
          'Membersihkan lobby',
          'Membersihkan koridor',
          'Membersihkan tangga',
          'Membersihkan dapur umum',
          'Membersihkan area parkir',
          'Membersihkan tempat sampah',
          'Membersihkan area umum',
          'Memeriksa kebersihan fasilitas',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-05',
        name: 'Bathroom Cleaning',
        missionType: 'Bathroom Cleaning',
        defaultArea: 'Bathroom',
        checklistItems: [
          'Membersihkan wastafel',
          'Membersihkan shower',
          'Membersihkan toilet',
          'Membersihkan kaca',
          'Membersihkan lantai',
          'Mengisi ulang perlengkapan',
          'Memeriksa saluran air',
          'Foto hasil pekerjaan',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-06',
        name: 'Pool Cleaning',
        missionType: 'Pool Cleaning',
        defaultArea: 'Pool',
        checklistItems: [
          'Membersihkan daun',
          'Membersihkan permukaan air',
          'Memeriksa kebersihan kolam',
          'Membersihkan area pool',
          'Memeriksa perlengkapan',
          'Foto hasil pekerjaan',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-07',
        name: 'Maintenance',
        missionType: 'Maintenance',
        defaultArea: 'Maintenance',
        checklistItems: [
          'Memeriksa AC',
          'Memeriksa lampu',
          'Memeriksa shower',
          'Memeriksa keran',
          'Memeriksa toilet',
          'Memeriksa pintu',
          'Memeriksa kunci',
          'Memeriksa furnitur',
          'Memeriksa peralatan',
          'Melaporkan kerusakan',
          'Foto kondisi kerusakan atau hasil perbaikan',
        ],
        isDefault: true,
      },
      {
        id: 'TPL-08',
        name: 'Restocking',
        missionType: 'Restocking',
        defaultArea: 'Storage',
        checklistItems: [
          'Memeriksa stok',
          'Mengisi ulang amenities',
          'Mengisi ulang air minum',
          'Mengisi ulang perlengkapan',
          'Mencatat barang yang habis',
          'Foto jika diperlukan',
        ],
        isDefault: true,
      },
    ];

    const insertTpl = db.prepare(
      'INSERT INTO mission_templates (id, name, mission_type, default_area, checklist_items, is_default) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const t of templates) {
      insertTpl.run(
        t.id,
        t.name,
        t.missionType,
        t.defaultArea,
        JSON.stringify(t.checklistItems),
        t.isDefault ? 1 : 0
      );
    }
  }

  // 5. Seed Realistic Staff Directory + Sample Attendance + Initial Missions (no hardcoded passwords on staff profiles unless created by owner/registration)
  const staffCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STAFF'").get() as { c: number }
  ).c;

  if (staffCount === 0) {
    const sampleStaff = [
      {
        id: 'USR-STF-01',
        fullName: 'Sari Dewi',
        username: 'sari_dewi',
        whatsapp: '6281911223344',
        photo: '/src/assets/images/avatar_staff_field_1795663025231.jpg',
        startDate: '2024-03-10',
        units: ['UNIT-01', 'UNIT-02', 'UNIT-03', 'UNIT-04'],
      },
      {
        id: 'USR-STF-02',
        fullName: 'Made Putra',
        username: 'made_putra',
        whatsapp: '6281922334455',
        photo: '',
        startDate: '2024-06-01',
        units: ['UNIT-01', 'UNIT-04'],
      },
      {
        id: 'USR-STF-03',
        fullName: 'Ketut Ayu',
        username: 'ketut_ayu',
        whatsapp: '6281933445566',
        photo: '',
        startDate: '2025-01-15',
        units: ['UNIT-02', 'UNIT-03'],
      },
      {
        id: 'USR-STF-04',
        fullName: 'Wayan Budi',
        username: 'wayan_budi',
        whatsapp: '6281944556677',
        photo: '',
        startDate: '2025-04-02',
        units: ['UNIT-01', 'UNIT-02', 'UNIT-03', 'UNIT-04'],
      },
    ];

    const insertStaff = db.prepare(
      `INSERT INTO users (id, full_name, username, password_hash, role, status, whatsapp, profile_photo, start_date, assigned_unit_ids, created_at)
       VALUES (?, ?, ?, '', 'STAFF', 'Approved', ?, ?, ?, ?, ?)`
    );
    for (const s of sampleStaff) {
      insertStaff.run(
        s.id,
        s.fullName,
        s.username,
        s.whatsapp,
        s.photo,
        s.startDate,
        JSON.stringify(s.units),
        nowIso
      );
    }

    // Seed sample today attendance
    const insertAtt = db.prepare(
      `INSERT INTO attendance (id, staff_id, staff_name, date, check_in_time, check_out_time, status, is_late, notes, unit_id, unit_name, work_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertAtt.run(
      'ATT-SEED-01',
      'USR-STF-01',
      'Sari Dewi',
      todayStr,
      `${todayStr}T07:55:00.000Z`,
      null,
      'Working',
      0,
      'Shift pagi Echo Beach',
      'UNIT-01',
      'The Wina Echo Beach Guest House',
      0
    );
    insertAtt.run(
      'ATT-SEED-02',
      'USR-STF-02',
      'Made Putra',
      todayStr,
      `${todayStr}T08:22:00.000Z`,
      null,
      'Working',
      1,
      'Perawatan taman & pool Villa 2',
      'UNIT-04',
      'The Wina Villa 2',
      0
    );
    insertAtt.run(
      'ATT-SEED-03',
      'USR-STF-03',
      'Ketut Ayu',
      todayStr,
      null,
      null,
      'Off',
      0,
      'Jadwal libur mingguan',
      'UNIT-03',
      'The Wina Guest House 3',
      0
    );
  }

  // 6. Seed Sample Operational Missions if empty
  const missionCount = (
    db.prepare('SELECT COUNT(*) as c FROM missions').get() as { c: number }
  ).c;

  if (missionCount === 0) {
    const deadlineAfternoon = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const deadlineEvening = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const deadlineOverdue = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const insertMission = db.prepare(
      `INSERT INTO missions (id, title, unit_id, unit_name, area, room_id, room_name, mission_type, description, priority, distribution_type, is_team_mission, lead_staff_id, lead_staff_name, created_at, deadline, claimed_at, started_at, completed_at, progress, status, recurrence, staff_notes, owner_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertChk = db.prepare(
      `INSERT INTO mission_checklists (id, mission_id, title, is_completed, assigned_to_id, assigned_to_name, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertHis = db.prepare(
      `INSERT INTO mission_history (id, mission_id, actor_id, actor_name, activity, previous_status, new_status, previous_progress, new_progress, checklist_changed, timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Mission 1: Available Open Mission
    insertMission.run(
      'MSN-1001',
      'Deep Room Cleaning Kamar 101 (Check-out)',
      'UNIT-01',
      'The Wina Echo Beach Guest House',
      'Guest Room',
      'ROOM-01-01',
      'Kamar 101',
      'Room Cleaning',
      'Tamu check-out pukul 11.00. Siapkan kamar lengkap untuk tamu berikutnya.',
      'High',
      'Open Mission',
      0,
      null,
      null,
      nowIso,
      deadlineAfternoon,
      null,
      null,
      null,
      0,
      'Available',
      'daily',
      '',
      'Pastikan AC disetel 22C sebelum tamu datang.'
    );
    const m1Items = [
      'Membersihkan tempat tidur',
      'Mengganti linen',
      'Mengganti sarung bantal',
      'Membersihkan kamar mandi',
      'Mengisi ulang amenities',
      'Foto hasil cleaning',
    ];
    m1Items.forEach((t, idx) =>
      insertChk.run(`CHK-1001-${idx + 1}`, 'MSN-1001', t, 0, null, null, idx + 1)
    );
    insertHis.run(
      'HIS-1001-1',
      'MSN-1001',
      'USR-OWNER-01',
      'Wina Management',
      'Misi dibuat',
      '',
      'Available',
      0,
      0,
      '',
      nowIso,
      'Misi Room Cleaning harian dibuat.'
    );

    // Mission 2: Team Mission In Progress
    insertMission.run(
      'MSN-1002',
      'Perawatan Taman & Kolam Villa 2',
      'UNIT-04',
      'The Wina Villa 2',
      'Pool',
      'ROOM-04-COMMON',
      'Area Bersama / Lobby',
      'Pool Cleaning',
      'Bersihkan daun di kolam renang dan rapikan tanaman tepi deck kayu.',
      'Normal',
      'Open Mission',
      1,
      'USR-STF-02',
      'Made Putra',
      nowIso,
      deadlineEvening,
      nowIso,
      nowIso,
      null,
      50,
      'In Progress',
      'daily',
      'Klorin & pH sudah dicek normal.',
      ''
    );
    db.prepare(
      'INSERT INTO mission_assignments (id, mission_id, staff_id, staff_name, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('ASN-1002-1', 'MSN-1002', 'USR-STF-02', 'Made Putra', 'lead', nowIso);

    const m2Items = [
      'Membersihkan daun',
      'Membersihkan permukaan air',
      'Memeriksa kebersihan kolam',
      'Membersihkan area pool',
    ];
    m2Items.forEach((t, idx) =>
      insertChk.run(
        `CHK-1002-${idx + 1}`,
        'MSN-1002',
        t,
        idx < 2 ? 1 : 0,
        'USR-STF-02',
        'Made Putra',
        idx + 1
      )
    );
    insertHis.run(
      'HIS-1002-1',
      'MSN-1002',
      'USR-STF-02',
      'Made Putra',
      'Misi dimulai',
      'Accepted',
      'In Progress',
      0,
      50,
      'Membersihkan daun, Membersihkan permukaan air',
      nowIso,
      'Pembersihan kolam sedang berjalan.'
    );

    // Mission 3: Overdue Available Maintenance
    insertMission.run(
      'MSN-1003',
      'Perbaikan Keran Shower Kamar 302',
      'UNIT-03',
      'The Wina Guest House 3',
      'Bathroom',
      'ROOM-03-02',
      'Kamar 302',
      'Maintenance',
      'Cek tekanan air dan ganti seal keran shower yang menetes.',
      'Urgent',
      'Open Mission',
      0,
      null,
      null,
      nowIso,
      deadlineOverdue,
      null,
      null,
      null,
      0,
      'Available',
      'none',
      '',
      'Prioritas sebelum jam check-in sore.'
    );
    ['Memeriksa shower', 'Memeriksa keran', 'Foto kondisi kerusakan atau hasil perbaikan'].forEach(
      (t, idx) =>
        insertChk.run(`CHK-1003-${idx + 1}`, 'MSN-1003', t, 0, null, null, idx + 1)
    );

    // Mission 4: Completed Mission
    insertMission.run(
      'MSN-1004',
      'Laundry Linen & Handuk Harian GH 2',
      'UNIT-02',
      'The Wina Guest House 2',
      'Laundry',
      'ROOM-02-COMMON',
      'Area Bersama / Lobby',
      'Laundry',
      'Kumpulkan linen kotor dan kirim stok handuk bersih ke lantai 1.',
      'Normal',
      'Open Mission',
      0,
      'USR-STF-01',
      'Sari Dewi',
      nowIso,
      deadlineEvening,
      nowIso,
      nowIso,
      nowIso,
      100,
      'Completed',
      'daily',
      'Semua handuk bersih sudah disimpan di rak lantai 1.',
      ''
    );
    ['Mengambil linen kotor', 'Mencuci', 'Mengeringkan', 'Mengirim linen ke unit'].forEach(
      (t, idx) =>
        insertChk.run(`CHK-1004-${idx + 1}`, 'MSN-1004', t, 1, 'USR-STF-01', 'Sari Dewi', idx + 1)
    );
  }
}

seedDatabase();

export function mapUserRow(row: any): UserProfile {
  let assignedUnitIds: string[] = [];
  try {
    assignedUnitIds = JSON.parse(row.assigned_unit_ids || '[]');
  } catch {
    assignedUnitIds = [];
  }
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    role: row.role,
    status: row.status,
    whatsapp: row.whatsapp || '',
    profilePhoto: row.profile_photo || '',
    startDate: row.start_date || '',
    assignedUnitIds,
    createdAt: row.created_at,
  };
}

export function mapUnitRow(row: any): BusinessUnit {
  return {
    id: row.id,
    name: row.name,
    roomCount: row.room_count,
    address: row.address,
    imageUrl: row.image_url,
    hasPool: Boolean(row.has_pool),
  };
}

export function mapRoomRow(row: any): RoomLocation {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    name: row.name,
    type: row.type,
    qrCodeId: row.qr_code_id,
  };
}

export function getChecklistForMission(missionId: string): ChecklistItem[] {
  const rows = db
    .prepare(
      'SELECT * FROM mission_checklists WHERE mission_id = ? ORDER BY sort_order ASC, id ASC'
    )
    .all(missionId) as any[];
  return rows.map((r) => ({
    id: r.id,
    missionId: r.mission_id,
    title: r.title,
    isCompleted: Boolean(r.is_completed),
    assignedToId: r.assigned_to_id || null,
    assignedToName: r.assigned_to_name || null,
    completedById: r.completed_by_id || null,
    completedByName: r.completed_by_name || null,
    completedAt: r.completed_at || null,
    sortOrder: r.sort_order,
  }));
}

export function getAssignmentsForMission(missionId: string): MissionAssignment[] {
  const rows = db
    .prepare('SELECT * FROM mission_assignments WHERE mission_id = ? ORDER BY joined_at ASC')
    .all(missionId) as any[];
  return rows.map((r) => ({
    id: r.id,
    missionId: r.mission_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

export function getHistoryForMission(missionId: string): MissionHistoryEntry[] {
  const rows = db
    .prepare('SELECT * FROM mission_history WHERE mission_id = ? ORDER BY timestamp DESC')
    .all(missionId) as any[];
  return rows.map((r) => ({
    id: r.id,
    missionId: r.mission_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    activity: r.activity,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    previousProgress: r.previous_progress,
    newProgress: r.new_progress,
    checklistChanged: r.checklist_changed,
    timestamp: r.timestamp,
    note: r.note,
    photoUrl: r.photo_url,
  }));
}

export function hydrateMission(row: any, includeHistory = false): Mission {
  return {
    id: row.id,
    title: row.title,
    unitId: row.unit_id,
    unitName: row.unit_name,
    area: row.area,
    roomId: row.room_id || null,
    roomName: row.room_name || '',
    missionType: row.mission_type,
    description: row.description || '',
    priority: row.priority,
    distributionType: row.distribution_type,
    isTeamMission: Boolean(row.is_team_mission),
    leadStaffId: row.lead_staff_id || null,
    leadStaffName: row.lead_staff_name || null,
    additionalStaff: getAssignmentsForMission(row.id),
    createdAt: row.created_at,
    deadline: row.deadline,
    claimedAt: row.claimed_at || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    progress: (row.progress ?? 0) as Mission['progress'],
    status: row.status,
    recurrence: row.recurrence || 'none',
    beforePhoto: row.before_photo || '',
    afterPhoto: row.after_photo || '',
    staffNotes: row.staff_notes || '',
    ownerNotes: row.owner_notes || '',
    guestRequestId: row.guest_request_id || null,
    checklist: getChecklistForMission(row.id),
    history: includeHistory ? getHistoryForMission(row.id) : undefined,
  };
}

export function getSettingsObject(): SystemSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    checkInStartHour: map.get('checkInStartHour') || '06:00',
    lateCutoffTime: map.get('lateCutoffTime') || '08:15',
    checkOutMinHour: map.get('checkOutMinHour') || '15:00',
    allowEarlyCheckIn: map.get('allowEarlyCheckIn') !== 'false',
    autoAssignGuestPriority:
      (map.get('autoAssignGuestPriority') as SystemSettings['autoAssignGuestPriority']) || 'High',
  };
}

export function createNotification(params: {
  recipientId: string;
  recipientRole: 'OWNER' | 'STAFF';
  title: string;
  message: string;
  category: string;
  relatedMissionId?: string | null;
}): void {
  db.prepare(
    `INSERT INTO notifications (id, recipient_id, recipient_role, title, message, category, related_mission_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    makeId('NTF'),
    params.recipientId,
    params.recipientRole,
    params.title,
    params.message,
    params.category,
    params.relatedMissionId || null,
    new Date().toISOString()
  );
}

export function mapAttendanceRow(row: any): AttendanceRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name,
    date: row.date,
    checkInTime: row.check_in_time || null,
    checkOutTime: row.check_out_time || null,
    status: row.status,
    isLate: Boolean(row.is_late),
    notes: row.notes || '',
    unitId: row.unit_id || '',
    unitName: row.unit_name || '',
    checkInPhoto: row.check_in_photo || '',
    checkOutPhoto: row.check_out_photo || '',
    workMinutes: row.work_minutes || 0,
  };
}

export function mapGuestRequestRow(row: any): GuestRequestRecord {
  return {
    id: row.id,
    missionId: row.mission_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    roomId: row.room_id,
    roomName: row.room_name,
    qrCodeId: row.qr_code_id,
    requestType: row.request_type,
    description: row.description || '',
    photoUrl: row.photo_url || '',
    requestedAt: row.requested_at,
    priority: row.priority,
    status: row.status,
    assigneeName: row.assignee_name || null,
  };
}
