import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProgressFromChecklist,
  canStaffAccessMission,
  computeAttendanceSummary,
  isMissionOverdue,
  validateMissionTransition,
} from './missionRules';

const approvedStaffA = {
  id: 'USR-STAFF-1',
  role: 'STAFF' as const,
  status: 'Approved' as const,
  assignedUnitIds: ['UNIT-01'],
};

const approvedStaffB = {
  id: 'USR-STAFF-2',
  role: 'STAFF' as const,
  status: 'Approved' as const,
  assignedUnitIds: ['UNIT-01', 'UNIT-02'],
};

const pendingStaff = {
  id: 'USR-STAFF-3',
  role: 'STAFF' as const,
  status: 'Pending Approval' as const,
  assignedUnitIds: ['UNIT-01'],
};

const ownerUser = {
  id: 'USR-OWNER',
  role: 'OWNER' as const,
  status: 'Approved' as const,
  assignedUnitIds: [],
};

test('checklist progress prevents double-counting and reaches 100% only when all items done', () => {
  const items = [
    { id: 'c1', isCompleted: true },
    { id: 'c1', isCompleted: true }, // duplicate ID should not double count
    { id: 'c2', isCompleted: true },
    { id: 'c3', isCompleted: false },
    { id: 'c4', isCompleted: false },
  ];
  assert.equal(calculateProgressFromChecklist(items), 50);

  const allDone = [
    { id: 'c1', isCompleted: true },
    { id: 'c2', isCompleted: true },
    { id: 'c3', isCompleted: true },
  ];
  assert.equal(calculateProgressFromChecklist(allDone), 100);
});

test('solo open mission can be claimed without owner approval and blocks second staff', () => {
  const openMission = {
    status: 'Available' as const,
    progress: 0 as const,
    distributionType: 'Open Mission' as const,
    isTeamMission: false,
    leadStaffId: null,
    additionalStaff: [],
    unitId: 'UNIT-01',
  };

  const claimA = validateMissionTransition(openMission, 'claim', approvedStaffA);
  assert.equal(claimA.allowed, true);
  assert.equal(claimA.nextStatus, 'Accepted');

  const afterClaim = {
    ...openMission,
    status: 'Accepted' as const,
    leadStaffId: approvedStaffA.id,
  };
  const claimB = validateMissionTransition(afterClaim, 'claim', approvedStaffB);
  assert.equal(claimB.allowed, false);

  const joinB = validateMissionTransition(afterClaim, 'join', approvedStaffB);
  assert.equal(joinB.allowed, false);
});

test('team mission allows multiple authorized staff to join and work', () => {
  const teamMission = {
    status: 'In Progress' as const,
    progress: 25 as const,
    distributionType: 'Open Mission' as const,
    isTeamMission: true,
    leadStaffId: approvedStaffA.id,
    additionalStaff: [],
    unitId: 'UNIT-01',
  };

  const joinB = validateMissionTransition(teamMission, 'join', approvedStaffB);
  assert.equal(joinB.allowed, true);

  const completeA = validateMissionTransition(teamMission, 'complete', approvedStaffA);
  assert.equal(completeA.allowed, true);
  assert.equal(completeA.nextStatus, 'Completed');
  assert.equal(completeA.nextProgress, 100);
});

test('pending staff cannot access or claim missions and staff cannot revise or cancel', () => {
  const openMission = {
    status: 'Available' as const,
    progress: 0 as const,
    distributionType: 'Open Mission' as const,
    isTeamMission: false,
    leadStaffId: null,
    additionalStaff: [],
    unitId: 'UNIT-01',
  };

  assert.equal(canStaffAccessMission(pendingStaff, openMission), false);
  const claimPending = validateMissionTransition(openMission, 'claim', pendingStaff);
  assert.equal(claimPending.allowed, false);

  const completedMission = {
    ...openMission,
    status: 'Completed' as const,
    progress: 100 as const,
    leadStaffId: approvedStaffA.id,
  };
  const staffRevise = validateMissionTransition(completedMission, 'revise', approvedStaffA);
  assert.equal(staffRevise.allowed, false);

  const ownerRevise = validateMissionTransition(completedMission, 'revise', ownerUser);
  assert.equal(ownerRevise.allowed, true);
  assert.equal(ownerRevise.nextStatus, 'Revision Required');
});

test('overdue detection and attendance summary calculations', () => {
  const pastDeadline = '2026-01-01T10:00:00.000Z';
  const now = Date.parse('2026-01-02T10:00:00.000Z');
  assert.equal(isMissionOverdue({ deadline: pastDeadline, status: 'In Progress' }, now), true);
  assert.equal(isMissionOverdue({ deadline: pastDeadline, status: 'Completed' }, now), false);

  const summary = computeAttendanceSummary([
    { status: 'Working', isLate: false, workMinutes: 480 },
    { status: 'Working', isLate: true, workMinutes: 450 },
    { status: 'Off', isLate: false, workMinutes: 0 },
    { status: 'Izin', isLate: false, workMinutes: 0 },
    { status: 'Sick', isLate: false, workMinutes: 0 },
  ]);
  assert.equal(summary.workingDays, 2);
  assert.equal(summary.lateCount, 1);
  assert.equal(summary.offDays, 1);
  assert.equal(summary.izinDays, 1);
  assert.equal(summary.sickDays, 1);
  assert.equal(summary.totalHours, 15.5);
});
