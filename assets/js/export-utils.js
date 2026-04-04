// NotifyPro — export-utils.js
// Shared CSV, Excel (TSV), and PDF export helpers.
// No external dependencies — uses native browser APIs only.

/**
 * Convert array of objects to CSV string.
 */
function toCSV(rows, columns) {
  const esc = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map(c => esc(c.label)).join(',');
  const body   = rows.map(r => columns.map(c => esc(r[c.key])).join(',')).join('\n');
  return header + '\n' + body;
}

/**
 * Trigger a file download in the browser.
 */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export rows as CSV.
 */
export function exportCSV(rows, columns, filename = 'export.csv') {
  downloadBlob(toCSV(rows, columns), filename, 'text/csv;charset=utf-8;');
}

/**
 * Export rows as Excel-compatible TSV (opens in Excel/Sheets).
 */
export function exportExcel(rows, columns, filename = 'export.xls') {
  const esc = v => String(v ?? '').replace(/\t/g, ' ');
  const header = columns.map(c => esc(c.label)).join('\t');
  const body   = rows.map(r => columns.map(c => esc(r[c.key])).join('\t')).join('\n');
  downloadBlob(header + '\n' + body, filename, 'application/vnd.ms-excel;charset=utf-8;');
}

/**
 * Export rows as a printable PDF via browser print dialog.
 * Opens a styled print window — no library needed.
 */
export function exportPDF(rows, columns, title = 'NotifyPro Export') {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const thead = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const tbody = rows.map(r =>
    `<tr>${columns.map(c => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
    h2 { font-size: 15px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 10px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #0a0f1e; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
  </style></head><body>
  <h2>${esc(title)}</h2>
  <div class="meta">Generated on ${new Date().toLocaleString('en-NG')} · NotifyPro</div>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}
