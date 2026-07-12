import { exportCatalogJsonSchema } from "./parse.js";

const schemas = exportCatalogJsonSchema();
process.stdout.write(`${JSON.stringify(schemas, null, 2)}\n`);
