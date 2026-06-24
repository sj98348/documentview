// Annotation tool constants
export const ANNOTATION_COLORS = ["#d91f1f", "#2d7ff9", "#2f9e44", "#ff922b", "#8e44ad", "#f06595"];
export const DEFAULT_PEN_SIZE = 3;
export const DEFAULT_HIGHLIGHT_SIZE = 14;
export const DEFAULT_ERASER_SIZE = 20;
export const PEN_SIZE_OPTIONS = [2, 3, 5, 7];
export const HIGHLIGHT_SIZE_OPTIONS = [10, 14, 18, 24];
export const ERASER_SIZE_OPTIONS = [10, 16, 20, 28];

// Zoom constants
export const DEFAULT_ZOOM = 100;
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 300;
export const ZOOM_STEP = 10;

// Viewer layout/constants
export const VIEWER_LAYOUT = {
	AUTO_FIT_HORIZONTAL_PADDING: 24,
	AUTO_FIT_MIN_WIDTH: 100,
	PERCENT_DIVISOR: 100,
	MENU_TEXT_PADDING: "4px 8px",
	MENU_GAP: "4px",
	MENU_PADDING: "4px",
	BASE64_PANEL_PADDING: "6px 8px",
	DOWNLOAD_REVOKE_DELAY_MS: 100
} as const;

// Viewer text/messages
export const VIEWER_MESSAGES = {
	INITIAL_STATUS: "Upload a local file to preview a document.",
	NO_DOCUMENT_LOADED: "No document loaded.",
	NO_FILE_LOADED: "No file loaded.",
	LOADING_PDF: "Loading PDF...",
	LOAD_DOCUMENT_FAILED: "Unable to load document.",
	PDF_NO_PAGES_ERROR: "PDF document has no pages.",
	PDF_NO_PAGES_STATUS: "PDF has no pages.",
	PDF_RENDER_ERROR: "Unable to render selected PDF page.",
	LOAD_FILE_FAILED: "Unable to load selected file.",
	FILE_READY_SHARE: "File ready to save/share.",
	DOWNLOAD_NOT_SUPPORTED_MOBILE: "Download is not supported in this mobile view. Use Attach output to save the file.",
	UNABLE_OPEN_MOBILE_SHARE: "Unable to open mobile share. Use Attach output to save the file.",
	UNABLE_PREPARE_DOWNLOAD: "Unable to prepare file for download.",
	DOWNLOAD_FAILED: "Download failed. Please try again.",
	NO_DOCUMENT_APPEND: "No document available to append.",
	ANNOTATED_SENT_TO_OUTPUT: "Annotated document sent to Canvas output.",
	CURRENT_SENT_TO_OUTPUT: "Current document sent to Canvas output.",
	ANNOTATED_READY_TO_DOWNLOAD: "Annotated document ready. Click Download to save.",
	FINALIZE_ANNOTATION_FAILED: "Unable to finalize annotations. You can continue annotating or download original file.",
	DOWNLOAD_DISABLED_HINT: "Disable annotation mode to download",
	SEARCH_PLACEHOLDER: "Search text",
	PDF_VIEWER_UNAVAILABLE_PREFIX: "PDF viewer unavailable."
} as const;

// PDF configuration
export const PDF_LOAD_TIMEOUT_MS = 120000; // 2 minutes
export const PDF_JS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// File upload constraints
export const ACCEPTED_FILE_TYPES = "application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff";
