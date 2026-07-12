import { resolveReleaseGatePatch } from "./resolve.js";

function parseCliArgs(argv: string[]): { title: string; body: string } {
  let title = "";
  let body = "";

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--title") {
      title = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--body") {
      body = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (!arg.startsWith("-") && !title) {
      title = arg;
      body = argv[index + 1] ?? "";
      break;
    }
  }

  return { title, body };
}

const { title, body } = parseCliArgs(process.argv);

console.log(JSON.stringify(resolveReleaseGatePatch(title, body)));
