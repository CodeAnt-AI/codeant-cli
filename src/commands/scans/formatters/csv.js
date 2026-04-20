const HEADERS = ['id', 'category', 'severity', 'file_path', 'line_number', 'check_id', 'check_name', 'message', 'cwe', 'cve', 'dismissed'];

function csvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export default {
  name: 'csv',
  mime: 'text/csv',
  extension: '.csv',
  render(envelope) {
    const { findings = [] } = envelope;
    const rows = [HEADERS.join(',')];
    for (const f of findings) {
      rows.push(HEADERS.map((h) => csvCell(f[h])).join(','));
    }
    return rows.join('\n');
  },
};
