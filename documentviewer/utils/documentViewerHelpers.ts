import { AnnotationStroke } from "../models/types";

/**
 * Infer MIME type from base64 string header
 */
export const inferMimeTypeFromBase64 = (value: string): string => {
  if (value.startsWith("JVBERi0")) {
    return "application/pdf";
  }
  if (value.startsWith("iVBOR")) {
    return "image/png";
  }
  if (value.startsWith("/9j/")) {
    return "image/jpeg";
  }
  if (value.startsWith("UklGR")) {
    return "image/webp";
  }
  return "application/octet-stream";
};

/**
 * Normalize and validate MIME type string
 */
export const normalizeMimeType = (value: string): string => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "val" || normalized === "value" || normalized === "string") {
    return "";
  }
  if (normalized === "pdf") {
    return "application/pdf";
  }
  if (!normalized.includes("/")) {
    return "";
  }
  return normalized;
};

/**
 * Normalize file name, handling placeholder values
 */
export const normalizeFileName = (value: string): string => {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "document";
  }
  const lower = normalized.toLowerCase();
  if (lower === "val" || lower === "value" || lower === "string") {
    return "document";
  }
  return normalized;
};

/**
 * Get file extension for a given MIME type
 */
export const getExtensionForMimeType = (mimeType: string): string => {
  switch ((mimeType || "").toLowerCase()) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
};

/**
 * Get MIME type for a file extension
 */
export const getMimeTypeForExtension = (extension: string): string => {
  const ext = extension.toLowerCase().replace(/^\./, "");
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "";
  }
};

/**
 * Build annotated file name by inserting suffix before extension
 */
export const buildAnnotatedFileName = (fileName: string, extension: string): string => {
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const baseName = (fileName || "document").replace(/\.[^.]+$/, "");
  return `${baseName}_annotated${safeExtension}`;
};

/**
 * Get supported image export MIME type (validates or defaults)
 */
export const getSupportedImageExportMimeType = (mimeType: string): string => {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp") {
    return normalized;
  }
  return "image/png";
};

/**
 * Convert bytes to base64 string
 */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

/**
 * Decode base64 or data URL string to bytes
 */
export const decodeBase64ToBytes = (value: string): Uint8Array => {
  let compact = (value || "").trim();

  // Some hosts pass JSON-escaped or quoted base64 payloads.
  if (compact.startsWith("\"") && compact.endsWith("\"")) {
    compact = compact.slice(1, -1);
  }

  compact = compact
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  
  // Handle data URL format
  if (compact.startsWith("data:")) {
    const commaIndex = compact.indexOf(",");
    if (commaIndex >= 0) {
      compact = compact.slice(commaIndex + 1);
    }
  }
  
  if (!compact) {
    throw new Error("PDF data is empty.");
  }

  const padLength = compact.length % 4;
  const padded = padLength === 0 ? compact : `${compact}${"=".repeat(4 - padLength)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

/**
 * Normalize rotation angle to 0-359
 */
export const normalizeRotation = (value: number): number => {
  return ((value % 360) + 360) % 360;
};

/**
 * Setup Promise.withResolvers polyfill for older environments
 */
export const setupPromiseWithResolversPolyfill = (): void => {
  const promiseCtor = Promise as PromiseConstructor & {
    withResolvers?: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };
  };

  if (typeof promiseCtor.withResolvers !== "function") {
    promiseCtor.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      return { promise, resolve, reject };
    };
  }
};

/**
 * Create overlay canvas with rendered annotations
 */
export const renderStrokeLayerCanvas = (
  width: number,
  height: number,
  strokes: AnnotationStroke[]
): HTMLCanvasElement => {
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = Math.max(Math.floor(width), 1);
  overlayCanvas.height = Math.max(Math.floor(height), 1);

  const context = overlayCanvas.getContext("2d");
  if (!context) {
    return overlayCanvas;
  }

  context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  for (const stroke of strokes) {
    if (!stroke.points.length) {
      continue;
    }

    context.beginPath();
    context.lineJoin = "round";
    context.lineCap = "round";
    context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    context.globalAlpha = stroke.tool === "highlighter" ? 0.45 : 1;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.size;

    for (let index = 0; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      const x = point.x * overlayCanvas.width;
      const y = point.y * overlayCanvas.height;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  return overlayCanvas;
};
