// Terminal ASCII table — no external dependencies

let noColor = false;
export function setNoColor(v) { noColor = v; }

const SEV_COLOR = {
  critical: '\x1b[35m', // magenta
  high:     '\x1b[31m', // red
  medium:   '\x1b[33m', // yellow
  low:      '\x1b[34m', // blue
  info:     '\x1b[37m', // white
  unknown:  '\x1b[90m', // dark gray
};
const RESET = '\x1b[0m';

function color(text, code) {
  if (noColor || !process.stdout.isTTY) return text;
  return `${code}${text}${RESET}`;
}

function pad(str, len) {
  const s = String(str ?? '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

const COLS = [
  { key: 'severity',  label: 'SEVERITY', width: 10 },
  { key: 'category',  label: 'CATEGORY', width: 17 },
  { key: 'file_path', label: 'FILE',     width: 40 },
  { key: 'line_number', label: 'LINE',   width: 6  },
  { key: 'check_id',  label: 'CHECK',    width: 20 },
  { key: 'message',   label: 'MESSAGE',  width: 60 },
];

export default {
  name: 'table',
  mime: 'text/plain',
  extension: '.txt',
  render(envelope) {
    const { findings = [], summary, errors = [] } = envelope;
    const lines = [];

    // Header
    const sep = COLS.map((c) => '-'.repeat(c.width)).join('-+-');
    const header = COLS.map((c) => pad(c.label, c.width)).join(' | ');
    lines.push(sep);
    lines.push(header);
    lines.push(sep);

    for (const f of findings) {
      const sev = f.severity;
      const cols = COLS.map((c) => {
        let val = String(f[c.key] ?? '');
        if (c.key === 'file_path' && val.length > c.width) {
          val = '…' + val.slice(-(c.width - 1));
        }
        val = pad(val, c.width);
        if (c.key === 'severity') {
          val = color(val, SEV_COLOR[sev] ?? '');
        }
        return val;
      });
      lines.push(cols.join(' | '));
    }

    lines.push(sep);
    lines.push(`Total: ${summary?.total ?? findings.length}  ` +
      Object.entries(summary?.by_severity ?? {})
        .filter(([, n]) => n > 0)
        .map(([s, n]) => color(`${s}:${n}`, SEV_COLOR[s] ?? ''))
        .join('  ')
    );

    if (errors.length > 0) {
      lines.push('');
      for (const e of errors) {
        lines.push(color(`[error] ${e.category}: ${e.error}`, '\x1b[31m'));
      }
    }

    return lines.join('\n');
  },
};
