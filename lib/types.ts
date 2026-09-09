export type Role = "teacher" | "student";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
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
  groupId: string;
  startsAt: string;
  duration: number;
  location: string;
};
export type Invite = {
  id: string;
  tokenHash: string;
  email: string;
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
  | "review"
  | "students"
  | "groups"
  | "gradebook"
  | "schedule"
  | "settings";
