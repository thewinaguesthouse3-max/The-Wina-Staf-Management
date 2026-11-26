export type UserRole = 'OWNER' | 'STAFF';

export type AccountStatus =
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Suspended';

export type AttendanceStatus =
  | 'Working'
  | 'Off'
  | 'Izin'
  | 'Sick'
  | 'Emergency Leave';

export type WorkArea =
  | 'Guest Room'
  | 'Bathroom'
  | 'Laundry'
  | 'Garden'
  | 'Pool'
  | 'Common Area'
  | 'Kitchen'
  | 'Storage'
  | 'Maintenance'
  | 'Other';

export type MissionType =
  | 'Room Cleaning'
  | 'Laundry'
  | 'Garden Cleaning'
  | 'General Cleaning'
  | 'Bathroom Cleaning'
  | 'Pool Cleaning'
  | 'Maintenance'
  | 'Restocking'
  | 'Guest Request'
  | 'Other';

export type MissionDistribution = 'Open Mission' | 'Assigned Mission';

export type MissionPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type MissionStatus =
  | 'Available'
  | 'Accepted'
  | 'In Progress'
  | 'Paused'
  | 'Completed'
  | 'Revision Required'
  | 'Cancelled';

export type MissionProgress = 0 | 25 | 50 | 75 | 100;

export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'monthly';

export type GuestRequestType =
  | 'Room Cleaning'
  | 'Request Clean Towels'
  | 'Request New Bed Sheets'
  | 'Request Drinking Water'
  | 'Request Amenities'
  | 'Request Room Service Assistance'
  | 'Report Maintenance'
  | 'Report Problem'
  | 'Other Request';

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  status: AccountStatus;
  whatsapp: string;
  profilePhoto: string;
  startDate: string;
  assignedUnitIds: string[];
  createdAt: string;
}

export interface BusinessUnit {
  id: string;
  name: string;
  roomCount: number;
  address: string;
  imageUrl: string;
  hasPool: boolean;
}

export interface RoomLocation {
  id: string;
  unitId: string;
  unitName?: string;
  name: string;
  type: 'room' | 'common';
  qrCodeId: string;
}

export interface ChecklistItem {
  id: string;
  missionId: string;
  title: string;
  isCompleted: boolean;
  assignedToId: string | null;
  assignedToName: string | null;
  completedById: string | null;
  completedByName: string | null;
  completedAt: string | null;
  sortOrder: number;
}

export interface MissionAssignment {
  id: string;
  missionId: string;
  staffId: string;
  staffName: string;
  role: 'lead' | 'member';
  joinedAt: string;
}

export interface MissionHistoryEntry {
  id: string;
  missionId: string;
  actorId: string;
  actorName: string;
  activity: string;
  previousStatus: string;
  newStatus: string;
  previousProgress: number;
  newProgress: number;
  checklistChanged: string;
  timestamp: string;
  note: string;
  photoUrl: string;
}

export interface Mission {
  id: string;
  title: string;
  unitId: string;
  unitName: string;
  area: WorkArea;
  roomId: string | null;
  roomName: string;
  missionType: MissionType;
  description: string;
  priority: MissionPriority;
  distributionType: MissionDistribution;
  isTeamMission: boolean;
  leadStaffId: string | null;
  leadStaffName: string | null;
  additionalStaff: MissionAssignment[];
  createdAt: string;
  deadline: string;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  progress: MissionProgress;
  status: MissionStatus;
  recurrence: RecurrencePattern;
  beforePhoto: string;
  afterPhoto: string;
  staffNotes: string;
  ownerNotes: string;
  guestRequestId: string | null;
  checklist: ChecklistItem[];
  history?: MissionHistoryEntry[];
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  isLate: boolean;
  notes: string;
  unitId: string;
  unitName: string;
  checkInPhoto: string;
  checkOutPhoto: string;
  workMinutes: number;
}

export interface CoworkerAttendance {
  staffId: string;
  fullName: string;
  profilePhoto: string;
  status: AttendanceStatus;
  unitName: string;
  currentMissionTitle: string | null;
}

export interface GuestRequestRecord {
  id: string;
  missionId: string;
  unitId: string;
  unitName: string;
  roomId: string;
  roomName: string;
  qrCodeId: string;
  requestType: GuestRequestType;
  description: string;
  photoUrl: string;
  requestedAt: string;
  priority: MissionPriority;
  status: MissionStatus;
  assigneeName: string | null;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  recipientRole: UserRole;
  title: string;
  message: string;
  category: string;
  relatedMissionId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface MissionTemplate {
  id: string;
  name: string;
  missionType: MissionType;
  defaultArea: WorkArea;
  checklistItems: string[];
  isDefault: boolean;
}

export interface SystemSettings {
  checkInStartHour: string;
  lateCutoffTime: string;
  checkOutMinHour: string;
  allowEarlyCheckIn: boolean;
  autoAssignGuestPriority: MissionPriority;
}
