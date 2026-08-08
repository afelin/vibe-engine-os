export type VibeDepth = 0 | 1 | 2 | 3 | 4 | 5;

export type DepthCapabilities = {
  depth: VibeDepth;
  label: string;
  allowsPlanWrite: boolean;
  allowsCodegen: boolean;
  allowsDiskWrite: boolean;
  allowsTests: boolean;
  allowsDeploy: boolean;
  enforcesProtectedApproval: boolean;
};

const DEPTH_LABELS: Record<VibeDepth, string> = {
  0: "explain only",
  1: "plan only",
  2: "safe generated files",
  3: "tests + implementation",
  4: "deploy preview",
  5: "protected require /approve",
};

export function getVibeDepth(env: NodeJS.ProcessEnv = process.env): VibeDepth {
  const fromLabels = resolveDepthFromLabels(env.VIBE_LABELS);
  if (fromLabels !== null) return fromLabels;

  const raw = env.VIBE_DEPTH ?? "3";
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 5) {
    return parsed as VibeDepth;
  }
  return 3;
}

export function resolveDepthFromLabels(
  labelsRaw?: string,
): VibeDepth | null {
  if (!labelsRaw?.trim()) return null;

  const labels = labelsRaw
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  if (labels.includes("vibe:plan-only")) return 1;
  if (labels.includes("vibe:safe")) return 2;
  if (labels.includes("vibe:ship")) return 4;
  return null;
}

export function depthCapabilities(depth: VibeDepth): DepthCapabilities {
  return {
    depth,
    label: DEPTH_LABELS[depth],
    allowsPlanWrite: depth >= 1,
    allowsCodegen: depth >= 2,
    allowsDiskWrite: depth >= 2,
    allowsTests: depth >= 3,
    allowsDeploy: depth >= 4,
    enforcesProtectedApproval: depth >= 5,
  };
}

export function renderDepthStatus(depth: VibeDepth = getVibeDepth()): string {
  const caps = depthCapabilities(depth);
  return `**Vibe Depth:** ${depth} (${caps.label})`;
}

/**
 * Heal ladder cap implied by OS depth.
 * Depth 0–1 → L0–L1 only; L2+ requires depth ≥ 2.
 */
export function healMaxLevelForDepth(depth: VibeDepth): 0 | 1 | 2 | 3 {
  if (depth <= 1) return 1;
  return 3;
}

/** ContextPack radius dial — maps VIBE_DEPTH → hops / char budget / LLM allow. */
export type ContextPackDepthOpts = {
  maxHops: number;
  charBudget: number;
  allowLlm: boolean;
};

const CONTEXT_PACK_BY_DEPTH: Record<VibeDepth, ContextPackDepthOpts> = {
  0: { maxHops: 0, charBudget: 2_000, allowLlm: false },
  1: { maxHops: 0, charBudget: 4_000, allowLlm: false },
  2: { maxHops: 1, charBudget: 8_000, allowLlm: true },
  3: { maxHops: 1, charBudget: 16_000, allowLlm: true },
  4: { maxHops: 2, charBudget: 24_000, allowLlm: true },
  5: { maxHops: 2, charBudget: 32_000, allowLlm: true },
};

export function contextPackOptsForDepth(
  depth: VibeDepth = getVibeDepth(),
): ContextPackDepthOpts {
  return { ...CONTEXT_PACK_BY_DEPTH[depth] };
}
