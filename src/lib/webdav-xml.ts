export type DavResource = {
  href: string;
  collection: boolean;
  lastModified: string | null;
  contentLength: number | null;
  etag: string | null;
};

function localName(el: Element): string {
  return el.localName || el.tagName.split(":").pop() || el.tagName;
}

function childElements(el: Element): Element[] {
  return [...el.children];
}

function findFirstByLocalName(root: Element, name: string): Element | null {
  if (localName(root) === name) return root;
  for (const child of childElements(root)) {
    const hit = findFirstByLocalName(child, name);
    if (hit) return hit;
  }
  return null;
}

function textOf(root: Element, name: string): string | null {
  const el = findFirstByLocalName(root, name);
  if (!el) return null;
  const t = el.textContent?.trim();
  return t || null;
}

export function parsePropfindResponse(xml: string, baseUrl: string): DavResource[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error("WebDAV-Antwort konnte nicht gelesen werden.");
  const responses = [...doc.getElementsByTagNameNS("*", "response")];
  const out: DavResource[] = [];
  for (const response of responses) {
    const hrefEl = findFirstByLocalName(response, "href");
    const hrefRaw = hrefEl?.textContent?.trim() || "";
    if (!hrefRaw) continue;
    let href = hrefRaw;
    try {
      href = new URL(hrefRaw, baseUrl).pathname;
    } catch {
      /* keep raw */
    }
    const propstat = findFirstByLocalName(response, "propstat");
    const status = findFirstByLocalName(propstat ?? response, "status")?.textContent || "";
    if (status && !status.includes("200")) continue;
    const prop = findFirstByLocalName(response, "prop");
    if (!prop) continue;
    const resourcetype = findFirstByLocalName(prop, "resourcetype");
    const collection = Boolean(resourcetype && findFirstByLocalName(resourcetype, "collection"));
    const lm = textOf(prop, "getlastmodified");
    const lenRaw = textOf(prop, "getcontentlength");
    const len = lenRaw != null ? Number(lenRaw) : null;
    const etag = textOf(prop, "getetag");
    out.push({
      href,
      collection,
      lastModified: lm,
      contentLength: Number.isFinite(len) ? len : null,
      etag,
    });
  }
  return out;
}