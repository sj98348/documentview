import * as React from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
// Handles file parsing
import {
  DocumentViewerSourceService,
  ParsedDocumentSource,
  SourceInput
} from "../../services/DocumentViewerSourceService";
// Colors, sizes, default values
import {
  ANNOTATION_COLORS,
  DEFAULT_PEN_SIZE,
  DEFAULT_HIGHLIGHT_SIZE,
  DEFAULT_ERASER_SIZE,
  PEN_SIZE_OPTIONS,
  HIGHLIGHT_SIZE_OPTIONS,
  ERASER_SIZE_OPTIONS,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  PDF_JS_WORKER_URL,
  ACCEPTED_FILE_TYPES,
  VIEWER_LAYOUT,
  VIEWER_MESSAGES
} from "../../utils/documentViewerConstants";
// TypeScript interfaces
import {
  AnnotationTool,
  AnnotationPoint,
  AnnotationStroke,
  AnnotatedDocumentResult,
  DocumentViewerConfig,
  ViewerCallbacks,
  DocumentViewerProps
} from "../../models/types";
// Utility functions
import {
  setupPromiseWithResolversPolyfill,
  decodeBase64ToBytes,
  normalizeRotation,
  buildAnnotatedFileName,
  getSupportedImageExportMimeType,
  getExtensionForMimeType,
  bytesToBase64,
  renderStrokeLayerCanvas,
  inferMimeTypeFromBase64,
  normalizeMimeType,
  normalizeFileName
} from "../../utils/documentViewerHelpers";

// Setup polyfill and PDF.js worker
setupPromiseWithResolversPolyfill();

try {
  GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
} catch {
  // Worker setup failed - canvas rendering will continue
}

export const DocumentViewerComponent = React.forwardRef<
  { getAnnotatedBase64: () => Promise<string> },
  DocumentViewerProps
>(({ config, input, callbacks, width, height }, ref) => {
  // Refs
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const annotationCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pdfCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const pdfRenderTaskRef = React.useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const isDrawingRef = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const pageStrokesRef = React.useRef<Record<number, AnnotationStroke[]>>({});
  const currentStrokeRef = React.useRef<AnnotationStroke | null>(null);

  // PDF State
  const [pdfDoc, setPdfDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [pdfPageCount, setPdfPageCount] = React.useState(0);
  const [pdfPageNumber, setPdfPageNumber] = React.useState(1);
  const [pageInput, setPageInput] = React.useState("1");
  const [pdfError, setPdfError] = React.useState("");

  // Viewer State
  const [zoomPercent, setZoomPercent] = React.useState(DEFAULT_ZOOM);
  const [rotation, setRotation] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);
  const [autoFitEnabled, setAutoFitEnabled] = React.useState(true);

  // Annotation State
  const [annotateEnabled, setAnnotateEnabled] = React.useState(false);
  const [annotationTool, setAnnotationTool] = React.useState<AnnotationTool>("pen");
  const [annotationColor, setAnnotationColor] = React.useState(ANNOTATION_COLORS[0]);
  const [penSize, setPenSize] = React.useState(DEFAULT_PEN_SIZE);
  const [highlightSize, setHighlightSize] = React.useState(DEFAULT_HIGHLIGHT_SIZE);
  const [eraserSize, setEraserSize] = React.useState(DEFAULT_ERASER_SIZE);
  const [hasAnnotations, setHasAnnotations] = React.useState(false);

  // Search State
  const [searchText, setSearchText] = React.useState("");
  const [status, setStatus] = React.useState<string>(VIEWER_MESSAGES.INITIAL_STATUS);
  const [currentKind, setCurrentKind] = React.useState<"pdf" | "image" | "unsupported" | "none">("none");
  const [currentSource, setCurrentSource] = React.useState<ParsedDocumentSource | null>(null);
  const [objectUrl, setObjectUrl] = React.useState("");
  const [currentInput, setCurrentInputState] = React.useState<SourceInput>({
    base64Output: "",
    mimeType: "",
    fileName: ""
  });
  const currentInputRef = React.useRef<SourceInput>(currentInput);

  // Utility: Decode base64 to bytes
  const decodeBase64ToBytesCallback = React.useCallback((value: string): Uint8Array => {
    return decodeBase64ToBytes(value);
  }, []);

  // Set document and parse source
  const setDocumentFromInput = React.useCallback(
    (inp: SourceInput) => {
      currentInputRef.current = inp;
      setCurrentInputState(inp);
      const base64Str = (inp.base64Output || "").trim();

      if (!base64Str) {
        setStatus(VIEWER_MESSAGES.NO_DOCUMENT_LOADED);
        setCurrentSource(null);
        setCurrentKind("none");
        setPdfDoc(null);
        setObjectUrl("");
        return;
      }

      try {
        const source = DocumentViewerSourceService.parse(inp);
        setObjectUrl(source.objectUrl);
        setCurrentSource(source);
        setCurrentKind(source.kind);
        setZoomPercent(DEFAULT_ZOOM);
        setRotation(0);
        setPdfError("");
        setPageInput("1");
        setHasAnnotations(false);

        if (source.kind === "pdf") {
          setStatus(VIEWER_MESSAGES.LOADING_PDF);
        } else {
          setStatus("");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : VIEWER_MESSAGES.LOAD_DOCUMENT_FAILED;
        setStatus(msg);
        setCurrentSource(null);
        setCurrentKind("none");
      }
    },
    []
  );

  // Effect: Update document when input changes
  React.useEffect(() => {
    setDocumentFromInput(input);
  }, [input, setDocumentFromInput]);

  // Effect: Load PDF document
  React.useEffect(() => {
    if (!currentSource || currentKind !== "pdf") {
      setPdfDoc(null);
      setPdfPageCount(0);
      setPdfPageNumber(1);
      setPageInput("1");
      setZoomPercent(DEFAULT_ZOOM);
      setRotation(0);
      setPdfError("");
      setHasAnnotations(false);
      setAutoFitEnabled(true);
      pageStrokesRef.current = {};
      currentStrokeRef.current = null;
      return;
    }

    let active = true;
    const loadDocument = async () => {
      try {
        // Clear saved annotations when loading a new PDF
        pageStrokesRef.current = {};
        currentStrokeRef.current = null;
        
        setPdfError("");
        const bytes = decodeBase64ToBytesCallback(currentSource.base64);
        
        let documentProxy: PDFDocumentProxy | null = null;
        const loadingTask = getDocument({
          data: bytes,
          disableWorker: true
        } as unknown as Parameters<typeof getDocument>[0]);
        
        const promiseValue = (loadingTask as unknown as { promise?: unknown }).promise || loadingTask;
        documentProxy = await (promiseValue as Promise<PDFDocumentProxy>);

        if (!active) {
          await documentProxy.destroy();
          return;
        }

        if (!documentProxy.numPages || documentProxy.numPages < 1) {
          setPdfDoc(null);
          setPdfPageCount(0);
          setPdfError(VIEWER_MESSAGES.PDF_NO_PAGES_ERROR);
          setStatus(VIEWER_MESSAGES.PDF_NO_PAGES_STATUS);
          console.warn("[DocumentViewer] PDF has no pages");
          return;
        }

        setPdfDoc(documentProxy);
        setPdfPageCount(documentProxy.numPages || 0);
        setPdfPageNumber(1);
        setPageInput("1");
        setStatus("");
      } catch (error) {
        if (!active) return;
        
        setPdfDoc(null);
        setPdfPageCount(0);
        const detail = error instanceof Error ? error.message : "Unknown error";
        setPdfError(`${VIEWER_MESSAGES.PDF_VIEWER_UNAVAILABLE_PREFIX} (${detail})`);
        console.error("[DocumentViewer] PDF loading failed:", error);
        setStatus(detail);
      }
    };

    void loadDocument();

    return () => {
      active = false;
    };
  }, [currentKind, currentSource, decodeBase64ToBytesCallback]);

  // Effect: Render PDF page
  React.useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) {
      return;
    }

    let cancelled = false;
    const renderPage = async () => {
      try {
        if (pdfRenderTaskRef.current) {
          try {
            pdfRenderTaskRef.current.cancel();
          } catch {
            // Ignore
          }
          pdfRenderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pdfPageNumber);
        if (cancelled) {
          return;
        }

        const canvas = pdfCanvasRef.current;
        if (!canvas) {
          console.warn("[DocumentViewer] Canvas ref is null");
          return;
        }

        const baseViewport = page.getViewport({ scale: 1, rotation });
        let effectiveZoom = zoomPercent;

        if (autoFitEnabled && frameRef.current) {
          const frameWidth = Math.max(
            frameRef.current.clientWidth - VIEWER_LAYOUT.AUTO_FIT_HORIZONTAL_PADDING,
            VIEWER_LAYOUT.AUTO_FIT_MIN_WIDTH
          );
          const fitZoom = Math.floor((frameWidth / baseViewport.width) * VIEWER_LAYOUT.PERCENT_DIVISOR);
          effectiveZoom = Math.max(MIN_ZOOM, Math.min(DEFAULT_ZOOM, fitZoom));
          if (effectiveZoom !== zoomPercent) {
            setZoomPercent(effectiveZoom);
          }
        }

        const scale = effectiveZoom / VIEWER_LAYOUT.PERCENT_DIVISOR;
        const viewport = page.getViewport({ scale, rotation });
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }

        const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.floor(viewport.width * deviceScale);
        canvas.height = Math.floor(viewport.height * deviceScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        pdfRenderTaskRef.current = renderTask as unknown as {
          cancel: () => void;
          promise: Promise<void>;
        };

        await renderTask.promise;

        if (pdfRenderTaskRef.current === renderTask) {
          pdfRenderTaskRef.current = null;
        }

        // Ensure annotation overlay is resized to the final rendered page bounds.
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });

        // Do not force scroll reset here; this effect also runs on zoom/rotate.
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("rendering cancelled") || message.includes("same canvas")) {
          return;
        }

        setPdfError(VIEWER_MESSAGES.PDF_RENDER_ERROR);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (pdfRenderTaskRef.current) {
        try {
          pdfRenderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        pdfRenderTaskRef.current = null;
      }
    };
  }, [autoFitEnabled, pdfDoc, pdfPageNumber, zoomPercent, rotation]);

  // Effect: Sync page input
  React.useEffect(() => {
    setPageInput(String(pdfPageNumber));
  }, [pdfPageNumber]);

  const normalizeRotationCallback = React.useCallback((value: number) => normalizeRotation(value), []);

  const mapScreenToDocumentPoint = React.useCallback(
    (xNorm: number, yNorm: number): AnnotationPoint => {
      const angle = normalizeRotationCallback(rotation);
      if (angle === 90) {
        return { x: yNorm, y: 1 - xNorm };
      }
      if (angle === 180) {
        return { x: 1 - xNorm, y: 1 - yNorm };
      }
      if (angle === 270) {
        return { x: 1 - yNorm, y: xNorm };
      }
      return { x: xNorm, y: yNorm };
    },
    [normalizeRotationCallback, rotation]
  );

  const mapDocumentToScreenPoint = React.useCallback(
    (point: AnnotationPoint): AnnotationPoint => {
      const angle = normalizeRotationCallback(rotation);
      if (angle === 90) {
        return { x: 1 - point.y, y: point.x };
      }
      if (angle === 180) {
        return { x: 1 - point.x, y: 1 - point.y };
      }
      if (angle === 270) {
        return { x: point.y, y: 1 - point.x };
      }
      return { x: point.x, y: point.y };
    },
    [normalizeRotationCallback, rotation]
  );

  const getAnnotationKey = React.useCallback(() => (currentKind === "pdf" ? pdfPageNumber : 0), [currentKind, pdfPageNumber]);

  const renderStoredAnnotations = React.useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
    const displayWidth = Math.max(canvas.clientWidth, 1);
    const displayHeight = Math.max(canvas.clientHeight, 1);
    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.clearRect(0, 0, displayWidth, displayHeight);

    const key = getAnnotationKey();
    const strokes = pageStrokesRef.current[key] || [];
    for (const stroke of strokes) {
      context.beginPath();
      context.lineJoin = "round";
      context.lineCap = "round";
      context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      context.globalAlpha = stroke.tool === "highlighter" ? 0.45 : 1;
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.size;

      for (let i = 0; i < stroke.points.length; i += 1) {
        const mapped = mapDocumentToScreenPoint(stroke.points[i]);
        const x = mapped.x * displayWidth;
        const y = mapped.y * displayHeight;
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
    }

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    setHasAnnotations(strokes.length > 0);
  }, [getAnnotationKey, mapDocumentToScreenPoint]);

  // Effect: Resize annotation canvas to match rendered document region
  const resizeCanvas = React.useCallback(() => {
    const stage = stageRef.current;
    const canvas = annotationCanvasRef.current;
    if (!stage || !canvas) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const displayWidth = Math.max(stage.clientWidth || stageRect.width, 1);
    const displayHeight = Math.max(stage.clientHeight || stageRect.height, 1);
    const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.floor(displayWidth * deviceScale);
    const height = Math.floor(displayHeight * deviceScale);

    canvas.style.left = "0px";
    canvas.style.top = "0px";
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    renderStoredAnnotations();
  }, [renderStoredAnnotations]);

  React.useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas, expanded, currentSource?.objectUrl, pdfPageNumber, zoomPercent, rotation]);

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const stage = stageRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    const imageElement = imageRef.current;

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });

    if (stage) {
      observer.observe(stage);
    }
    if (pdfCanvas) {
      observer.observe(pdfCanvas);
    }
    if (imageElement) {
      observer.observe(imageElement);
    }

    return () => observer.disconnect();
  }, [resizeCanvas, currentKind, pdfPageNumber, rotation, zoomPercent, currentSource?.objectUrl]);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const onScroll = () => {
      resizeCanvas();
    };

    frame.addEventListener("scroll", onScroll);
    return () => frame.removeEventListener("scroll", onScroll);
  }, [resizeCanvas]);

  React.useEffect(() => {
    renderStoredAnnotations();
    // Force canvas resize on rotation to ensure annotations align with rotated image
    resizeCanvas();
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
  }, [renderStoredAnnotations, pdfPageNumber, rotation, currentKind, resizeCanvas]);

  // Effect: Global pointer/mouse up to reset drawing if Canvas app swallows the event
  React.useEffect(() => {
    const resetDrawing = () => {
      isDrawingRef.current = false;
      currentStrokeRef.current = null;
    };
    window.addEventListener("pointerup", resetDrawing);
    window.addEventListener("mouseup", resetDrawing);
    return () => {
      window.removeEventListener("pointerup", resetDrawing);
      window.removeEventListener("mouseup", resetDrawing);
    };
  }, []);

  // Annotation: Get point relative to active visual target
  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const target = currentKind === "pdf"
      ? pdfCanvasRef.current
      : currentKind === "image"
        ? imageRef.current
        : annotationCanvasRef.current;
    const rect = target?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1)
    };
  };

  // Annotation: Pointer down
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotateEnabled) {
      return;
    }

    // Ensure overlay dimensions are in sync before capturing pointer coordinates.
    resizeCanvas();

    // Force-reset any stuck drawing state from Canvas app event interception
    isDrawingRef.current = false;

    event.preventDefault();
    event.stopPropagation();

    const canvas = annotationCanvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getPoint(event);
    const xNorm = point.x / point.width;
    const yNorm = point.y / point.height;
    const documentPoint = mapScreenToDocumentPoint(xNorm, yNorm);
    const strokeSize = annotationTool === "pen"
      ? penSize
      : annotationTool === "highlighter"
        ? highlightSize
        : eraserSize;

    const stroke: AnnotationStroke = {
      tool: annotationTool,
      color: annotationColor,
      size: strokeSize,
      points: [documentPoint]
    };

    const key = getAnnotationKey();
    if (!pageStrokesRef.current[key]) {
      pageStrokesRef.current[key] = [];
    }
    pageStrokesRef.current[key].push(stroke);
    currentStrokeRef.current = stroke;

    isDrawingRef.current = true;
    renderStoredAnnotations();
  };

  // Annotation: Pointer move
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotateEnabled || !isDrawingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const canvas = annotationCanvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getPoint(event);
    const xNorm = point.x / point.width;
    const yNorm = point.y / point.height;
    const documentPoint = mapScreenToDocumentPoint(xNorm, yNorm);
    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push(documentPoint);
    }

    renderStoredAnnotations();
    setHasAnnotations(true);
  };

  // Annotation: Pointer up
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotateEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
  };

  // Clear annotations
  const clearAnnotations = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    
    // Also clear saved annotations for current page
    pageStrokesRef.current[getAnnotationKey()] = [];
    
    setHasAnnotations(false);
    setAutoFitEnabled(true);
  };

  // PDF Navigation
  const goToPage = React.useCallback(
    (value: number) => {
      if (!pdfPageCount) {
        return;
      }
      const clamped = Math.max(1, Math.min(pdfPageCount, value));
      setPdfPageNumber(clamped);
    },
    [pdfPageCount]
  );

  // PDF Search
  const searchInPdf = React.useCallback(async () => {
    if (!pdfDoc || !searchText.trim()) {
      return;
    }

    const term = searchText.trim().toLowerCase();
    const total = pdfDoc.numPages || 0;
    if (!total) {
      return;
    }
    for (let step = 0; step < total; step += 1) {
      const pageNumber = ((pdfPageNumber - 1 + step) % total) + 1;
      const page = await pdfDoc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = (textContent.items || [])
        .map((item) => String((item as TextItem).str || ""))
        .join(" ")
        .toLowerCase();

      if (text.includes(term)) {
        setPdfPageNumber(pageNumber);
        return;
      }
    }
  }, [pdfDoc, pdfPageNumber, searchText]);

  // File selection
  const onFileSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const parsed = await DocumentViewerSourceService.createSourceFromFile(file);
        const newInput = {
          base64Output: parsed.base64,
          mimeType: parsed.mimeType,
          fileName: parsed.fileName
        };
        setCurrentInputState(newInput);
        setDocumentFromInput(newInput);
        setStatus(`Loaded ${parsed.fileName}.`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : VIEWER_MESSAGES.LOAD_FILE_FAILED;
        setStatus(msg);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [setDocumentFromInput]
  );

  const buildAnnotatedFileNameCallback = React.useCallback((fileName: string, extension: string) => {
    return buildAnnotatedFileName(fileName, extension);
  }, []);

  const getSupportedImageExportMimeTypeCallback = React.useCallback((mimeType: string) => {
    return getSupportedImageExportMimeType(mimeType);
  }, []);

  const getFileExtensionForMimeTypeCallback = React.useCallback((mimeType: string) => {
    return getExtensionForMimeType(mimeType);
  }, []);

  const bytesToBase64Callback = React.useCallback((bytes: Uint8Array) => {
    return bytesToBase64(bytes);
  }, []);

  const renderStrokeLayerCanvasCallback = React.useCallback((width: number, height: number, strokes: AnnotationStroke[]) => {
    return renderStrokeLayerCanvas(width, height, strokes);
  }, []);

  const getAnnotatedDocument = React.useCallback(async (): Promise<AnnotatedDocumentResult> => {
    try {
      if (!hasAnnotations) {
        return {
          base64: currentInput.base64Output || "",
          mimeType: currentInput.mimeType || "",
          fileName: currentInput.fileName || "document"
        };
      }

      const annotationCanvas = annotationCanvasRef.current;
      if (!annotationCanvas) {
        console.warn("[DocumentViewer] Annotation canvas not found");
        return {
          base64: currentInput.base64Output || "",
          mimeType: currentInput.mimeType || "",
          fileName: currentInput.fileName || "document"
        };
      }

      // Clean up base64 string before processing
      let cleanBase64 = (currentInput.base64Output || "").trim();
      if (cleanBase64.startsWith("\"") && cleanBase64.endsWith("\"")) {
        cleanBase64 = cleanBase64.slice(1, -1);
      }
      if (cleanBase64.startsWith("data:")) {
        const commaIndex = cleanBase64.indexOf(",");
        if (commaIndex >= 0) {
          cleanBase64 = cleanBase64.slice(commaIndex + 1);
        }
      }
      cleanBase64 = cleanBase64
        .replace(/\\r/g, "")
        .replace(/\\n/g, "")
        .replace(/\s+/g, "");

      if (currentKind === "pdf") {
        try {
          const pdfBytes = decodeBase64ToBytesCallback(cleanBase64 || "");
          const pdfDocument = await PDFDocument.load(pdfBytes);
          const entries = Object.entries(pageStrokesRef.current);

          for (const [pageKey, strokes] of entries) {
            const pageIndex = Number.parseInt(pageKey, 10) - 1;
            if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= pdfDocument.getPageCount() || !strokes.length) {
              continue;
            }

            const page = pdfDocument.getPage(pageIndex);
            const { width, height } = page.getSize();
            const overlayCanvas = renderStrokeLayerCanvasCallback(width, height, strokes);
            const dataUrl = overlayCanvas.toDataURL("image/png");
            const overlayImage = await pdfDocument.embedPng(dataUrl);

            page.drawImage(overlayImage, {
              x: 0,
              y: 0,
              width,
              height
            });
          }

          const savedPdfBytes = await pdfDocument.save();
          const outputMimeType = "application/pdf";
          return {
            base64: bytesToBase64Callback(savedPdfBytes),
            mimeType: outputMimeType,
            fileName: buildAnnotatedFileNameCallback(currentInput.fileName || "document.pdf", ".pdf")
          };
        } catch (pdfError) {
          console.error("[DocumentViewer] Error processing PDF annotations:", pdfError);
          throw pdfError;
        }
      }

      if (currentKind === "image" && imageRef.current) {
        try {
          const imageElement = imageRef.current;
          const mergedCanvas = document.createElement("canvas");
          mergedCanvas.width = annotationCanvas.width;
          mergedCanvas.height = annotationCanvas.height;

          const mergedContext = mergedCanvas.getContext("2d");
          if (mergedContext) {
            const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
            const imageWidth = Math.max(imageElement.clientWidth, 1);
            const imageHeight = Math.max(imageElement.clientHeight, 1);

            // Reproduce image transform used in the UI so annotation coordinates align in export.
            mergedContext.save();
            mergedContext.scale(deviceScale, deviceScale);
            mergedContext.scale(
              zoomPercent / VIEWER_LAYOUT.PERCENT_DIVISOR,
              zoomPercent / VIEWER_LAYOUT.PERCENT_DIVISOR
            );
            mergedContext.rotate((rotation * Math.PI) / 180);
            mergedContext.drawImage(imageElement, 0, 0, imageWidth, imageHeight);
            mergedContext.restore();

            mergedContext.drawImage(annotationCanvas, 0, 0);

            const outputMimeType = getSupportedImageExportMimeTypeCallback(currentInput.mimeType || currentSource?.mimeType || "image/png");
            const dataUrl = mergedCanvas.toDataURL(outputMimeType);
            return {
              base64: dataUrl.split(",")[1] || "",
              mimeType: outputMimeType,
              fileName: buildAnnotatedFileNameCallback(
                currentInput.fileName || "document.png",
                getFileExtensionForMimeTypeCallback(outputMimeType)
              )
            };
          }
        } catch (imageError) {
          console.error("[DocumentViewer] Error processing image annotations:", imageError);
          throw imageError;
        }
      }

      return {
        base64: currentInput.base64Output || "",
        mimeType: currentInput.mimeType || "",
        fileName: currentInput.fileName || "document"
      };
    } catch (error) {
      console.error("[DocumentViewer] Error in getAnnotatedDocument:", error);
      throw error;
    }
  }, [
    buildAnnotatedFileNameCallback,
    bytesToBase64Callback,
    currentInput.base64Output,
    currentInput.fileName,
    currentInput.mimeType,
    currentKind,
    currentSource?.mimeType,
    decodeBase64ToBytesCallback,
    getFileExtensionForMimeTypeCallback,
    getSupportedImageExportMimeTypeCallback,
    hasAnnotations,
    renderStrokeLayerCanvasCallback,
    rotation,
    zoomPercent
  ]);

  // Get annotated base64
  const getAnnotatedBase64 = React.useCallback(async (): Promise<string> => {
    const result = await getAnnotatedDocument();
    return result.base64;
  }, [getAnnotatedDocument]);

  // Expose ref methods
  React.useImperativeHandle(ref, () => ({
    getAnnotatedBase64
  }), [getAnnotatedBase64]);

  // Download file
  const downloadCurrentFile = React.useCallback(async () => {
    const latestInput = currentInputRef.current;
    if (!latestInput.base64Output?.trim()) {
      return;
    }

    let downloadBase64 = (latestInput.base64Output || "").trim();
    const downloadMimeType = latestInput.mimeType || "";
    const downloadFileName = latestInput.fileName || "";

    if (downloadBase64.startsWith("\"") && downloadBase64.endsWith("\"")) {
      downloadBase64 = downloadBase64.slice(1, -1);
    }
    if (downloadBase64.startsWith("data:")) {
      const commaIndex = downloadBase64.indexOf(",");
      if (commaIndex >= 0) {
        downloadBase64 = downloadBase64.slice(commaIndex + 1);
      }
    }
    downloadBase64 = downloadBase64
      .replace(/\\r/g, "")
      .replace(/\\n/g, "")
      .replace(/\s+/g, "");

    const inferredMimeType = inferMimeTypeFromBase64(downloadBase64);
    const inputMimeType = normalizeMimeType(downloadMimeType || "");
    const sourceMimeType = normalizeMimeType(currentSource?.mimeType || "");
    const finalDownloadMimeType = inputMimeType || sourceMimeType || inferredMimeType || "application/octet-stream";
    const targetExtension = getExtensionForMimeType(finalDownloadMimeType);

      // Use original filename (preserves "-annotated" suffix if present)
      const rawFileName = normalizeFileName(downloadFileName || currentSource?.fileName || "document");
      const hasExtension = /\.[^.]+$/.test(rawFileName);
      const finalDownloadFileName = !hasExtension && targetExtension
        ? `${rawFileName}${targetExtension}`
        : rawFileName;

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };

    // In mobile webviews, direct anchor downloads can navigate the current app view.
    // Prefer native share so the app does not get stuck on a rendered image/file page.
    if (typeof window !== "undefined" && /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent)) {
      try {
        const bytes = decodeBase64ToBytesCallback(downloadBase64 || "");
        const safeBytes = new Uint8Array(bytes.length);
        safeBytes.set(bytes);
        const file = new File([safeBytes.buffer], finalDownloadFileName, {
          type: finalDownloadMimeType
        });

        if (typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [file] }))) {
          await nav.share({ files: [file], title: downloadFileName });
          setStatus(VIEWER_MESSAGES.FILE_READY_SHARE);
          return;
        }

        setStatus(VIEWER_MESSAGES.DOWNLOAD_NOT_SUPPORTED_MOBILE);
        return;
      } catch {
        setStatus(VIEWER_MESSAGES.UNABLE_OPEN_MOBILE_SHARE);
        return;
      }
    }

    let objectUrl = "";
    try {
      const bytes = decodeBase64ToBytesCallback(downloadBase64 || "");
      const safeBytes = new Uint8Array(bytes.length);
      safeBytes.set(bytes);
      const blob = new Blob([safeBytes.buffer], { type: finalDownloadMimeType });
      objectUrl = URL.createObjectURL(blob);
    } catch {
      setStatus(VIEWER_MESSAGES.UNABLE_PREPARE_DOWNLOAD);
      return;
    }

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = finalDownloadFileName;
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    
    try {
      link.click();
      setStatus(`Downloaded ${finalDownloadFileName}.`);
    } catch (clickError) {
      console.error("[DocumentViewer] Download click failed:", clickError);
      setStatus(VIEWER_MESSAGES.DOWNLOAD_FAILED);
    } finally {
      // Ensure link is removed immediately to prevent navigation
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      // Revoke object URL after a brief delay to ensure download initiated
      setTimeout(() => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (revokeError) {
          console.error("[DocumentViewer] Failed to revoke object URL:", revokeError);
        }
      }, VIEWER_LAYOUT.DOWNLOAD_REVOKE_DELAY_MS);
    }
  }, [
    currentSource?.fileName,
    currentSource?.mimeType,
    decodeBase64ToBytesCallback
  ]);

  // Append current document
  const appendCurrentDocument = React.useCallback(async () => {
    if (!currentInput.base64Output.trim()) {
      setStatus(VIEWER_MESSAGES.NO_DOCUMENT_APPEND);
      return;
    }

    let outputBase64 = currentInput.base64Output;
    let outputMimeType = currentInput.mimeType;
    let outputFileName = currentInput.fileName;
    const wasAnnotated = hasAnnotations;

    if (hasAnnotations) {
      const annotatedDocument = await getAnnotatedDocument();
      if (annotatedDocument.base64) {
        outputBase64 = annotatedDocument.base64;
        outputMimeType = annotatedDocument.mimeType;
        outputFileName = annotatedDocument.fileName;
      }
    }

    // Reload viewer with the annotated image so user sees what was sent
    const newInput: SourceInput = {
      base64Output: outputBase64,
      mimeType: outputMimeType,
      fileName: outputFileName
    };
    currentInputRef.current = newInput;
    setDocumentFromInput(newInput);

    // Clear annotation canvas since marks are now baked into the image
    const annotationCanvas = annotationCanvasRef.current;
    if (annotationCanvas) {
      const ctx = annotationCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    
    // Clear all saved page annotations
    pageStrokesRef.current = {};
    currentStrokeRef.current = null;

    callbacks.onBase64Change(outputBase64, "attach");
    setStatus(
      wasAnnotated
        ? VIEWER_MESSAGES.ANNOTATED_SENT_TO_OUTPUT
        : VIEWER_MESSAGES.CURRENT_SENT_TO_OUTPUT
    );
  }, [currentInput, hasAnnotations, callbacks, getAnnotatedDocument, setDocumentFromInput]);

  // Close
  const closeViewer = () => {
    setCurrentInputState({ base64Output: "", mimeType: "", fileName: "" });
    setPdfDoc(null);
    setCurrentSource(null);
    setCurrentKind("none");
    pageStrokesRef.current = {};
    currentStrokeRef.current = null;
    setHasAnnotations(false);
    setStatus(VIEWER_MESSAGES.NO_DOCUMENT_LOADED);
    if (objectUrl) {
      DocumentViewerSourceService.revokeObjectUrl(objectUrl);
      setObjectUrl("");
    }
  };

  const toggleAnnotateMode = React.useCallback(async () => {
    if (!annotateEnabled) {
      setAnnotateEnabled(true);
      return;
    }

    setAnnotateEnabled(false);

    if (!currentInput.base64Output.trim()) {
      return;
    }

    if (!hasAnnotations) {
      callbacks.onBase64Change(currentInput.base64Output, "annotate");
      return;
    }

    try {
      const annotatedDoc = await getAnnotatedDocument();
      if (!annotatedDoc.base64) {
        return;
      }

      const updatedInput: SourceInput = {
        base64Output: annotatedDoc.base64,
        mimeType: annotatedDoc.mimeType,
        fileName: annotatedDoc.fileName
      };

      currentInputRef.current = updatedInput;
      setDocumentFromInput(updatedInput);
      callbacks.onBase64Change(annotatedDoc.base64, "annotate");
      setStatus(VIEWER_MESSAGES.ANNOTATED_READY_TO_DOWNLOAD);
    } catch (error) {
      console.error("[DocumentViewer] Error finalizing annotations:", error);
      setStatus(VIEWER_MESSAGES.FINALIZE_ANNOTATION_FAILED);
    }
  }, [
    annotateEnabled,
    callbacks,
    currentInput.base64Output,
    getAnnotatedDocument,
    hasAnnotations,
    setDocumentFromInput
  ]);

  // Mode visibility logic
  const isFullMode = config.viewerMode === "full" || config.viewerMode === "all" || config.viewerMode === "default";
  const isDocumentMode = config.viewerMode === "document" || config.viewerMode === "viewer";
  const isLoadMode = config.viewerMode === "load" || config.viewerMode === "loader";

  const showUpload = config.showUploadButton !== false && !isDocumentMode;
  const showAttach = config.showAttachButton !== false && !isDocumentMode;
  const showAnnotate = config.showAnnotateButton !== false && isFullMode;
  const showClearMarks = config.showClearMarksButton !== false && isFullMode;
  const showDownload = config.showDownloadButton !== false && !isLoadMode;
  const showExpandCollapse = config.showExpandButton !== false && (isDocumentMode || isLoadMode);
  const showClose = config.showCloseButton !== false;

  return (
    <div className={`doc-viewer ${expanded ? "expanded" : ""}`} style={{ width, height }}>
      <div className="doc-viewer-top-panel">
        <div className="doc-viewer-toolbar">
          {showUpload && (
            <button
              type="button"
              className="doc-viewer-btn attach"
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              Upload File
            </button>
          )}

          {showAttach && (
            <button
              type="button"
              className="doc-viewer-btn download"
              onClick={appendCurrentDocument}
              disabled={!currentSource}
            >
              Attach
            </button>
          )}

          {showAnnotate && (
            <>
              <button
                type="button"
                className="doc-viewer-btn annotate"
                onClick={() => {
                  void toggleAnnotateMode();
                }}
                disabled={!currentSource}
              >
                {annotateEnabled ? "Annotating" : "Annotate"}
              </button>

              {hasAnnotations && (
                <button
                  type="button"
                  className="doc-viewer-btn clear"
                  onClick={clearAnnotations}
                >
                  Clear Marks
                </button>
              )}
            </>
          )}

          {showDownload && (
            <button
              type="button"
              className="doc-viewer-btn download"
              onClick={() => {
                void downloadCurrentFile();
              }}
              disabled={!currentSource || annotateEnabled}
              title={annotateEnabled ? VIEWER_MESSAGES.DOWNLOAD_DISABLED_HINT : ""}
            >
              Download
            </button>
          )}

          {showExpandCollapse && (
            <button
              type="button"
              className="doc-viewer-btn expand"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}

          {showClose && (
            <button
              type="button"
              className="doc-viewer-btn close"
              onClick={closeViewer}
            >
              Close
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            style={{ display: "none" }}
            onChange={onFileSelected}
          />
        </div>
      </div>

      {showAnnotate && annotateEnabled && (
        <div className="doc-viewer-annotate-tools">
          <button
            type="button"
            className={`doc-viewer-annotate-btn ${annotationTool === "pen" ? "active" : ""}`}
            onClick={() => setAnnotationTool("pen")}
          >
            Pen
          </button>
          <select
            className="doc-viewer-annotate-select"
            value={penSize}
            onChange={(e) => setPenSize(Number.parseInt(e.target.value, 10) || DEFAULT_PEN_SIZE)}
          >
            {PEN_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <button
            type="button"
            className={`doc-viewer-annotate-btn ${annotationTool === "highlighter" ? "active" : ""}`}
            onClick={() => setAnnotationTool("highlighter")}
          >
            Highlighter
          </button>
          <select
            className="doc-viewer-annotate-select"
            value={highlightSize}
            onChange={(e) => setHighlightSize(Number.parseInt(e.target.value, 10) || DEFAULT_HIGHLIGHT_SIZE)}
          >
            {HIGHLIGHT_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <button
            type="button"
            className={`doc-viewer-annotate-btn ${annotationTool === "eraser" ? "active" : ""}`}
            onClick={() => setAnnotationTool("eraser")}
          >
            Eraser
          </button>
          <select
            className="doc-viewer-annotate-select"
            value={eraserSize}
            onChange={(e) => setEraserSize(Number.parseInt(e.target.value, 10) || DEFAULT_ERASER_SIZE)}
          >
            {ERASER_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <div className="doc-viewer-color-palette">
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`doc-viewer-color-dot ${annotationColor === color ? "active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => setAnnotationColor(color)}
                title={`Color ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="doc-viewer-menu-text" style={{ padding: VIEWER_LAYOUT.MENU_TEXT_PADDING }}>
        {currentSource && `${currentSource.fileName} (${currentSource.mimeType})`}
      </div>

      <div className="doc-viewer-menu" style={{ display: "flex", gap: VIEWER_LAYOUT.MENU_GAP, padding: VIEWER_LAYOUT.MENU_PADDING }}>
        <button
          type="button"
          className="doc-viewer-menu-btn"
          onClick={() => {
            setAutoFitEnabled(false);
            setZoomPercent((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
          }}
          disabled={!currentSource}
        >
          -
        </button>
        <div className="doc-viewer-menu-text">{zoomPercent}%</div>
        <button
          type="button"
          className="doc-viewer-menu-btn"
          onClick={() => {
            setAutoFitEnabled(false);
            setZoomPercent((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
          }}
          disabled={!currentSource}
        >
          +
        </button>

        {currentKind === "pdf" && (
          <>
            <button
              type="button"
              className="doc-viewer-menu-btn"
              onClick={() => goToPage(pdfPageNumber - 1)}
              disabled={!pdfDoc || pdfPageNumber <= 1}
            >
              &lt;
            </button>
            <input
              type="number"
              className="doc-viewer-page-input"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = Number.parseInt(pageInput, 10);
                  if (Number.isFinite(val)) {
                    goToPage(val);
                  }
                }
              }}
              disabled={!pdfDoc}
            />
            <div className="doc-viewer-menu-text">/ {pdfPageCount}</div>
            <button
              type="button"
              className="doc-viewer-menu-btn"
              onClick={() => goToPage(pdfPageNumber + 1)}
              disabled={!pdfDoc || pdfPageNumber >= pdfPageCount}
            >
              &gt;
            </button>

            <input
              type="text"
              className="doc-viewer-search-input"
              placeholder={VIEWER_MESSAGES.SEARCH_PLACEHOLDER}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void searchInPdf();
                }
              }}
              disabled={!pdfDoc}
            />
            <button
              type="button"
              className="doc-viewer-menu-btn"
              onClick={() => void searchInPdf()}
              disabled={!pdfDoc}
            >
              Find
            </button>
          </>
        )}

        <button
          type="button"
          className="doc-viewer-menu-btn"
          onClick={() => {
            setAutoFitEnabled(false);
            setRotation((r) => (r + 90) % 360);
          }}
          disabled={!currentSource}
        >
          Rotate
        </button>
      </div>

      <div className="doc-viewer-menu-status">{status}</div>

      {config.showBase64Input && (
        <div style={{ padding: VIEWER_LAYOUT.BASE64_PANEL_PADDING }}>
          <textarea
            value={currentInput.base64Output || ""}
            readOnly
            rows={4}
            style={{ width: "100%", resize: "vertical" }}
            aria-label="Base64 output"
          />
        </div>
      )}

      <div className="doc-viewer-frame" ref={frameRef}>
        {pdfError && (
          <div className="doc-viewer-empty">{pdfError}</div>
        )}

        {!pdfError && currentKind === "none" && (
          <div className="doc-viewer-empty">{VIEWER_MESSAGES.NO_FILE_LOADED}</div>
        )}

        {!pdfError && (currentKind === "image" || currentKind === "pdf") && (
          <div ref={stageRef} className="doc-viewer-stage">
            {currentKind === "image" && objectUrl && (
              <img
                ref={imageRef}
                src={objectUrl}
                alt={currentSource?.fileName || "Document"}
                className="doc-viewer-image"
                style={{
                  transform: `scale(${zoomPercent / VIEWER_LAYOUT.PERCENT_DIVISOR}) rotate(${rotation}deg)`,
                  transformOrigin: "top left"
                }}
              />
            )}

            {currentKind === "pdf" && (
              <canvas
                ref={pdfCanvasRef}
                className="doc-viewer-pdf-canvas"
                style={{ maxWidth: "none", height: "auto" }}
              />
            )}

            <canvas
              ref={annotationCanvasRef}
              className={`doc-viewer-annotation ${annotateEnabled ? "enabled" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => { isDrawingRef.current = false; }}
              style={{
                cursor: annotateEnabled ? "crosshair" : "default"
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

DocumentViewerComponent.displayName = "DocumentViewerComponent";
