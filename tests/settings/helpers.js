export { run, runAsync, expectOk, expectExit, expectOutput, REPO, ORG, TIMEOUT } from '../scans/helpers.js';

export const SKIP_ONLINE = !process.env.CODEANT_API_TOKEN;
