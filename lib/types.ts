import type { WorkbookResult } from "./workbook";
import type { CompassResult, AiUsage } from "./compass";
import type { TimeDiary } from "./diary";
import type { MindMapResult } from "./mind-map";
import type { OdysseyResult } from "./odyssey";
import type { FailureEntry } from "./failure-journal";
import type { Workspace } from "./workspace";

export type Role = "student" | "teacher" | "manager" | "admin";
export type InviteRole = Exclude<Role, "admin">;
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspaceIds: Workspace[];
  passwordHash: string;
  color: string;
  createdAt: string;
};
export type SafeUser = Omit<User, "passwordHash">;
export type Group = {
  id: string;
  name: string;
  description: string;
  color: string;
  studentIds: string[];
};
export type Assignment = {
  id: string;
  title: string;
  description: string;
  subject: string;
  deadline: string;
  createdAt: string;
  studentIds: string[];
  fileIds: string[];
  maxScore: number;
  questions: number;
  archived: boolean;
};
export type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
  answers: string;
  fileIds: string[];
  submittedAt: string;
  status: "pending" | "reviewed";
  score?: number;
  feedback?: string;
  reviewFileIds: string[];
  reviewedAt?: string;
};
export type Attachment = {
  id: string;
  ownerId: string;
  name: string;
  mime: string;
  size: number;
  key: string;
  kind: "material" | "submission" | "review";
  storage: "local" | "s3";
};
export type Lesson = {
  id: string;
  title: string;
  groupId?: string;
  studentId?: string;
  startsAt: string;
  duration: number;
  location: string;
};
export type Invite = {
  id: string;
  tokenHash: string;
  email: string;
  role: InviteRole;
  workspaceIds: Workspace[];
  groupId?: string;
  expiresAt: string;
  usedAt?: string;
};
export type Session = { id: string; userId: string; expiresAt: string };
export type LoginAttempt = { id: string; count: number; resetAt: string };
export type Database = {
  users: User[];
  groups: Group[];
  assignments: Assignment[];
  submissions: Submission[];
  files: Attachment[];
  lessons: Lesson[];
  invites: Invite[];
  sessions: Session[];
  loginAttempts: LoginAttempt[];
  workbookResults: WorkbookResult[];
  compassResults: CompassResult[];
  timeDiaries: TimeDiary[];
  mindMaps: MindMapResult[];
  odysseyPlans: OdysseyResult[];
  failureEntries: FailureEntry[];
  aiUsage: AiUsage[];
};
export type AppData = {
  user: SafeUser;
  users: SafeUser[];
  groups: Group[];
  assignments: Assignment[];
  submissions: Submission[];
  files: Omit<Attachment, "key" | "storage">[];
  lessons: Lesson[];
  demo: boolean;
};
export type View =
  | "overview"
  | "assignments"
  | "workbook"
  | "review"
  | "students"
  | "groups"
  | "gradebook"
  | "schedule"
  | "access"
  | "settings";
