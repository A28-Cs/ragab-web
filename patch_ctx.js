const fs = require('fs');
const file = 'packages/server/src/http/context.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/export async function buildContext\(req: RequestLike\): Promise<RequestContext> \{/, `export async function buildContext(req: RequestLike): Promise<RequestContext> {
  console.log("--> buildContext HIT!");`);
fs.writeFileSync(file, code, 'utf8');
