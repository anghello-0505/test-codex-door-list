function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  // Quoting alone does not prevent spreadsheet formula execution. Check past
  // whitespace/control prefixes without removing the original cell content.
  const safe = /^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)
    ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(rows: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser start consuming the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
