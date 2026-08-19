/**
 * Reports and moderation (docs/08 §24, docs/09 §28–§29, docs/01 §21).
 *
 * The vocabularies mirror the backend allowlists exactly; the backend is the
 * authority and rejects anything else (docs/07 §5).
 */

/** docs/11 §38's reportable targets - complete since Phase 9 added media. */
export const REPORT_TARGET_TYPES = [
  "novel",
  "chapter",
  "comment",
  "community_post",
  "community_comment",
  "user",
  "media",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** docs/01 §21's categories, as the "Select reason" step of docs/02 §38. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "copyright",
  "illegal",
  "abuse",
  "ai_spam",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Thai labels for the reason picker. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "สแปม",
  harassment: "การคุกคาม",
  copyright: "ละเมิดลิขสิทธิ์",
  illegal: "เนื้อหาผิดกฎหมาย",
  abuse: "การละเมิด / เนื้อหาไม่เหมาะสม",
  ai_spam: "สแปมที่สร้างด้วย AI",
};

/** docs/08 §24.1's lifecycle. */
export const REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "rejected",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "รอตรวจสอบ",
  reviewing: "กำลังตรวจสอบ",
  resolved: "ดำเนินการแล้ว",
  rejected: "ไม่ดำเนินการ",
};

/** docs/08 §24.2's action vocabulary (docs/02 §46). */
export const MODERATION_ACTIONS = [
  "hide",
  "remove",
  "restore",
  "warn",
  "suspend",
  "ban",
] as const;

export type ModerationActionType = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_ACTION_LABELS: Record<ModerationActionType, string> = {
  hide: "ซ่อน",
  remove: "นำออก",
  restore: "คืนสถานะ",
  warn: "ตักเตือน",
  suspend: "ระงับบัญชีชั่วคราว",
  ban: "แบนบัญชี",
};

export const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  novel: "นิยาย",
  chapter: "ตอน",
  comment: "ความคิดเห็น",
  community_post: "โพสต์ชุมชน",
  community_comment: "ความคิดเห็นในชุมชน",
  user: "ผู้ใช้",
  media: "ไฟล์สื่อ",
};

/** MaxDescriptionRunes on the backend. */
export const REPORT_DESCRIPTION_MAX_LENGTH = 2000;

/** The public identity card beside staff-facing records (docs/08 §1.4). */
export interface ModerationCard {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

/** The reporter's own view - never carries moderator identity (docs/02 §38). */
export interface Report {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  created_at: string;
  resolved_at?: string;
}

/** The staff view adds who filed and who closed it (docs/11 §39). */
export interface ModeratorReport extends Report {
  reporter: ModerationCard;
  resolver?: ModerationCard;
}

/** One append-only audit entry (docs/08 §24.2). */
export interface ModerationAction {
  id: string;
  moderator: ModerationCard;
  target_type: ReportTargetType;
  target_id: string;
  action: ModerationActionType;
  reason?: string;
  created_at: string;
}

/** The live, staff-only description of what a report points at. */
export interface TargetSnapshot {
  type: ReportTargetType;
  id: string;
  exists: boolean;
  state?: string;
  title?: string;
  excerpt?: string;
  author?: ModerationCard;
}

/** The staff report page (docs/02 §46). */
export interface ReportDetail {
  report: ModeratorReport;
  target?: TargetSnapshot;
  history: ModerationAction[];
  available_actions: string[];
}
