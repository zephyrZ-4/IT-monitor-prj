import { ensureSchema, pool } from "@/lib/db";
import type { ActivityBatch, ActivitySnapshot } from "@/lib/activity";
import type { VolumeMode } from "@/lib/analytics";
import type { TicketType } from "@/lib/ticket-types";

export interface Batch {
  id: string;
  imported_at: Date;
  user_count: number;
  usage_count: number;
  rule_count: number;
  warnings: string[];
  software_filename: string;
  usage_filename: string;
  rules_filename: string;
}

export interface UserView {
  batch_id: string;
  account: string;
  name: string;
  department: string;
  status: string;
  actual_user: string;
  home_used: string | null;
  data_used: string | null;
  home_limit: string | null;
  data_limit: string | null;
  home_percent: string | null;
  data_percent: string | null;
}

const userJoin = `
  SELECT u.batch_id::text AS batch_id,u.account,u.name,u.department,u.status,u.actual_user,
    hu.used_bytes::text AS home_used,du.used_bytes::text AS data_used,
    COALESCE(hr.limit_bytes,hd.limit_bytes)::text AS home_limit,
    COALESCE(dr.limit_bytes,dd.limit_bytes)::text AS data_limit,
    hu.hard_percent::text AS home_percent,du.hard_percent::text AS data_percent
  FROM user_snapshots u
  LEFT JOIN usage_snapshots hu ON hu.batch_id=u.batch_id AND hu.account=u.account AND hu.volume='home'
  LEFT JOIN usage_snapshots du ON du.batch_id=u.batch_id AND du.account=u.account AND du.volume='data'
  LEFT JOIN quota_rules hr ON hr.batch_id=u.batch_id AND hr.account=u.account AND hr.volume='home'
  LEFT JOIN quota_rules dr ON dr.batch_id=u.batch_id AND dr.account=u.account AND dr.volume='data'
  LEFT JOIN quota_rules hd ON hd.batch_id=u.batch_id AND hd.is_default AND hd.volume='home'
  LEFT JOIN quota_rules dd ON dd.batch_id=u.batch_id AND dd.is_default AND dd.volume='data'
`;

export async function analysisSnapshots(limit = 60): Promise<{ batches: Batch[]; users: UserView[] }> {
  await ensureSchema();
  const batches = await pool().query<Batch>("SELECT * FROM import_batches ORDER BY id DESC LIMIT $1", [limit]);
  if (!batches.rows.length) return { batches: [], users: [] };
  const ids = batches.rows.map((batch) => batch.id);
  const users = await pool().query<UserView>(`${userJoin} WHERE u.batch_id = ANY($1::bigint[]) ORDER BY u.batch_id,u.account`, [ids]);
  return { batches: batches.rows, users: users.rows };
}

export async function activityBatchList(): Promise<ActivityBatch[]> {
  await ensureSchema();
  return (await pool().query<ActivityBatch>("SELECT id::text, imported_at, user_count FROM import_batches ORDER BY id DESC")).rows;
}

export async function activitySnapshots(ids: string[], volume: VolumeMode): Promise<ActivitySnapshot[]> {
  if (!ids.length) return [];
  return (await pool().query<ActivitySnapshot>(
    `SELECT u.batch_id::text, u.account, u.name, u.department, u.status, u.actual_user, s.used_bytes::text
       FROM user_snapshots u
       LEFT JOIN usage_snapshots s ON s.batch_id=u.batch_id AND s.account=u.account AND s.volume=$2 AND NOT s.shared
      WHERE u.batch_id = ANY($1::bigint[])`,
    [ids, volume],
  )).rows;
}

export async function unlinkedUsage(batchId: string): Promise<{ account: string; volume: string; used_bytes: string; shared: boolean }[]> {
  const result = await pool().query<{ account: string; volume: string; used_bytes: string; shared: boolean }>(
    `SELECT s.account,s.volume,s.used_bytes::text,s.shared
     FROM usage_snapshots s LEFT JOIN user_snapshots u ON u.batch_id=s.batch_id AND u.account=s.account
     WHERE s.batch_id=$1 AND u.account IS NULL ORDER BY s.shared DESC,s.account,s.volume`,
    [batchId],
  );
  return result.rows;
}

export async function latestBatch(): Promise<Batch | null> {
  await ensureSchema();
  const result = await pool().query("SELECT * FROM import_batches ORDER BY id DESC LIMIT 1");
  return result.rows[0] ?? null;
}

export async function dashboard(search = "", batchId = "") {
  const latest = await latestBatch();
  const batch = !batchId || latest?.id === batchId ? latest :
    (await pool().query<Batch>("SELECT * FROM import_batches WHERE id::text=$1", [batchId])).rows[0] ?? null;
  if (!batch) return { batch: null, users: [] as UserView[], shared: [], unmatched: [], stats: { users: 0, homeUsed: 0, dataUsed: 0, nearLimit: 0 } };
  const [userResult, extraResult] = await Promise.all([
    pool().query<UserView>(`${userJoin} WHERE u.batch_id=$1 ORDER BY u.account`, [batch.id]),
    pool().query<{ account: string; volume: string; used_bytes: string; hard_percent: string | null; shared: boolean }>(
      `SELECT s.account,s.volume,s.used_bytes::text,s.hard_percent::text,s.shared
       FROM usage_snapshots s LEFT JOIN user_snapshots u ON u.batch_id=s.batch_id AND u.account=s.account
       WHERE s.batch_id=$1 AND u.account IS NULL ORDER BY s.shared DESC,s.account,s.volume`,
      [batch.id],
    ),
  ]);
  const allUsers = userResult.rows;
  const term = search.trim().toLowerCase();
  const users = term ? allUsers.filter((u) => [u.account, u.name, u.department, u.actual_user].some((v) => v.toLowerCase().includes(term))) : allUsers;
  const nearLimit = allUsers.filter((u) => [
    [u.home_used, u.home_limit], [u.data_used, u.data_limit],
  ].some(([used, limit]) => used !== null && limit !== null && Number(used) / Number(limit) >= 0.8)).length;
  return {
    batch,
    users,
    shared: extraResult.rows.filter((row) => row.shared),
    unmatched: extraResult.rows.filter((row) => !row.shared),
    stats: {
      users: allUsers.length,
      homeUsed: allUsers.reduce((sum, u) => sum + Number(u.home_used || 0), 0),
      dataUsed: allUsers.reduce((sum, u) => sum + Number(u.data_used || 0), 0),
      nearLimit,
    },
  };
}

export async function userDetail(account: string, batchId?: string) {
  const newest = await latestBatch();
  if (batchId && !/^\d+$/.test(batchId)) return null;
  const batch = batchId ? (await pool().query<Batch>("SELECT * FROM import_batches WHERE id=$1", [batchId])).rows[0] ?? null : newest;
  if (!batch) return null;
  const latest = await pool().query<UserView>(`${userJoin} WHERE u.batch_id=$1 AND u.account=$2`, [batch.id, account]);
  if (!latest.rowCount) return null;
  const history = await pool().query<{
    id: string; imported_at: Date; name: string; department: string; status: string; actual_user: string; home_used: string | null; data_used: string | null; home_limit: string | null; data_limit: string | null;
  }>(
    `SELECT b.id::text,b.imported_at,u.name,u.department,u.status,u.actual_user,hu.used_bytes::text AS home_used,du.used_bytes::text AS data_used,
       COALESCE(hr.limit_bytes,hd.limit_bytes)::text AS home_limit,
       COALESCE(dr.limit_bytes,dd.limit_bytes)::text AS data_limit
     FROM import_batches b JOIN user_snapshots u ON u.batch_id=b.id AND u.account=$1
     LEFT JOIN usage_snapshots hu ON hu.batch_id=b.id AND hu.account=$1 AND hu.volume='home'
     LEFT JOIN usage_snapshots du ON du.batch_id=b.id AND du.account=$1 AND du.volume='data'
     LEFT JOIN quota_rules hr ON hr.batch_id=b.id AND hr.account=$1 AND hr.volume='home'
     LEFT JOIN quota_rules dr ON dr.batch_id=b.id AND dr.account=$1 AND dr.volume='data'
     LEFT JOIN quota_rules hd ON hd.batch_id=b.id AND hd.is_default AND hd.volume='home'
     LEFT JOIN quota_rules dd ON dd.batch_id=b.id AND dd.is_default AND dd.volume='data'
     WHERE b.id <= $2 ORDER BY b.id DESC LIMIT 30`,
    [account, batch.id],
  );
  return { batch, user: latest.rows[0], history: history.rows.reverse(), isLatest: batch.id === newest?.id };
}

export async function recentBatches(): Promise<Batch[]> {
  await ensureSchema();
  const result = await pool().query("SELECT * FROM import_batches ORDER BY id DESC LIMIT 20");
  return result.rows;
}

export async function ticketCounts(): Promise<{ pending: number; total: number }> {
  await ensureSchema();
  const result = await pool().query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status='待处理')::int AS pending FROM tickets");
  return result.rows[0];
}

type TicketRecord = {
  id: string;
  tracking_code: string;
  ticket_type: TicketType;
  applicant_name: string;
  employee_id: string;
  status: string;
  admin_note: string;
  created_at: Date;
};

type TicketItemRecord = {
  id: string;
  position: number;
  account: string;
  field: string;
  volume: string | null;
  requested_value: string;
  reason: string;
};

type TicketApplicantRecord = { position: number; applicant_name: string; employee_id: string };
const applicantCount = `CASE WHEN t.ticket_type='polarion-user' THEN
  1 + (SELECT count(*)::int FROM ticket_additional_applicants a WHERE a.ticket_id=t.id)
  END AS applicant_count`;

export async function tickets(status = "", type: TicketType | "" = "") {
  await ensureSchema();
  const result = await pool().query<TicketRecord & { item_count: number; applicant_count: number | null }>(
    `SELECT t.*,count(i.id)::int AS item_count,${applicantCount} FROM tickets t LEFT JOIN ticket_items i ON i.ticket_id=t.id
     WHERE ($1='' OR t.status=$1) AND ($2='' OR t.ticket_type=$2)
     GROUP BY t.id ORDER BY t.created_at DESC,t.id LIMIT 100`,
    [status, type],
  );
  return result.rows;
}

export async function ticketExportRecords(status: string, sheets: { items: boolean; applicants: boolean }, type: TicketType | "" = "") {
  await ensureSchema();
  const rows = await pool().query<Omit<TicketRecord, "id"> & { item_count: number; applicant_count: number | null }>(
    `SELECT t.tracking_code,t.ticket_type,t.created_at,t.applicant_name,t.employee_id,t.status,t.admin_note,count(i.id)::int AS item_count,${applicantCount}
     FROM tickets t LEFT JOIN ticket_items i ON i.ticket_id=t.id
     WHERE ($1='' OR t.status=$1) AND ($2='' OR t.ticket_type=$2) GROUP BY t.id ORDER BY t.created_at DESC,t.id`,
    [status, type],
  );
  const itemRows = sheets.items ? (await pool().query<Omit<TicketItemRecord, "id"> & Pick<TicketRecord, "tracking_code" | "ticket_type">>(
    `SELECT t.tracking_code,t.ticket_type,i.position,i.account,i.field,i.volume,i.requested_value,i.reason
     FROM tickets t JOIN ticket_items i ON i.ticket_id=t.id
     WHERE ($1='' OR t.status=$1) AND ($2='' OR t.ticket_type=$2)
     ORDER BY t.created_at DESC,t.id,i.position`, [status, type],
  )).rows : [];
  const applicants = sheets.applicants ? (await pool().query<TicketApplicantRecord & Pick<TicketRecord, "tracking_code">>(
    `SELECT t.tracking_code,a.position,a.applicant_name,a.employee_id
     FROM tickets t CROSS JOIN LATERAL (
       SELECT 1 AS position,t.applicant_name,t.employee_id
       UNION ALL
       SELECT e.position,e.applicant_name,e.employee_id FROM ticket_additional_applicants e WHERE e.ticket_id=t.id
     ) a
     WHERE t.ticket_type='polarion-user' AND ($1='' OR t.status=$1) AND ($2='' OR t.ticket_type=$2)
     ORDER BY t.created_at DESC,t.id,a.position`, [status, type],
  )).rows : [];
  return { rows: rows.rows, items: itemRows, applicants };
}

export async function ticketDetail(id: string) {
  await ensureSchema();
  const ticket = await pool().query<TicketRecord>("SELECT * FROM tickets WHERE id=$1", [id]);
  if (!ticket.rowCount) return null;
  const record = ticket.rows[0];
  if (record.ticket_type === "polarion-user") {
    const extra = await pool().query<TicketApplicantRecord>(
      "SELECT position,applicant_name,employee_id FROM ticket_additional_applicants WHERE ticket_id=$1 ORDER BY position", [id],
    );
    return { ticket: record, items: [], applicants: [{ position: 1, applicant_name: record.applicant_name, employee_id: record.employee_id }, ...extra.rows] };
  }
  const items = await pool().query<TicketItemRecord>("SELECT * FROM ticket_items WHERE ticket_id=$1 ORDER BY position", [id]);
  return { ticket: record, items: items.rows, applicants: [] };
}
