import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bumpModeAllow,
  bumpModeDeny,
  bumpPreflightOk,
  loadMetrics,
  preflightCompliancePct,
  saveMetrics,
} from "./operator-metrics.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "op-metrics-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) {
    const r = roots.pop();
    if (r) rmSync(r, { recursive: true, force: true });
  }
});

describe("operator-metrics auto bumps", () => {
  it("bumpPreflightOk sets turns=1 once and increments count", () => {
    const root = tempRoot();
    const a = bumpPreflightOk(root);
    expect(a.turns_before_first_preflight).toBe(1);
    expect(a.preflight_ok_count).toBe(1);
    expect(a.session_id).toMatch(/^sess_/);
    expect(a.sessions_with_preflight).toBe(1);
    expect(a.sessions_preflight_turn1).toBe(1);

    const b = bumpPreflightOk(root);
    expect(b.preflight_ok_count).toBe(2);
    expect(b.turns_before_first_preflight).toBe(1);
    expect(b.sessions_with_preflight).toBe(1);
    expect(existsSync(join(root, ".vibe", "operator-metrics.json"))).toBe(true);
  });

  it("bumpModeDeny/Allow increment from null", () => {
    const root = tempRoot();
    bumpModeDeny(root);
    bumpModeDeny(root);
    bumpModeAllow(root);
    const m = loadMetrics(root);
    expect(m.mode_denies).toBe(2);
    expect(m.mode_allows).toBe(1);
  });

  it("preflightCompliancePct computes turn-1 ratio", () => {
    const root = tempRoot();
    saveMetrics(
      {
        turns_before_first_preflight: 1,
        mode_denies: null,
        mode_allows: null,
        time_to_first_green_pr_min: null,
        preflight_ok_count: 1,
        session_id: "sess_x",
        sessions_preflight_turn1: 4,
        sessions_with_preflight: 5,
        updated_at: null,
      },
      root,
    );
    expect(preflightCompliancePct(loadMetrics(root))).toBe(80);
  });

  it("does not overwrite existing turns on later preflights", () => {
    const root = tempRoot();
    saveMetrics(
      {
        turns_before_first_preflight: 3,
        mode_denies: null,
        mode_allows: null,
        time_to_first_green_pr_min: null,
        preflight_ok_count: 1,
        session_id: "sess_y",
        sessions_preflight_turn1: 0,
        sessions_with_preflight: 1,
        updated_at: null,
      },
      root,
    );
    const m = bumpPreflightOk(root);
    expect(m.turns_before_first_preflight).toBe(3);
    expect(m.preflight_ok_count).toBe(2);
  });
});
