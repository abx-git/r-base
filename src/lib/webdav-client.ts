import { basicAuthHeader, getWebDavSettings } from "./credentials";
import { formatWebDavError } from "./errors";

function normalizeBase(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  return t;
}

function joinUrl(base: string, path: string): string {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${normalizeBase(base)}/${enc.replace(/^\/+/, "")}`;
}

export async function propfind(relativeBase: string, depth: "0" | "1" = "1"): Promise<Response> {
  const settings = getWebDavSettings();
  const url = joinUrl(settings.baseUrl, relativeBase.replace(/^\/+/, ""));
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getetag/>
  </d:prop>
</d:propfind>`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: basicAuthHeader(),
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
    });
  } catch {
    throw new Error(formatWebDavError(0, "PROPFIND"));
  }
  if (!res.ok) throw new Error(formatWebDavError(res.status, "PROPFIND"));
  return res;
}

export async function mkcol(path: string): Promise<void> {
  const settings = getWebDavSettings();
  const url = joinUrl(settings.baseUrl, path.replace(/^\/+/, ""));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "MKCOL",
      headers: { Authorization: basicAuthHeader() },
    });
  } catch {
    throw new Error(formatWebDavError(0, "MKCOL"));
  }
  if (res.status === 405 || res.status === 201 || res.ok) return;
  throw new Error(formatWebDavError(res.status, "MKCOL"));
}

export async function putBlob(path: string, data: Blob): Promise<void> {
  const settings = getWebDavSettings();
  const url = joinUrl(settings.baseUrl, path.replace(/^\/+/, ""));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": data.type || "application/octet-stream",
      },
      body: data,
    });
  } catch {
    throw new Error(formatWebDavError(0, "PUT"));
  }
  if (!res.ok) throw new Error(formatWebDavError(res.status, `PUT ${path}`));
}

export async function getBlob(path: string): Promise<Blob> {
  const settings = getWebDavSettings();
  const url = joinUrl(settings.baseUrl, path.replace(/^\/+/, ""));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: basicAuthHeader() },
    });
  } catch {
    throw new Error(formatWebDavError(0, "GET"));
  }
  if (!res.ok) throw new Error(formatWebDavError(res.status, `GET ${path}`));
  return await res.blob();
}