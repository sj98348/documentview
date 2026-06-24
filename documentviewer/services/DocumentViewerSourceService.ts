export type DocumentKind = "pdf" | "image" | "unsupported";

export interface ParsedDocumentSource {
  kind: DocumentKind;
  objectUrl: string;
  mimeType: string;
  fileName: string;
  base64: string;
}

export interface SourceInput {
  base64Output: string;
  mimeType?: string;
  fileName?: string;
}

export class DocumentViewerSourceService {
  private static readonly IMAGE_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "tif",
    "tiff"
  ]);

  public static parse(input: SourceInput): ParsedDocumentSource {
    const normalized = this.parseBase64Input(input.base64Output || "");
    const base64 = normalized.base64;
    if (!base64) {
      throw new Error("Document base64 is empty.");
    }

    const inputFileName = (input.fileName || "").trim();
    const inputMimeType = this.normalizeMimeType(input.mimeType || "");
    const parsedMimeType = this.normalizeMimeType(normalized.mimeType || "");
    const inferred = this.inferTypeFromBase64(base64);

    const kindFromInputs = this.detectKind(inputFileName, inputMimeType || parsedMimeType);
    const kind = kindFromInputs !== "unsupported" ? kindFromInputs : inferred.kind;

    if (kind === "unsupported") {
      throw new Error("Unsupported file type. Supported: PDF and common image types.");
    }

    const mimeType =
      inputMimeType ||
      parsedMimeType ||
      inferred.mimeType ||
      (kind === "pdf" ? "application/pdf" : "image/png");

    const fileName =
      inputFileName && this.getExtension(inputFileName)
        ? inputFileName
        : kind === "pdf"
          ? "document.pdf"
          : "document.png";

    const objectUrl = this.createObjectUrl(base64, mimeType);
    return {
      kind,
      objectUrl,
      mimeType,
      fileName,
      base64
    };
  }

  public static async createSourceFromFile(file: File): Promise<ParsedDocumentSource> {
    const dataUrl = await this.readFileAsDataUrl(file);
    const parsed = this.parseBase64Input(dataUrl);
    const base64 = parsed.base64;
    if (!base64) {
      throw new Error("Unable to read selected file.");
    }

    const fileName = (file.name || "document.pdf").trim() || "document.pdf";
    const mimeType = (file.type || parsed.mimeType || "application/pdf").trim().toLowerCase();
    const kind = this.detectKind(fileName, mimeType);
    if (kind === "unsupported") {
      throw new Error("Unsupported file type. Supported: PDF and common image types.");
    }

    const objectUrl = this.createObjectUrl(base64, mimeType);
    return {
      kind,
      objectUrl,
      mimeType,
      fileName,
      base64
    };
  }

  public static detectKind(fileName: string, mimeType: string): DocumentKind {
    const normalizedMime = (mimeType || "").toLowerCase();
    if (normalizedMime.includes("pdf")) {
      return "pdf";
    }

    if (normalizedMime.startsWith("image/")) {
      return "image";
    }

    const extension = this.getExtension(fileName);
    if (extension === "pdf") {
      return "pdf";
    }

    if (this.IMAGE_EXTENSIONS.has(extension)) {
      return "image";
    }

    return "unsupported";
  }

  public static revokeObjectUrl(url?: string): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  private static normalizeMimeType(value: string): string {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }

    if (normalized === "val" || normalized === "value" || normalized === "string") {
      return "";
    }

    if (!normalized.includes("/") && normalized !== "pdf") {
      return "";
    }

    if (normalized === "pdf") {
      return "application/pdf";
    }

    return normalized;
  }

  private static inferTypeFromBase64(base64: string): { kind: DocumentKind; mimeType: string } {
    const compact = (base64 || "").replace(/\s+/g, "");
    if (!compact) {
      return { kind: "unsupported", mimeType: "" };
    }

    if (compact.startsWith("JVBERi0")) {
      return { kind: "pdf", mimeType: "application/pdf" };
    }

    if (compact.startsWith("iVBOR")) {
      return { kind: "image", mimeType: "image/png" };
    }

    if (compact.startsWith("/9j/")) {
      return { kind: "image", mimeType: "image/jpeg" };
    }

    if (compact.startsWith("R0lGOD")) {
      return { kind: "image", mimeType: "image/gif" };
    }

    if (compact.startsWith("Qk")) {
      return { kind: "image", mimeType: "image/bmp" };
    }

    if (compact.startsWith("SUkq") || compact.startsWith("TU0AK")) {
      return { kind: "image", mimeType: "image/tiff" };
    }

    if (compact.startsWith("UklGR")) {
      return { kind: "image", mimeType: "image/webp" };
    }

    return { kind: "unsupported", mimeType: "" };
  }

  private static createObjectUrl(base64: string, mimeType: string): string {
    const compact = (base64 || "").replace(/\s+/g, "").trim();
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
    return URL.createObjectURL(blob);
  }

  private static parseBase64Input(value: string): { base64: string; mimeType: string } {
    return this.parseBase64InputInternal(value, 0);
  }

  private static parseBase64InputInternal(
    value: unknown,
    depth: number
  ): { base64: string; mimeType: string } {
    if (depth > 5 || value === null || value === undefined) {
      return { base64: "", mimeType: "" };
    }

    if (typeof value !== "string") {
      if (typeof value === "object" && !Array.isArray(value)) {
        const safe = value as Record<string, unknown>;
        const candidate = this.pickFirstString(safe, [
          "base64",
          "documentBase64",
          "fileBase64",
          "contentBase64",
          "$content",
          "content",
          "data",
          "value"
        ]);
        const mime = this.pickFirstString(safe, [
          "mimeType",
          "mimetype",
          "contentType",
          "content-type",
          "$content-type",
          "type"
        ]);
        if (candidate) {
          const parsed = this.parseBase64InputInternal(candidate, depth + 1);
          if (!parsed.mimeType && mime) {
            return {
              base64: parsed.base64,
              mimeType: this.normalizeMimeType(mime)
            };
          }

          return parsed;
        }
      }

      return { base64: "", mimeType: "" };
    }

    let current = (value || "").trim();
    if (!current) {
      return { base64: "", mimeType: "" };
    }

    current = current
      .replace(/^"|"$/g, "")
      .replace(/\\\//g, "/")
      .replace(/\\n|\\r|\\t/g, "")
      .replace(/\\"/g, '"')
      .trim();

    if (!current) {
      return { base64: "", mimeType: "" };
    }

    const dataUrlMatch = current.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
    if (dataUrlMatch) {
      return {
        mimeType: this.normalizeMimeType(dataUrlMatch[1] || ""),
        base64: this.normalizeBase64(dataUrlMatch[2] || "")
      };
    }

    if ((current.startsWith("{") && current.endsWith("}")) || (current.startsWith("[") && current.endsWith("]"))) {
      try {
        const parsed = JSON.parse(current) as unknown;
        return this.parseBase64InputInternal(parsed, depth + 1);
      } catch {
        // Keep processing as raw base64 string.
      }
    }

    return {
      mimeType: "",
      base64: this.normalizeBase64(current)
    };
  }

  private static pickFirstString(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  }

  private static readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read selected file."));
      reader.readAsDataURL(file);
    });
  }

  private static normalizeBase64(value: string): string {
    const compact = (value || "")
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/[^A-Za-z0-9+/=]/g, "");
    if (!compact) {
      return "";
    }

    const padLength = compact.length % 4;
    return padLength === 0 ? compact : `${compact}${"=".repeat(4 - padLength)}`;
  }

  private static getExtension(fileName: string): string {
    const normalized = (fileName || "").trim().toLowerCase();
    const index = normalized.lastIndexOf(".");
    if (index < 0 || index === normalized.length - 1) {
      return "";
    }

    return normalized.slice(index + 1);
  }
}
