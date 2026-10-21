import { createDecipheriv, createHash } from "node:crypto";
import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash as hashFactory } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const port = Number(process.env.PORT || 8080);
const secret = process.env.TRANSFER_SERVICE_SECRET || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "";
const maxUpload = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 ** 3);
const partSize = 8 * 1024 * 1024;
const minPartSize = 4 * 1024 * 1024;
const usedNonces = new Map();

function json(response, status, value, origin) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin && origin === allowedOrigin) { headers["access-control-allow-origin"] = origin; headers["access-control-allow-headers"] = "authorization,content-type"; headers["access-control-allow-methods"] = "POST,OPTIONS"; headers["vary"] = "Origin"; }
  response.writeHead(status, headers); response.end(JSON.stringify(value));
}

function openTicket(token) {
  if (secret.length < 32) throw new Error("Transfer service secret is not configured.");
  const [version, iv, tag, ciphertext] = token.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid upload ticket.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

function validateTicket(ticket) {
  if (!ticket || typeof ticket !== "object" || typeof ticket.user_id !== "string" || typeof ticket.nonce !== "string") throw new Error("Invalid upload ticket.");
  if (!Number.isFinite(ticket.expires_at) || ticket.expires_at <= Date.now()) throw new Error("Upload ticket expired. Start the upload again.");
  if (!Number.isInteger(ticket.file_size) || ticket.file_size < 1 || ticket.file_size > maxUpload) throw new Error("File size is outside this transfer service's limit.");
  if (typeof ticket.file_name !== "string" || /[\\/\u0000-\u001f]/.test(ticket.file_name) || ticket.file_name === "." || ticket.file_name === "..") throw new Error("Invalid file name.");
  if (typeof ticket.root_path !== "string" || typeof ticket.file_path !== "string" || !(ticket.file_path.startsWith(`${ticket.root_path}/`)) || ticket.file_path.includes("..") || ticket.file_path.includes("\\")) throw new Error("File path is outside the assigned RuzBox folder.");
  if (ticket.file_path.split("/").at(-1) !== ticket.file_name) throw new Error("File name does not match the authorized path.");
  if (!["upload", "download", "content"].includes(ticket.operation)) throw new Error("Invalid upload ticket operation.");
  if (ticket.operation !== "upload" && (typeof ticket.fs_id !== "string" || !/^\d{1,24}$/.test(ticket.fs_id))) throw new Error("Invalid file identifier.");
  for (const field of ["access_token", "api_domain", "upload_domain"]) if (typeof ticket[field] !== "string" || !ticket[field]) throw new Error("The upload ticket is incomplete.");
  for (const field of ["api_domain", "upload_domain"]) { const url = new URL(ticket[field]); if (url.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*terabox\.com$/i.test(url.hostname)) throw new Error("The ticket contains an invalid TeraBox domain."); }
}

async function teraboxJson(url, init) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error("TeraBox did not return a valid response.");
  if (typeof result.errno === "number" && result.errno !== 0) throw new Error(result.show_msg || `TeraBox returned error ${result.errno}.`);
  return result;
}

function appApiUrl(ticket, endpoint, params = {}) {
  const url = new URL(`/openapi/api/${endpoint}`, ticket.api_domain);
  url.searchParams.set("access_tokens", ticket.access_token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function uploadFile(request, response, ticket, origin) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "ruzbox-transfer-"));
  const tempPath = join(tempDirectory, "upload.bin");
  let received = 0;
  const limiter = new Transform({ transform(chunk, encoding, callback) { received += chunk.length; if (received > ticket.file_size || received > maxUpload) callback(new Error("Received more bytes than authorized.")); else callback(null, chunk); } });
  try {
    await pipeline(request, limiter, createWriteStream(tempPath, { flags: "wx" }));
    if (received !== ticket.file_size) throw new Error("Received file size does not match the upload ticket.");
    const file = await open(tempPath, "r");
    try {
      const blockList = [];
      let offset = 0;
      while (offset < received) {
        let length = Math.min(partSize, received - offset);
        if (received - (offset + length) > 0 && received - (offset + length) <= minPartSize) length = received - offset;
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await file.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new Error("Could not read a complete upload part.");
        blockList.push(hashFactory("md5").update(buffer).digest("hex"));
        offset += length;
      }
      const blockJson = JSON.stringify(blockList);
      const preForm = new FormData(); preForm.set("path", ticket.file_path); preForm.set("autoinit", "1"); preForm.set("block_list", blockJson);
      const pre = await teraboxJson(appApiUrl(ticket, "precreate"), { method: "POST", body: preForm });
      const uploadId = pre.uploadid ?? pre.data?.uploadid;
      if (typeof uploadId !== "string" || !uploadId) throw new Error("TeraBox did not return an upload ID.");
      offset = 0;
      for (let partseq = 0; partseq < blockList.length; partseq++) {
        let length = Math.min(partSize, received - offset);
        if (received - (offset + length) > 0 && received - (offset + length) <= minPartSize) length = received - offset;
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await file.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new Error("Could not read a complete upload part.");
        const uploadUrl = new URL("/rest/2.0/pcs/superfile2", ticket.upload_domain);
        for (const [key, value] of Object.entries({ method: "upload", app_id: "250528", path: ticket.file_path, uploadid: uploadId, partseq: String(partseq), access_tokens: ticket.access_token })) uploadUrl.searchParams.set(key, value);
        const part = new FormData(); part.set("file", new Blob([buffer], { type: "application/octet-stream" }), ticket.file_name);
        await teraboxJson(uploadUrl, { method: "POST", body: part });
        offset += length;
      }
      const createForm = new FormData(); createForm.set("path", ticket.file_path); createForm.set("size", String(received)); createForm.set("uploadid", uploadId); createForm.set("block_list", blockJson); createForm.set("rtype", "1");
      const created = await teraboxJson(appApiUrl(ticket, "create"), { method: "POST", body: createForm });
      const item = created.fs_id ? created : created.data;
      if (!item?.fs_id) throw new Error("TeraBox did not confirm file creation.");
      json(response, 200, { uploaded: true, fs_id: String(item.fs_id), path: item.path || ticket.file_path, name: item.server_filename || ticket.file_name, size: Number(item.size || received) }, origin);
    } finally { await file.close(); }
  } catch (error) {
    if (!response.headersSent) json(response, 400, { error: error instanceof Error ? error.message : "Streaming upload failed." }, origin);
    else response.destroy();
  } finally { await rm(tempDirectory, { recursive: true, force: true }).catch(() => {}); }
}

async function streamFile(response, ticket, origin, range) {
  try {
    const result = await teraboxJson(appApiUrl(ticket, "download", { fidlist: JSON.stringify([ticket.fs_id]), type: "dlink" }), { method: "GET" });
    const links = result.dlink ?? result.data?.dlink;
    const link = Array.isArray(links) ? links.find(item => String(item.fs_id) === ticket.fs_id)?.dlink : undefined;
    if (typeof link !== "string" || !link) throw new Error("TeraBox did not provide a download link.");
    const upstreamUrl = new URL(link);
    if (upstreamUrl.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*terabox\.com$/i.test(upstreamUrl.hostname)) throw new Error("TeraBox returned an unexpected download domain.");
    upstreamUrl.searchParams.set("access_tokens", ticket.access_token);
    const upstream = await fetch(upstreamUrl, { headers: range ? { range } : undefined, cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok && upstream.status !== 206) throw new Error("TeraBox could not stream this file.");
    const disposition = ticket.operation === "download" ? "attachment" : "inline";
    const safeName = ticket.file_name.replace(/[\r\n\0]/g, "_");
    const headers = {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length") } : {}),
      ...(upstream.headers.get("content-range") ? { "content-range": upstream.headers.get("content-range") } : {}),
      ...(upstream.headers.get("accept-ranges") ? { "accept-ranges": upstream.headers.get("accept-ranges") } : {}),
      ...(origin === allowedOrigin ? { "access-control-allow-origin": origin, "access-control-expose-headers": "Content-Length,Content-Range,Accept-Ranges,Content-Disposition", vary: "Origin" } : {}),
    };
    response.writeHead(upstream.status, headers);
    if (!upstream.body) return response.end();
    await pipeline(Readable.fromWeb(upstream.body), response);
  } catch (error) {
    if (!response.headersSent) json(response, 502, { error: error instanceof Error ? error.message : "Could not stream this file." }, origin);
    else response.destroy();
  }
}

if (secret.length < 32 || !allowedOrigin) {
  console.error("Set TRANSFER_SERVICE_SECRET (32+ characters) and ALLOWED_ORIGIN before starting the RuzBox transfer service.");
  process.exit(1);
}

createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (request.method === "OPTIONS") {
    if (origin !== allowedOrigin) return json(response, 403, { error: "Origin is not allowed." }, origin);
    response.writeHead(204, { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "POST,OPTIONS", "access-control-max-age": "600", vary: "Origin" });
    return response.end();
  }
  if (request.url === "/healthz" && request.method === "GET") return json(response, 200, { ok: true }, origin);
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const isUpload = requestUrl.pathname === "/upload" && request.method === "POST";
  const isDownload = ["/download", "/content"].includes(requestUrl.pathname) && request.method === "GET";
  if (!isUpload && !isDownload) return json(response, 404, { error: "Not found." }, origin);
  if (origin && origin !== allowedOrigin) return json(response, 403, { error: "Origin is not allowed." }, origin);
  const auth = request.headers.authorization || "";
  const token = isUpload ? (auth.startsWith("Bearer ") ? auth.slice(7) : "") : requestUrl.searchParams.get("ticket") || "";
  if (!token) return json(response, 401, { error: "Upload ticket is required." }, origin);
  let ticket;
  try { ticket = openTicket(token); validateTicket(ticket); }
  catch (error) { return json(response, 401, { error: error instanceof Error ? error.message : "Invalid upload ticket." }, origin); }
  if ((isUpload && ticket.operation !== "upload") || (isDownload && ticket.operation !== (requestUrl.pathname === "/download" ? "download" : "content"))) return json(response, 403, { error: "Ticket does not authorize this operation." }, origin);
  if (isUpload) {
    for (const [nonce, expiry] of usedNonces) if (expiry <= Date.now()) usedNonces.delete(nonce);
    if (usedNonces.has(ticket.nonce)) return json(response, 409, { error: "This upload ticket has already been used." }, origin);
    usedNonces.set(ticket.nonce, ticket.expires_at);
  }
  if (isDownload) return streamFile(response, ticket, origin, request.headers.range);
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength && contentLength !== ticket.file_size) return json(response, 400, { error: "Content-Length does not match the upload ticket." }, origin);
  if (ticket.file_size > maxUpload) return json(response, 413, { error: "File is larger than this transfer service allows." }, origin);
  await uploadFile(request, response, ticket, origin);
}).listen(port, "0.0.0.0", () => console.log(`RuzBox transfer service listening on port ${port}`));
