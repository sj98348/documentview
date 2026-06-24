export type AnnotationTool = "pen" | "highlighter" | "eraser";

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  tool: AnnotationTool;
  color: string;
  size: number;
  points: AnnotationPoint[];
}

export interface AnnotatedDocumentResult {
  base64: string;
  mimeType: string;
  fileName: string;
}

export interface DocumentViewerConfig {
  viewerMode: string;
  showBase64Input: boolean;
  // Button visibility controls
  showUploadButton?: boolean;
  showAttachButton?: boolean;
  showAnnotateButton?: boolean;
  showClearMarksButton?: boolean;
  showDownloadButton?: boolean;
  showExpandButton?: boolean;
  showCloseButton?: boolean;
}

export interface ViewerCallbacks {
  onBase64Change: (base64: string, action: "attach" | "annotate") => void;
}

export interface DocumentViewerProps {
  config: DocumentViewerConfig;
  input: SourceInput;
  callbacks: ViewerCallbacks;
  width: number | string;
  height: number | string;
}

export interface SourceInput {
  base64Output: string;
  mimeType?: string;
  fileName?: string;
}

export interface PromiseWithResolversResult<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}
