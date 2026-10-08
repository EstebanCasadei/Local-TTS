import { chunkText } from "../lib/chunker";

export const normalizeSelection = (text: string): string => text.replace(/\s+/gu, " ").trim();

interface TextPosition {
  node: Text;
  offset: number;
}
interface MappedText {
  text: string;
  starts: TextPosition[];
  ends: TextPosition[];
}

function visibleBlock(node: Text): Element | null {
  let block: Element | null = null;
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (element.matches("script, style, noscript, input, textarea")) return null;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return null;
    if (!block && style.display && !["inline", "contents"].includes(style.display)) block = element;
  }
  return block ?? node.parentElement;
}

/** Keep DOM offsets, including virtual spaces at rendered block boundaries. */
function mapRange(source: Range): MappedText {
  const starts: TextPosition[] = [];
  const ends: TextPosition[] = [];
  let text = "";
  const root = source.commonAncestorContainer;
  const nodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
  else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (source.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode as Text);
    }
  }
  let previousBlock: Element | null = null;
  for (const node of nodes) {
    const block = visibleBlock(node);
    if (!block) continue;
    const start = node === source.startContainer ? source.startOffset : 0;
    const end = node === source.endContainer ? source.endOffset : node.length;
    if (start === end) continue;
    let lineBreak = false;
    if (text && previousBlock === block && !text.endsWith(" ")) {
      const gap = document.createRange();
      const previousEnd = ends[ends.length - 1];
      gap.setStart(previousEnd.node, previousEnd.offset);
      gap.setEnd(node, start);
      lineBreak = Boolean(gap.cloneContents().querySelector("br"));
    }
    if (text && (previousBlock !== block || lineBreak) && !text.endsWith(" ")) {
      text += " ";
      starts.push(ends[ends.length - 1]);
      ends.push({ node, offset: start });
    }
    previousBlock = block;
    for (let offset = start; offset < end; offset++) {
      const char = /\s/u.test(node.data[offset]) ? " " : node.data[offset];
      if (char === " " && (!text || text.endsWith(" "))) {
        if (text.endsWith(" ")) ends[ends.length - 1] = { node, offset: offset + 1 };
        continue;
      }
      text += char;
      starts.push({ node, offset });
      ends.push({ node, offset: offset + 1 });
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}

export function rangeText(range: Range): string {
  return mapRange(range).text;
}

export function rangesForChunks(source: Range, chunks: string[]): (Range | null)[] {
  const mapped = mapRange(source);
  let cursor = 0;
  return chunks.map((chunk) => {
    const normalized = normalizeSelection(chunk);
    const start = mapped.text.indexOf(normalized, cursor);
    if (!normalized || start < 0) return null;
    const end = start + normalized.length - 1;
    cursor = end + 1;
    const range = document.createRange();
    range.setStart(mapped.starts[start].node, mapped.starts[start].offset);
    range.setEnd(mapped.ends[end].node, mapped.ends[end].offset);
    return range;
  });
}

export function captureSelection(
  expectedText: string,
): { text: string; ranges: (Range | null)[] } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const element =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  if (element?.closest("input, textarea, [contenteditable], script, style")) return null;
  if (normalizeSelection(selection.toString()) !== normalizeSelection(expectedText)) return null;
  const text = rangeText(range);
  return { text, ranges: rangesForChunks(range, chunkText(text)) };
}
