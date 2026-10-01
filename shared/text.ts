import type { Block } from './types';

/** Plain-text rendering of content blocks, for prompts and tests. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const strip = (s: string) => s.replace(/\*\*/g, '');
      switch (b.type) {
        case 'list':
          return b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '-'} ${strip(item)}`).join('\n');
        case 'table':
          return [
            b.caption ? strip(b.caption) : '',
            `| ${b.columns.join(' | ')} |`,
            ...b.rows.map((row) => `| ${row.map(strip).join(' | ')} |`),
          ]
            .filter(Boolean)
            .join('\n');
        case 'quote':
          return `> ${strip(b.text)}${b.cite ? ` (${b.cite})` : ''}`;
        case 'h':
          return `### ${strip(b.text)}`;
        default:
          return strip(b.text);
      }
    })
    .join('\n\n');
}
