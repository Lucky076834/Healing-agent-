export interface SanitizeResult {
  sanitizedHtml: string;
  rawBytes: number;
  sanitizedBytes: number;
  rawTokens: number;
  sanitizedTokens: number;
  tokenReductionPct: number;
  nodeCount: number;
}

const KEEP_ATTRS = new Set([
  'id',
  'name',
  'type',
  'role',
  'placeholder',
  'aria-label',
  'data-qa-action',
  'data-entity',
  'data-field',
  'for',
  'value',
]);

const STRIP_TAGS = new Set(['svg', 'path', 'style', 'script', 'noscript', 'meta', 'link']);

export function estimateTokens(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  // Approximate BPE subword density (~3.6 chars/token for HTML markup)
  return Math.max(1, Math.ceil(cleaned.length / 3.6));
}

export function sanitizeDomHtml(rawHtml: string): SanitizeResult {
  const rawBytes = rawHtml.length;
  const rawTokens = estimateTokens(rawHtml);

  // 1. Strip HTML comments and decorative SVG/style/script blocks
  let cleaned = rawHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(svg|style|script|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 2. Collapse whitespace between tags and normalize spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 3. Filter attributes on every opening tag to semantic-only whitelist
  let nodeCount = 0;
  const sanitizedTagStream = cleaned.replace(
    /<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g,
    (_match, slash: string, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (STRIP_TAGS.has(tag)) return '';
      if (slash === '/') {
        return `</${tag}>`;
      }
      nodeCount += 1;

      const keptAttrs: string[] = [];
      const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        if (KEEP_ATTRS.has(attrName) || attrName.startsWith('data-qa-') || attrName.startsWith('aria-')) {
          keptAttrs.push(`${attrName}="${attrVal}"`);
        }
      }

      const selfClosing = rawAttrs.trim().endsWith('/') ? ' /' : '';
      return keptAttrs.length > 0
        ? `<${tag} ${keptAttrs.join(' ')}${selfClosing}>`
        : `<${tag}${selfClosing}>`;
    },
  );

  // 4. Pretty-print compact indented tree for inspector legibility
  const formattedLines: string[] = [];
  const tokens = sanitizedTagStream.match(/<[^>]+>|[^<]+/g) ?? [];
  let depth = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].trim();
    if (!token) continue;

    if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      formattedLines.push(`${'  '.repeat(depth)}${token}`);
    } else if (token.startsWith('<')) {
      const isVoid =
        token.endsWith('/>') ||
        /^<(input|br|hr|img|meta|link)\b/i.test(token);
      const nextToken = tokens[i + 1]?.trim();
      const closeToken = tokens[i + 2]?.trim();

      // Inline short text + closing tag onto single line for readability
      if (
        !isVoid &&
        nextToken &&
        !nextToken.startsWith('<') &&
        closeToken &&
        closeToken.startsWith('</')
      ) {
        formattedLines.push(`${'  '.repeat(depth)}${token}${nextToken}${closeToken}`);
        i += 2;
      } else {
        formattedLines.push(`${'  '.repeat(depth)}${token}`);
        if (!isVoid) {
          depth += 1;
        }
      }
    } else {
      formattedLines.push(`${'  '.repeat(depth)}${token}`);
    }
  }

  const sanitizedHtml = formattedLines.join('\n').trim();
  const sanitizedBytes = sanitizedHtml.length;
  const sanitizedTokens = estimateTokens(sanitizedHtml);
  const tokenReductionPct =
    rawTokens > 0
      ? Number(Math.max(0, ((rawTokens - sanitizedTokens) / rawTokens) * 100).toFixed(1))
      : 0;

  return {
    sanitizedHtml,
    rawBytes,
    sanitizedBytes,
    rawTokens,
    sanitizedTokens,
    tokenReductionPct,
    nodeCount,
  };
}
