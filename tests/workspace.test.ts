import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceHref, workspaceLocation } from "../lib/workspace";

test("old workbook links and new design links resolve to the same private workbook", () => {
  for (let block = 1; block <= 6; block++) {
    const expected = { view: "workbook", workspace: "design", block };
    assert.deepEqual(workspaceLocation(`#workbook/${block}`), expected);
    assert.deepEqual(workspaceLocation(`#design/workbook/${block}`), expected);
    assert.equal(
      workspaceHref("workbook", "math", block),
      `/#design/workbook/${block}`,
    );
  }
  assert.equal(workspaceLocation("#design/workbook/99").block, 1);
});

test("workspace routing preserves design settings and keeps subject pages in mathematics", () => {
  assert.deepEqual(workspaceLocation("#design/settings"), {
    view: "settings",
    workspace: "design",
    block: 1,
  });
  assert.equal(workspaceHref("settings", "design"), "/#design/settings");
  assert.equal(workspaceHref("overview", "design"), "/#design/overview");
  assert.equal(workspaceHref("assignments", "design"), "/#assignments");
  assert.deepEqual(workspaceLocation("#assignments"), {
    view: "assignments",
    workspace: "math",
    block: 1,
  });
  assert.equal(workspaceLocation("#design/assignments").view, "overview");
  assert.deepEqual(workspaceLocation(""), {
    view: "overview",
    workspace: "math",
    block: 1,
  });
});
