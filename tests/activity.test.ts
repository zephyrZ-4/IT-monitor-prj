import assert from "node:assert/strict";
import test from "node:test";
import { activityFilters, activityRows, sortActivity, type ActivityBatch, type ActivitySnapshot } from "../lib/activity";

const gb = 1024 ** 3;
const batches = [1, 2, 3, 4].map(id => ({ id: String(id), imported_at: new Date(2026, 10, id), user_count: 4 } satisfies ActivityBatch));
function snapshots(account: string, values: (number | null | "absent")[]): ActivitySnapshot[] {
  return values.flatMap((value, index) => value === "absent" ? [] : [{
    batch_id: batches[index].id, account, name: account, department: "", status: "正常", actual_user: account,
    used_bytes: value === null ? null : String(value * gb),
  }]);
}

test("a zero net change does not hide intermediate movement or qualify as idle", () => {
  const [swing, steady] = activityRows(batches, [
    ...snapshots("swing", [100, 130, 100, 100]), ...snapshots("steady", [100, 100, 100, 100]),
  ], gb, 3);
  assert.equal(swing.net, 0);
  assert.equal(swing.movement, 60 * gb);
  assert.equal(swing.streak, 1);
  assert.equal(swing.candidate, false);
  assert.equal(steady.movement, 0);
  assert.equal(steady.streak, 3);
  assert.equal(steady.candidate, true);
  assert.deepEqual(sortActivity([swing, steady], "movement", true).map(row => row.account), ["steady", "swing"]);
});

test("a missing measurement or absent account breaks comparisons; zero remains a measurement", () => {
  const [missing, absent, zero] = activityRows(batches, [
    ...snapshots("missing", [100, null, 100, 100]), ...snapshots("absent", [100, 100, 100, "absent"]),
    ...snapshots("zero", [0, 0, 0, 0]),
  ], gb, 1);
  assert.equal(missing.net, 0);
  assert.equal(missing.comparable, 1);
  assert.equal(missing.points[1].state, "missing");
  assert.equal(missing.points[2].delta, null);
  assert.equal(missing.candidate, false);
  assert.equal(absent.net, null);
  assert.equal(absent.presentAtEnd, false);
  assert.equal(absent.points[3].state, "absent");
  assert.equal(absent.streak, 0);
  assert.equal(zero.observed, 4);
  assert.equal(zero.candidate, true);
});

test("range selection includes intermediate imports and allows a zero threshold", () => {
  const filters = activityFilters({ start: "2", end: "4", gb: "0", volume: "home" }, [...batches].reverse());
  assert.deepEqual(filters.selected.map(batch => batch.id), ["2", "3", "4"]);
  assert.equal(filters.gb, 0);
  assert.equal(filters.volume, "home");
  const reversed = activityFilters({ start: "4", end: "2" }, [...batches].reverse());
  assert.deepEqual(reversed.selected.map(batch => batch.id), ["2", "3", "4"]);
  const [single] = activityRows([batches[0]], snapshots("one", [0]), 0, 1);
  assert.equal(single.net, null);
  assert.equal(single.movement, null);
  assert.equal(single.candidate, false);
});
