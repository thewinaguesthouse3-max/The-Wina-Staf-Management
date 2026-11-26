import type {
  AttendanceRecord,
  ChecklistItem,
  Mission,
  MissionProgress,
  MissionStatus,
  UserProfile,
} from './types';

const ALLOWED_PROGRESS_STEPS: MissionProgress[] = [0, 25, 50, 75, 100];

export function snapProgressStep(rawPercent: number): MissionProgress {
  if (rawPercent >= 100) return 100;
  if (rawPercent >= 75) return 75;
  if (rawPercent >= 50) return 50;
  if (rawPercent >= 25) return 25;
  return 0;
}

/**
 * Computes progress from unique checklist items without double-counting.
 * If checklist is empty, preserves manual progress step.
 * When 100% of checklist items are completed, always returns 100.
 */
export function calculateProgressFromChecklist(
  items: Pick<ChecklistItem, 'id' | 'isCompleted'>[],
  manualProgress: MissionProgress = 0
): MissionProgress {
  if (!items || items.length === 0) {
    return snapProgressStep(manualProgress);
  }
  const seen = new Set<string>();
  let total = 0;
  let completed = 0;
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    total += 1;
    if (item.isCompleted) {
      completed += 1;
    }
  }
  if (total === 0) return snapProgressStep(manualProgress);
  if (completed === total) return 100;
  const pct = (completed / total) * 100;
  return snapProgressStep(pct);
}

/**
 * Validates whether a staff member has unit and assignment access to view/act on a mission.
 */
export function canStaffAccessMission(
  staff: Pick<UserProfile, 'id' | 'role' | 'status' | 'assignedUnitIds'>,
  mission: Pick<
    Mission,
    'unitId' | 'distributionType' | 'leadStaffId' | 'isTeamMission' | 'additionalStaff'
  >
): boolean {
  if (staff.role === 'OWNER') return true;
  if (staff.status !== 'Approved') return false;

  const hasUnitAccess =
    staff.assignedUnitIds.length === 0 ||
    staff.assignedUnitIds.includes(mission.unitId);

  if (!hasUnitAccess) return false;

  if (mission.distributionType === 'Assigned Mission') {
    const isLead = mission.leadStaffId === staff.id;
    const isMember = mission.additionalStaff.some((a) => a.staffId === staff.id);
    if (!isLead && !isMember) {
      return false;
    }
  }
  return true;
}

export type MissionAction =
  | 'claim'
  | 'join'
  | 'start'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'revise'
  | 'cancel';

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  nextStatus: MissionStatus;
  nextProgress?: MissionProgress;
}

/**
 * Pure mission state machine validator.
 * Enforces:
 * - No owner approval needed to claim, start, update, or complete missions.
 * - Solo mission cannot be claimed by two staff concurrently.
 * - Team mission allows multiple staff to join while active.
 * - Only Owner can revise or cancel.
 */
export function validateMissionTransition(
  mission: Pick<
    Mission,
    | 'status'
    | 'progress'
    | 'distributionType'
    | 'isTeamMission'
    | 'leadStaffId'
    | 'additionalStaff'
    | 'unitId'
  >,
  action: MissionAction,
  actor: Pick<UserProfile, 'id' | 'role' | 'status' | 'assignedUnitIds'>
): TransitionResult {
  if (actor.role === 'STAFF' && actor.status !== 'Approved') {
    return {
      allowed: false,
      reason: 'Akun staf belum disetujui atau sedang ditangguhkan.',
      nextStatus: mission.status,
    };
  }

  const isAssignedToActor =
    mission.leadStaffId === actor.id ||
    mission.additionalStaff.some((m) => m.staffId === actor.id);

  switch (action) {
    case 'claim': {
      if (actor.role !== 'STAFF') {
        return {
          allowed: false,
          reason: 'Hanya staf yang dapat mengambil misi.',
          nextStatus: mission.status,
        };
      }
      if (!canStaffAccessMission(actor, mission)) {
        return {
          allowed: false,
          reason: 'Anda tidak memiliki akses ke unit usaha atau misi ini.',
          nextStatus: mission.status,
        };
      }
      if (mission.distributionType === 'Assigned Mission') {
        return {
          allowed: false,
          reason: 'Misi ini sudah ditugaskan langsung kepada staf.',
          nextStatus: mission.status,
        };
      }
      if (mission.status !== 'Available' || mission.leadStaffId !== null) {
        return {
          allowed: false,
          reason: 'Misi sudah diambil oleh staf lain.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'Accepted' };
    }

    case 'join': {
      if (actor.role !== 'STAFF') {
        return {
          allowed: false,
          reason: 'Hanya staf yang dapat bergabung ke misi.',
          nextStatus: mission.status,
        };
      }
      if (!mission.isTeamMission) {
        return {
          allowed: false,
          reason: 'Misi ini bukan misi pekerjaan bersama (Team Mission).',
          nextStatus: mission.status,
        };
      }
      if (!['Accepted', 'In Progress', 'Paused', 'Revision Required'].includes(mission.status)) {
        return {
          allowed: false,
          reason: 'Misi ini tidak dalam status aktif untuk diikuti.',
          nextStatus: mission.status,
        };
      }
      if (isAssignedToActor) {
        return {
          allowed: false,
          reason: 'Anda sudah tergabung dalam misi ini.',
          nextStatus: mission.status,
        };
      }
      if (
        actor.assignedUnitIds.length > 0 &&
        !actor.assignedUnitIds.includes(mission.unitId)
      ) {
        return {
          allowed: false,
          reason: 'Anda tidak memiliki akses ke unit usaha misi ini.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: mission.status };
    }

    case 'start': {
      if (!isAssignedToActor && actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Ambil misi terlebih dahulu sebelum memulai.',
          nextStatus: mission.status,
        };
      }
      if (!['Accepted', 'Revision Required'].includes(mission.status)) {
        return {
          allowed: false,
          reason: `Misi dengan status ${mission.status} tidak dapat dimulai.`,
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'In Progress' };
    }

    case 'pause': {
      if (!isAssignedToActor && actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Anda bukan penanggung jawab misi ini.',
          nextStatus: mission.status,
        };
      }
      if (mission.status !== 'In Progress') {
        return {
          allowed: false,
          reason: 'Hanya misi yang sedang berjalan yang dapat dijeda.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'Paused' };
    }

    case 'resume': {
      if (!isAssignedToActor && actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Anda bukan penanggung jawab misi ini.',
          nextStatus: mission.status,
        };
      }
      if (mission.status !== 'Paused') {
        return {
          allowed: false,
          reason: 'Misi tidak sedang dalam status dijeda.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'In Progress' };
    }

    case 'complete': {
      if (!isAssignedToActor && actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Anda bukan penanggung jawab misi ini.',
          nextStatus: mission.status,
        };
      }
      if (!['Accepted', 'In Progress', 'Paused', 'Revision Required'].includes(mission.status)) {
        return {
          allowed: false,
          reason: `Misi dengan status ${mission.status} tidak dapat diselesaikan.`,
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'Completed', nextProgress: 100 };
    }

    case 'revise': {
      if (actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Hanya Owner yang dapat meminta revisi misi.',
          nextStatus: mission.status,
        };
      }
      if (mission.status !== 'Completed') {
        return {
          allowed: false,
          reason: 'Revisi hanya dapat diminta setelah misi selesai.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'Revision Required', nextProgress: 75 };
    }

    case 'cancel': {
      if (actor.role !== 'OWNER') {
        return {
          allowed: false,
          reason: 'Hanya Owner yang dapat membatalkan misi.',
          nextStatus: mission.status,
        };
      }
      if (mission.status === 'Cancelled') {
        return {
          allowed: false,
          reason: 'Misi sudah dibatalkan.',
          nextStatus: mission.status,
        };
      }
      return { allowed: true, nextStatus: 'Cancelled' };
    }
  }
}

export function isMissionOverdue(
  mission: Pick<Mission, 'deadline' | 'status'>,
  nowMs: number = Date.now()
): boolean {
  if (!mission.deadline) return false;
  if (mission.status === 'Completed' || mission.status === 'Cancelled') {
    return false;
  }
  const deadlineMs = Date.parse(mission.deadline);
  if (Number.isNaN(deadlineMs)) return false;
  return nowMs > deadlineMs;
}

export interface AttendanceSummaryStats {
  workingDays: number;
  offDays: number;
  izinDays: number;
  sickDays: number;
  emergencyDays: number;
  lateCount: number;
  totalHours: number;
}

export function computeAttendanceSummary(
  records: Pick<AttendanceRecord, 'status' | 'isLate' | 'workMinutes'>[]
): AttendanceSummaryStats {
  let workingDays = 0;
  let offDays = 0;
  let izinDays = 0;
  let sickDays = 0;
  let emergencyDays = 0;
  let lateCount = 0;
  let totalMinutes = 0;

  for (const r of records) {
    if (r.status === 'Working') workingDays += 1;
    else if (r.status === 'Off') offDays += 1;
    else if (r.status === 'Izin') izinDays += 1;
    else if (r.status === 'Sick') sickDays += 1;
    else if (r.status === 'Emergency Leave') emergencyDays += 1;

    if (r.isLate) lateCount += 1;
    totalMinutes += Math.max(0, r.workMinutes || 0);
  }

  return {
    workingDays,
    offDays,
    izinDays,
    sickDays,
    emergencyDays,
    lateCount,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
}

export { ALLOWED_PROGRESS_STEPS };
