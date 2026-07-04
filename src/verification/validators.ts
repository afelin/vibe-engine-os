import type { GeneratedFile } from "../os/events.js";

export type PolicyMode = "generated_patch" | "maintainer_change";

export type ValidatorResult = {
  name: string;
  passed: boolean;
  output: string;
};

const generatedPatchPrefixes = ["src/", "tests/", ".planning/", ".skills/"];
const maintainerPrefixes = [
  ...generatedPatchPrefixes,
  "docs/",
  "runs/",
  ".github/",
];
const protectedPaths = [
  ".github/",
  ".env",
  "package.json",
  "package-lock.json",
  "bun.lockb",
];

export function validateFilePolicy(
  mode: PolicyMode,
  files: GeneratedFile[],
): ValidatorResult {
  const allowedPrefixes =
    mode === "generated_patch" ? generatedPatchPrefixes : maintainerPrefixes;

  const invalid = files.filter(
    (file) => !allowedPrefixes.some((prefix) => file.path.startsWith(prefix)),
  );

  return {
    name: `${mode}_file_policy`,
    passed: invalid.length === 0,
    output:
      invalid.length === 0
        ? "All files are inside allowed paths"
        : `Disallowed paths: ${invalid.map((file) => file.path).join(", ")}`,
  };
}

export function validateProtectedFiles(files: GeneratedFile[]): ValidatorResult {
  const protectedFiles = files.filter((file) =>
    protectedPaths.some(
      (protectedPath) =>
        file.path === protectedPath || file.path.startsWith(protectedPath),
    ),
  );

  return {
    name: "protected_files",
    passed: protectedFiles.length === 0,
    output:
      protectedFiles.length === 0
        ? "No protected files changed"
        : `Protected paths require approval: ${protectedFiles
            .map((file) => file.path)
            .join(", ")}`,
  };
}

export function validateNoPathTraversal(files: GeneratedFile[]): ValidatorResult {
  const invalid = files.filter(
    (file) =>
      file.path.includes("..") ||
      file.path.startsWith("/") ||
      file.path.startsWith("~"),
  );

  return {
    name: "path_traversal",
    passed: invalid.length === 0,
    output:
      invalid.length === 0
        ? "No path traversal detected"
        : `Unsafe paths: ${invalid.map((file) => file.path).join(", ")}`,
  };
}

export function validateEsmImportExtensions(
  files: GeneratedFile[],
): ValidatorResult {
  const offenders = files.filter(
    (file) =>
      file.path.endsWith(".ts") &&
      /from\s+["']\.{1,2}\/[^"']*(?<!\.js)["']/.test(file.content),
  );

  return {
    name: "esm_import_extensions",
    passed: offenders.length === 0,
    output:
      offenders.length === 0
        ? "Local ESM imports use .js extensions"
        : `Missing .js import extension in: ${offenders
            .map((file) => file.path)
            .join(", ")}`,
  };
}
