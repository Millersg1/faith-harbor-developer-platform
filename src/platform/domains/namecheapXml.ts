/**
 * A rigorously bounded, purpose-specific tokenizer for the exact Namecheap
 * response subset — NOT a general XML parser and NOT regex-scraping.
 *
 * SECURITY / SAFETY contract:
 *  - DOCTYPE, ENTITY, and any `<!` markup declaration or CDATA section are
 *    rejected BEFORE parsing (no DTD, no entity declarations).
 *  - No external entity resolution, no network, no filesystem — the tokenizer
 *    only reads the in-memory string. Only the five predefined XML entities and
 *    bounded numeric character references are decoded; any other `&name;` is
 *    rejected (fail closed), so entity-expansion / XXE is structurally
 *    impossible.
 *  - Hard limits on total bytes, element count, attributes-per-element,
 *    attribute length, text length, and nesting depth.
 *  - Duplicate attribute names on an element are rejected (defends against
 *    security-sensitive attribute smuggling).
 *  - Element namespaces are handled: a leading `xmlns`/prefix is tolerated and
 *    the local name is what callers match on.
 *  - Escaped text and attribute values are decoded correctly.
 *  - Malformed / truncated / oversized / unexpected input throws
 *    {@link NamecheapParseError}; callers turn that into `ambiguous_unknown`
 *    for mutating requests — never a "definitive failure".
 *
 * Raw response bodies are NEVER logged or audited; only bounded, sanitized
 * fields extracted here are surfaced.
 */

const LIMITS = {
  maxBytes: 1_000_000,
  maxElements: 5_000,
  maxAttrsPerEl: 64,
  maxAttrLen: 8_192,
  maxTextLen: 16_384,
  maxDepth: 32,
};

export interface XmlNode {
  /** Local element name (namespace prefix stripped). */
  name: string;
  attrs: Map<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content, decoded + bounded. */
  text: string;
}

export class NamecheapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamecheapParseError";
  }
}

/** A sanitized API-level error (envelope Status="ERROR"). */
export class NamecheapApiError extends Error {
  constructor(
    message: string,
    readonly number?: string,
  ) {
    super(message);
    this.name = "NamecheapApiError";
  }
}

/** Transport failure talking to the provider (carries a code for classification). */
export class NamecheapTransportError extends Error {
  constructor(readonly code?: string) {
    super("Namecheap transport error.");
    this.name = "NamecheapTransportError";
  }
}

/** Non-2xx HTTP from the provider (ambiguous for a mutating request). */
export class NamecheapHttpError extends Error {
  constructor(readonly status: number) {
    super(`Namecheap HTTP ${status}.`);
    this.name = "NamecheapHttpError";
  }
}

// ---- parser ---------------------------------------------------------------

export function parseNamecheap(body: string): XmlNode {
  if (typeof body !== "string") {
    throw new NamecheapParseError("Non-string response body.");
  }
  if (body.length > LIMITS.maxBytes) {
    throw new NamecheapParseError("Response body too large.");
  }
  // Reject dangerous markup declarations / CDATA / comments up front.
  if (/<!\s*DOCTYPE/i.test(body) || /<!\s*ENTITY/i.test(body)) {
    throw new NamecheapParseError("DOCTYPE/ENTITY declarations are forbidden.");
  }
  if (body.includes("<![CDATA[") || body.includes("<!")) {
    throw new NamecheapParseError("Markup declarations are forbidden.");
  }

  let i = 0;
  const n = body.length;
  let elementCount = 0;

  // Skip a single leading XML declaration <?xml ... ?> and any whitespace.
  const declMatch = /^\s*<\?xml[^>]*\?>/i.exec(body);
  if (declMatch) i = declMatch[0].length;
  // Reject any other processing instruction.
  const rest = body.slice(i);
  if (/<\?/.test(rest)) {
    throw new NamecheapParseError("Processing instructions are forbidden.");
  }

  const root: XmlNode = { name: "#root", attrs: new Map(), children: [], text: "" };
  const stack: XmlNode[] = [root];

  while (i < n) {
    const lt = body.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) {
      // Text between tags belongs to the current open element.
      const raw = body.slice(i, lt);
      if (raw.trim().length > 0) {
        const cur = stack[stack.length - 1];
        cur.text = bound(
          (cur.text + decodeEntities(raw)).slice(0, LIMITS.maxTextLen),
          LIMITS.maxTextLen,
        );
      }
    }
    const gt = body.indexOf(">", lt + 1);
    if (gt < 0) {
      throw new NamecheapParseError("Truncated tag (no '>').");
    }
    const tag = body.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (tag.startsWith("/")) {
      // Closing tag.
      const name = localName(tag.slice(1).trim());
      const top = stack[stack.length - 1];
      if (stack.length <= 1 || localName(top.name) !== name) {
        throw new NamecheapParseError("Mismatched closing tag.");
      }
      stack.pop();
      continue;
    }

    const selfClosing = tag.endsWith("/");
    const inner = selfClosing ? tag.slice(0, -1).trim() : tag;
    const node = parseElement(inner);
    if (++elementCount > LIMITS.maxElements) {
      throw new NamecheapParseError("Too many elements.");
    }
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
      if (stack.length - 1 > LIMITS.maxDepth) {
        throw new NamecheapParseError("Nesting too deep.");
      }
    }
  }

  if (stack.length !== 1) {
    throw new NamecheapParseError("Unclosed element(s).");
  }
  // The single top-level child is the response root (e.g. ApiResponse).
  const top = root.children[0];
  if (!top) {
    throw new NamecheapParseError("No root element.");
  }
  return top;
}

function parseElement(inner: string): XmlNode {
  // First token is the element name; the remainder are attributes.
  const m = /^([^\s/>]+)/.exec(inner);
  if (!m) {
    throw new NamecheapParseError("Malformed element.");
  }
  const name = localName(m[1]);
  const attrs = new Map<string, string>();
  let rest = inner.slice(m[1].length);
  const attrRe = /\s+([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let a: RegExpExecArray | null;
  let count = 0;
  let lastIndex = 0;
  while ((a = attrRe.exec(rest)) !== null) {
    if (++count > LIMITS.maxAttrsPerEl) {
      throw new NamecheapParseError("Too many attributes.");
    }
    const key = localName(a[1]);
    const rawVal = a[3] ?? a[4] ?? "";
    if (rawVal.length > LIMITS.maxAttrLen) {
      throw new NamecheapParseError("Attribute too long.");
    }
    // Namespace declarations are tolerated but not exposed as data.
    if (a[1] === "xmlns" || a[1].startsWith("xmlns:")) {
      lastIndex = attrRe.lastIndex;
      continue;
    }
    if (attrs.has(key)) {
      throw new NamecheapParseError(`Duplicate attribute "${key}".`);
    }
    attrs.set(key, decodeEntities(rawVal));
    lastIndex = attrRe.lastIndex;
  }
  // Anything left over that isn't whitespace means malformed attributes.
  if (rest.slice(lastIndex).trim().length > 0) {
    throw new NamecheapParseError("Malformed attributes.");
  }
  return { name, attrs, children: [], text: "" };
}

/** Strips a namespace prefix ("nc:Foo" -> "Foo"). */
function localName(qname: string): string {
  const c = qname.indexOf(":");
  return c >= 0 ? qname.slice(c + 1) : qname;
}

/** Decodes ONLY the five predefined entities + bounded numeric refs; any other
 *  entity is rejected (no custom/expanded entities are ever honored). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    switch (body) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        if (body[0] === "#") {
          const code =
            body[1] === "x" || body[1] === "X"
              ? parseInt(body.slice(2), 16)
              : parseInt(body.slice(1), 10);
          if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
            return String.fromCodePoint(code);
          }
        }
        throw new NamecheapParseError(`Unknown/forbidden entity "&${body};".`);
    }
  });
}

function bound(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// ---- traversal + extraction ----------------------------------------------

/** All descendants (and self) whose local name matches, depth-first. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (nd: XmlNode) => {
    if (nd.name === name) out.push(nd);
    for (const c of nd.children) walk(c);
  };
  walk(node);
  return out;
}

export function findFirst(node: XmlNode, name: string): XmlNode | undefined {
  return findAll(node, name)[0];
}

/** Envelope status ("OK" | "ERROR") from the ApiResponse root. */
export function envelopeStatus(root: XmlNode): string {
  return (root.attrs.get("Status") ?? "").toUpperCase();
}

export function extractApiError(root: XmlNode): NamecheapApiError {
  const err = findFirst(root, "Error");
  return new NamecheapApiError(
    err ? sanitizeText(err.text) : "Namecheap API error.",
    err?.attrs.get("Number"),
  );
}

// ---- money (no floating point) -------------------------------------------

/** "10.98" -> 1098 minor units; string arithmetic, half-up on sub-cent. */
export function decimalToMinor(s: string): number {
  const str = String(s).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(str)) {
    throw new NamecheapParseError(`Invalid money value "${s}".`);
  }
  const [whole, frac = ""] = str.split(".");
  const cents = (frac + "00").slice(0, 2);
  let minor = Number(whole) * 100 + Number(cents);
  if (frac.length > 2 && Number(frac[2] ?? "0") >= 5) {
    minor += 1;
  }
  return minor;
}

// ---- sanitation + redaction ----------------------------------------------

export function sanitizeText(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, 200);
}

/** Redacts credentials from any diagnostic string before it is logged/audited. */
export function redactSecrets(s: string): string {
  let out = String(s);
  out = out.replace(
    /(https?:\/\/[^?\s]*xml\.response)\?[^\s"']*/gi,
    "$1?[REDACTED]",
  );
  out = out.replace(
    /\b(ApiKey|ApiUser|UserName|ClientIp|Password|Token|EPPCode)=([^&\s"']*)/gi,
    "$1=[REDACTED]",
  );
  return out;
}

/** Classifies a transport error into the honest outcome category. */
export function classifyTransportError(
  err: unknown,
): "transport_failure_pre_acceptance" | "ambiguous_unknown" {
  const code =
    (err as NamecheapTransportError | { code?: string } | undefined)?.code ?? "";
  const msg = ((err as Error | undefined)?.message ?? "").toLowerCase();
  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    /getaddrinfo|dns|refused|tls|certificate|self signed/.test(msg)
  ) {
    return "transport_failure_pre_acceptance";
  }
  // Reset/timeout/aborted mid-flight or unclassified -> ambiguous, never retried.
  return "ambiguous_unknown";
}
