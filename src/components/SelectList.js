import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const PAGE_SIZE = 15;

const ce = React.createElement;

export default function SelectList({ items = [], title, onSelect, onBack, emptyMessage = 'No items.' }) {
  const [cursor, setCursor] = useState(0);
  const [windowStart, setWindowStart] = useState(0);

  useInput((input, key) => {
    if (items.length === 0) {
      if (input === 'b' || key.escape) onBack?.();
      return;
    }
    if (key.upArrow) {
      const next = Math.max(0, cursor - 1);
      setCursor(next);
      if (next < windowStart) setWindowStart(next);
    } else if (key.downArrow) {
      const next = Math.min(items.length - 1, cursor + 1);
      setCursor(next);
      if (next >= windowStart + PAGE_SIZE) setWindowStart(next - PAGE_SIZE + 1);
    } else if (key.return) {
      onSelect(items[cursor]);
    } else if (input === 'b' || key.escape) {
      onBack?.();
    }
  });

  const visible = items.slice(windowStart, windowStart + PAGE_SIZE);

  const rows = items.length === 0
    ? [ce(Text, { key: 'empty', color: 'gray' }, emptyMessage)]
    : visible.map((item, i) => {
        const idx = windowStart + i;
        const selected = idx === cursor;
        return ce(
          Box,
          { key: idx, flexDirection: 'column' },
          ce(
            Box,
            { key: 'row' },
            ce(Text, { color: selected ? 'cyan' : undefined }, selected ? '▶ ' : '  '),
            ce(Text, { color: selected ? 'cyan' : undefined, bold: selected }, item.label)
          ),
          item.sublabel
            ? ce(Text, { key: 'sub', color: 'gray', dimColor: true }, '    ' + item.sublabel)
            : null
        );
      });

  const counter = items.length > PAGE_SIZE
    ? ce(
        Box,
        { key: 'counter', marginTop: 1 },
        ce(Text, { color: 'gray', dimColor: true },
          `${windowStart + 1}–${Math.min(windowStart + PAGE_SIZE, items.length)} of ${items.length}`)
      )
    : null;

  const footer = ce(
    Box,
    { key: 'footer', marginTop: 1, borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
    ce(Text, { color: 'gray' },
      (items.length > 0 ? '[↑↓] navigate   [Enter] select' : '') +
      (onBack ? '   [b] back' : '')
    )
  );

  return ce(
    Box,
    { flexDirection: 'column', paddingX: 1 },
    ce(Box, { key: 'title', marginBottom: 1 }, ce(Text, { bold: true, color: 'cyan' }, title)),
    ...rows,
    counter,
    footer
  );
}
