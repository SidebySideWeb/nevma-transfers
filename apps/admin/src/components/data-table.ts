/** Build a table cell that carries the phone-card label required by `.table-cards`. */
export function tableCell(
  label: string,
  html: string,
  opts: { className?: string; hidePhone?: boolean } = {},
): string {
  const classes = [opts.className, opts.hidePhone ? undefined : undefined].filter(Boolean);
  const classAttr = opts.className ? ` class="${opts.className}"` : '';
  const hide = opts.hidePhone ? ' data-hide-phone' : '';
  void classes;
  return `<td${classAttr} data-label="${escapeAttr(label)}"${hide}>${html}</td>`;
}

export function cellsHaveDataLabels(
  cells: Array<{ 'data-label'?: string; dataLabel?: string }>,
): boolean {
  return cells.length > 0 && cells.every((c) => {
    const label = c['data-label'] ?? c.dataLabel;
    return typeof label === 'string' && label.trim().length > 0;
  });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
