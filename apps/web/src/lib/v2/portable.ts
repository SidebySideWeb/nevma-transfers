/** Plain text from portable text blocks. */
export function portablePlain(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b) => {
      if (!b || typeof b !== 'object') return '';
      const children = (b as { children?: { text?: string }[] }).children;
      if (!Array.isArray(children)) return '';
      return children.map((c) => c?.text ?? '').join('');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type PtSpan = { text?: string; marks?: string[] };
type PtBlock = { children?: PtSpan[] };

/** Portable text → HTML spans; `strong` marks become `<strong class="sd01f5">`. */
export function portableNotesHtml(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  return (blocks as PtBlock[]).map((block) => {
    const children = Array.isArray(block?.children) ? block.children : [];
    return children
      .map((c) => {
        const text = escapeHtml(c?.text ?? '');
        if (c?.marks?.includes('strong')) return `<strong class="sd01f5">${text}</strong>`;
        return text;
      })
      .join('');
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
