import assert from "node:assert/strict";
import test from "node:test";
import { enrichUsers, filterUsers, groupSummaries, metrics, normalizeFilters, rankUsers, type AnalysisFilters } from "../lib/analytics";
import type { UserView } from "../lib/data";

const GiB = 1024 ** 3;
function user(account: string, department: string, dataUsed: number | null, homeUsed: number | null, overrides: Partial<UserView> = {}): UserView {
  return {
    batch_id: "2", account, name: account, department, status: "正常", actual_user: account,
    data_used: dataUsed === null ? null : String(dataUsed * GiB), home_used: homeUsed === null ? null : String(homeUsed * GiB),
    data_limit: String(1024 * GiB), home_limit: String(50 * GiB), data_percent: null, home_percent: null,
    ...overrides,
  };
}

test("analysis keeps missing use separate from zero and excludes incomplete accounts from utilization", () => {
  const rows = enrichUsers([user("a", "P1", 100, 10), user("b", "P1", null, 0)], [], "data");
  const result = metrics(rows, 80);
  assert.equal(result.accounts, 2);
  assert.equal(result.collected, 1);
  assert.equal(result.missingUsage, 1);
  assert.equal(result.knownUsedBytes, 100 * GiB);
  assert.equal(result.limitBytes, 2048 * GiB);
  assert.equal(result.utilization, 100 / 1024 * 100);
  assert.equal(rows[1].usedBytes, null);
  assert.equal(metrics(enrichUsers([user("b", "P1", null, 0)], [], "home"), 80).collected, 1);
});

test("analysis defaults to Data and ignores old combined-directory links", () => {
  assert.equal(normalizeFilters({}, []).volume, "data");
  assert.equal(normalizeFilters({ volume: "all" }, []).volume, "data");
  assert.equal(normalizeFilters({ volume: "home" }, []).volume, "home");
});

test("project grouping, mismatch, stopped status, threshold and quota ranking are consistent", () => {
  const rows = enrichUsers([
    user("a", "P1", 900, 40, { name: "甲", actual_user: "乙", status: "已停用" }),
    user("b", "P1", 0, 0, { actual_user: "" }),
    user("c", "P2", 200, 5, { data_limit: String(2048 * GiB) }),
  ], [], "data");
  const groups = groupSummaries(rows, 80);
  const p1 = groups.find((group) => group.group === "P1")!;
  assert.equal(p1.accounts, 2);
  assert.equal(p1.stopped, 1);
  assert.equal(p1.mismatch, 1);
  assert.equal(p1.actualMissing, 1);
  assert.equal(p1.thresholdCount, 1);
  assert.equal(rankUsers(rows, "limit")[0].account, "c");
  const filters: AnalysisFilters = { batch: "2", group: "P1", status: "已停用", volume: "data", threshold: 80, q: "" };
  assert.deepEqual(filterUsers(rows, filters).map((row) => row.account), ["a"]);
});

test("growth requires two captured values and can be negative", () => {
  const previous = [user("a", "P1", 120, 5), user("b", "P1", null, 5)];
  const current = [user("a", "P1", 100, 5), user("b", "P1", 10, 5)];
  const rows = enrichUsers(current, previous, "data");
  assert.equal(rows[0].growthBytes, -20 * GiB);
  assert.equal(rows[1].growthBytes, null);
  assert.equal(rankUsers(rows, "growth")[0].account, "a");
});
