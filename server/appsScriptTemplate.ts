export const GOOGLE_SHEETS_SCHEMA = [
  {
    sheetName: 'Users',
    columns: [
      'id',
      'full_name',
      'username',
      'password_hash',
      'role',
      'status',
      'whatsapp',
      'profile_photo',
      'start_date',
      'assigned_unit_ids',
      'created_at',
    ],
  },
  {
    sheetName: 'Attendance',
    columns: [
      'id',
      'staff_id',
      'staff_name',
      'date',
      'check_in_time',
      'check_out_time',
      'status',
      'is_late',
      'notes',
      'unit_id',
      'unit_name',
      'check_in_photo',
      'check_out_photo',
      'work_minutes',
    ],
  },
  {
    sheetName: 'Units',
    columns: ['id', 'name', 'room_count', 'address', 'has_pool'],
  },
  {
    sheetName: 'Rooms',
    columns: ['id', 'unit_id', 'name', 'type', 'qr_code_id'],
  },
  {
    sheetName: 'Missions',
    columns: [
      'id',
      'title',
      'unit_id',
      'unit_name',
      'area',
      'room_id',
      'room_name',
      'mission_type',
      'description',
      'priority',
      'distribution_type',
      'is_team_mission',
      'lead_staff_id',
      'lead_staff_name',
      'created_at',
      'deadline',
      'claimed_at',
      'started_at',
      'completed_at',
      'progress',
      'status',
      'recurrence',
      'staff_notes',
      'owner_notes',
      'guest_request_id',
    ],
  },
  {
    sheetName: 'Mission_Checklists',
    columns: [
      'id',
      'mission_id',
      'title',
      'is_completed',
      'assigned_to_id',
      'assigned_to_name',
      'completed_by_id',
      'completed_by_name',
      'completed_at',
      'sort_order',
    ],
  },
  {
    sheetName: 'Mission_Assignments',
    columns: ['id', 'mission_id', 'staff_id', 'staff_name', 'role', 'joined_at'],
  },
  {
    sheetName: 'Guest_Requests',
    columns: [
      'id',
      'mission_id',
      'unit_id',
      'unit_name',
      'room_id',
      'room_name',
      'qr_code_id',
      'request_type',
      'description',
      'requested_at',
      'priority',
      'status',
      'assignee_name',
    ],
  },
  {
    sheetName: 'Notifications',
    columns: [
      'id',
      'recipient_id',
      'recipient_role',
      'title',
      'message',
      'category',
      'related_mission_id',
      'is_read',
      'created_at',
    ],
  },
  {
    sheetName: 'Mission_History',
    columns: [
      'id',
      'mission_id',
      'actor_id',
      'actor_name',
      'activity',
      'previous_status',
      'new_status',
      'previous_progress',
      'new_progress',
      'checklist_changed',
      'timestamp',
      'note',
    ],
  },
  {
    sheetName: 'Mission_Templates',
    columns: ['id', 'name', 'mission_type', 'default_area', 'checklist_items', 'is_default'],
  },
  {
    sheetName: 'Settings',
    columns: ['key', 'value', 'updated_at'],
  },
];

export function generateGoogleAppsScriptCode(): string {
  const sheetDefs = GOOGLE_SHEETS_SCHEMA.map(
    (s) => `  "${s.sheetName}": ${JSON.stringify(s.columns)}`
  ).join(',\n');

  return `/**
 * THE WINA STAFF & MISSION MANAGEMENT SYSTEM
 * Google Apps Script Database Initializer & Sync Endpoint (Code.gs)
 * 
 * Cara Menggunakan:
 * 1. Buka Google Sheets baru, beri nama "The Wina Operations Database".
 * 2. Klik Extensions > Apps Script, lalu tempel kode ini ke Code.gs.
 * 3. Jalankan fungsi initializeTheWinaSheets() satu kali untuk membuat 12 sheet beserta header.
 * 4. Deploy > New deployment > Web App jika ingin menghubungkan webhook sinkronisasi.
 */

const SHEET_SCHEMA = {
${sheetDefs}
};

function initializeTheWinaSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_SCHEMA).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const headers = SHEET_SCHEMA[sheetName];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isEmpty = firstRow.every(function(cell) { return cell === ""; });
    if (isEmpty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0F766E").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheetName = payload.sheetName;
    const rows = payload.rows || [];
    if (!SHEET_SCHEMA[sheetName]) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Sheet tidak valid" })).setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const headers = SHEET_SCHEMA[sheetName];
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (rows.length > 0) {
      const matrix = rows.map(function(rowObj) {
        return headers.map(function(col) { return rowObj[col] !== undefined ? String(rowObj[col]) : ""; });
      });
      sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, count: rows.length })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
}
