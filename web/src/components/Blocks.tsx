import { Fragment, type ReactNode } from 'react';
import type { Block } from '../../../shared/types';

/** Renders inline **bold** and `code` markers. Everything else is plain text. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={i}>
            <Inline text={part.slice(2, -2)} />
          </strong>
        ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case 'h':
      return (
        <h4 className="block-heading">
          <Inline text={block.text} />
        </h4>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Inline text={item} />
        </li>
      ));
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'table':
      return (
        <div>
          {block.caption && <div className="table-caption">{block.caption}</div>}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {block.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'quote':
      return (
        <blockquote>
          <Inline text={block.text} />
          {block.cite && <cite>{block.cite}</cite>}
        </blockquote>
      );
    case 'callout':
      return (
        <div className={`callout callout-${block.tone ?? 'info'}`}>
          <Inline text={block.text} />
        </div>
      );
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="blocks">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
