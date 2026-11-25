import Link from "next/link";
import type { AnalysisRow, GroupSummary } from "@/lib/analytics";
import type { AnalysisContext } from "@/lib/analysis-service";
import { analysisUrl } from "@/components/analysis-controls";
import { formatBytes, formatPercent } from "@/lib/format";

export function MissingUsageBadge({ count }: { count: number }) {
  return count > 0 ? <span className="usage-partial" title={`有 ${count} 项用量未采集到；已用合计仅包含已采集的数据`}>部分未采集</span> : null;
}

export function GroupTable({ groups, context, compact = false }: { groups: GroupSummary[]; context: AnalysisContext; compact?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>项目 / 部门</th><th>账号</th><th>已停用</th><th>限额合计</th><th>已采集用量</th><th>已采集账号使用率</th><th>覆盖</th><th>超阈值</th><th>操作</th></tr></thead><tbody>
    {(compact ? groups.slice(0, 8) : groups).map((group) => <tr key={group.group}><td><Link className="link strong-link" href={analysisUrl("/analysis", context.filters, { group: group.group })}>{group.group}</Link></td><td>{group.accounts}</td><td>{group.stopped}</td><td className="mono">{formatBytes(group.limitBytes, "TB")}</td><td className="mono">{formatBytes(group.knownUsedBytes, "TB")}<MissingUsageBadge count={group.missingUsage}/></td><td>{formatPercent(group.utilization)}</td><td>{group.collected}/{group.accounts}</td><td>{group.thresholdCount}</td><td><Link className="link" href={analysisUrl("/analysis", context.filters, { group: group.group })}>查看分析</Link></td></tr>)}
  </tbody></table>{groups.length === 0 && <div className="empty">当前筛选没有项目或部门</div>}</div>;
}

export function AnalysisUserTable({ users, showGrowth = false, batchId }: { users: AnalysisRow[]; showGrowth?: boolean; batchId?: string }) {
  const href = (account: string) => `/users/${encodeURIComponent(account)}${batchId ? `?batch=${encodeURIComponent(batchId)}` : ""}`;
  return <div className="table-wrap"><table><thead><tr><th>账号</th><th>用户名称</th><th>项目 / 部门</th><th>状态</th><th>实际使用人</th><th>限额</th><th>已用</th><th>使用率</th>{showGrowth && <th>较上批变化</th>}<th>操作</th></tr></thead><tbody>
    {users.map((user) => <tr key={user.account}><td><Link className="link strong-link" href={href(user.account)}>{user.account}</Link></td><td>{user.name || "—"}</td><td>{user.department || "未填写部门"}</td><td><span className={`tag ${user.stopped ? "warning" : ""}`}>{user.status || "—"}</span></td><td>{user.actual_user || <span className="muted">未填写</span>}{user.nameMismatch && <span className="risk-dot" title="用户名称与实际使用人不一致">!</span>}</td><td className="mono">{formatBytes(user.limitBytes, "GB")}</td><td className="mono">{user.usedBytes === null ? <span className="muted">未采集完整</span> : formatBytes(user.usedBytes, "GB")}</td><td>{formatPercent(user.utilization)}</td>{showGrowth && <td className="mono">{user.growthBytes === null ? "—" : `${user.growthBytes > 0 ? "+" : ""}${formatBytes(user.growthBytes, "GB")}`}</td>}<td><Link className="link" href={href(user.account)}>详情</Link></td></tr>)}
  </tbody></table>{users.length === 0 && <div className="empty">当前条件没有账号</div>}</div>;
}
