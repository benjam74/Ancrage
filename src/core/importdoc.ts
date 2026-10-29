import { MAX_SOURCE_CHARS } from './generate';

/** A part of an imported file, sent to the generator on its own. */
export interface DocSection {
  id: string;
  file: string;
  title: string;
  text: string;
}

const baseName = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || file;

/** Obsidian notes: no YAML header, wiki links reduced to the text they show, embeds dropped. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1');
}

/** Markdown is split by level 1 and 2 headings; any other file is one block. */
export function splitDocument(fileName: string, text: string): DocSection[] {
  const file = baseName(fileName);
  if (!/\.(md|markdown)$/i.test(fileName)) {
    return text.trim() ? [{ id: `${fileName}#0`, file: fileName, title: file, text: text.trim() }] : [];
  }
  const raw: { title: string; lines: string[] }[] = [{ title: file, lines: [] }];
  let fence = false;
  for (const line of cleanMarkdown(text).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) raw.push({ title: h[2], lines: [] });
    else raw[raw.length - 1].lines.push(line);
  }
  return raw
    .map((s, i) => ({ id: `${fileName}#${i}`, file: fileName, title: s.title, text: s.lines.join('\n').trim() }))
    .filter((s) => s.text);
}

/** Sections over `max` characters become numbered parts, cut on paragraph ends when possible. */
export function splitLong(sections: DocSection[], max = MAX_SOURCE_CHARS): DocSection[] {
  return sections.flatMap((s) => {
    if (s.text.length <= max) return [s];
    const chunks: string[] = [];
    let current = '';
    for (const para of s.text.split(/\n{2,}/)) {
      const pieces = para.length > max ? para.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g'))! : [para];
      for (const piece of pieces) {
        if (current && current.length + 2 + piece.length > max) {
          chunks.push(current);
          current = piece;
        } else current = current ? `${current}\n\n${piece}` : piece;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((text, i) => ({ id: `${s.id}.${i}`, file: s.file, title: `${s.title} (${i + 1}/${chunks.length})`, text }));
  });
}
