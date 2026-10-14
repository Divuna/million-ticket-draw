export type SalesLeadEmailAttachmentInput = {
  filename: string;
  content: string;
  content_type?: string | null;
  size: number;
};

export type SalesLeadEmailAttachmentForResend = {
  filename: string;
  content: string;
  content_type?: string;
};

export type SalesLeadEmailAttachmentMetadata = {
  filename: string;
  size: number;
  content_type: string;
};

export const MAX_SALES_LEAD_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  "adp", "app", "asp", "bas", "bat", "cer", "chm", "cmd", "com", "cpl",
  "crt", "csh", "der", "exe", "fxp", "gadget", "hlp", "hta", "inf", "ins",
  "isp", "its", "js", "jse", "ksh", "lib", "lnk", "mad", "maf", "mag",
  "mam", "maq", "mar", "mas", "mat", "mau", "mav", "maw", "mda", "mdb",
  "mde", "mdt", "mdw", "mdz", "msc", "msh", "msh1", "msh2", "mshxml",
  "msh1xml", "msh2xml", "msi", "msp", "mst", "ops", "pcd", "pif", "plg",
  "prf", "prg", "reg", "scf", "scr", "sct", "shb", "shs", "sys", "ps1",
  "ps1xml", "ps2", "ps2xml", "psc1", "psc2", "tmp", "url", "vb", "vbe",
  "vbs", "vps", "vsmacros", "vss", "vst", "vsw", "vxd", "ws", "wsc",
  "wsf", "wsh", "xnk",
]);

const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
};

const isBase64 = (value: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(value.replace(/\s/g, ""));

export function parseSalesLeadEmailAttachments(input: unknown): {
  ok: true;
  attachments: SalesLeadEmailAttachmentForResend[];
  metadata: SalesLeadEmailAttachmentMetadata[];
} | {
  ok: false;
  error: string;
} {
  if (input === undefined || input === null) return { ok: true, attachments: [], metadata: [] };
  if (!Array.isArray(input)) return { ok: false, error: "invalid_attachments" };

  let totalSize = 0;
  const attachments: SalesLeadEmailAttachmentForResend[] = [];
  const metadata: SalesLeadEmailAttachmentMetadata[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_attachment" };
    const value = item as Partial<SalesLeadEmailAttachmentInput>;
    const filename = typeof value.filename === "string" ? value.filename.trim() : "";
    const content = typeof value.content === "string" ? value.content.trim() : "";
    const contentType = typeof value.content_type === "string" && value.content_type.trim()
      ? value.content_type.trim()
      : "application/octet-stream";
    const size = typeof value.size === "number" ? value.size : NaN;

    if (!filename || filename.length > 255) return { ok: false, error: "invalid_attachment_filename" };
    if (!Number.isFinite(size) || size < 0) return { ok: false, error: "invalid_attachment_size" };
    if (!content || !isBase64(content)) return { ok: false, error: "invalid_attachment_content" };
    if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extensionOf(filename))) {
      return { ok: false, error: "unsupported_attachment_type" };
    }

    totalSize += size;
    if (totalSize > MAX_SALES_LEAD_ATTACHMENT_BYTES) return { ok: false, error: "attachments_too_large" };

    attachments.push({ filename, content, content_type: contentType });
    metadata.push({ filename, size, content_type: contentType });
  }

  return { ok: true, attachments, metadata };
}
