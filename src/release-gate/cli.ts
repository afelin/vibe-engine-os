import { resolveReleaseGatePatch } from "./resolve.js";

const title = process.argv[2] ?? "";
const body = process.argv[3] ?? "";

console.log(JSON.stringify(resolveReleaseGatePatch(title, body)));
