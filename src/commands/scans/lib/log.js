// stderr progress logger — respects --quiet and --no-color

let quietMode = false;
let noColorMode = false;

export function setQuiet(q) { quietMode = !!q; }
export function setNoColor(nc) { noColorMode = !!nc; }

function isTTY() { return process.stderr.isTTY === true; }

function dim(text) {
  if (noColorMode || !isTTY()) return text;
  return `\x1b[2m${text}\x1b[0m`;
}

/** Write a progress line to stderr (suppressed by --quiet). */
export function progress(msg) {
  if (quietMode) return;
  process.stderr.write(dim(`[progress] ${msg}`) + '\n');
}

/** Write a JSON error object to stderr (never suppressed). */
export function logError(obj) {
  process.stderr.write(JSON.stringify(obj) + '\n');
}
