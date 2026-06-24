/// <reference types="powerapps-component-framework" />
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { DocumentViewerComponent } from "./components/viewer/DocumentViewerReact";

export class documentviewer implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private root!: Root;
    private notifyOutputChanged!: () => void;
    private documentBase64Output = "";
    private documentViewerActionOutput = "";
    private lastDocumentSignature = "";
    private lastConfigSignature = "";
    private currentInputDocument = {
        base64Output: "",
        mimeType: "",
        fileName: ""
    };
    private componentRef = React.createRef<{ getAnnotatedBase64: () => Promise<string> }>();

    constructor() {
        // Empty constructor required by PCF runtime.
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        this.container = container;
        context.mode.trackContainerResize(true);
        this.container.classList.add("pcf-document-viewer-root");
        this.root = createRoot(this.container);
        this.updateView(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const rawBase64 = context.parameters.documentBase64.raw || "";
        const rawMimeType = context.parameters.documentMimeType.raw || "";
        const rawFileName = context.parameters.documentFileName.raw || "";
        const viewerMode = context.parameters.viewerMode.raw || "";
        const showBase64Input = context.parameters.showBase64Input.raw;
        const showUploadButton = context.parameters.showUploadButton.raw;
        const showAttachButton = context.parameters.showAttachButton.raw;
        const showAnnotateButton = context.parameters.showAnnotateButton.raw;
        const showClearMarksButton = context.parameters.showClearMarksButton.raw;
        const showDownloadButton = context.parameters.showDownloadButton.raw;
        const showExpandButton = context.parameters.showExpandButton.raw;
        const showCloseButton = context.parameters.showCloseButton.raw;

        const nextConfig = {
            viewerMode,
            showBase64Input: showBase64Input === null ? true : Boolean(showBase64Input),
            showUploadButton: showUploadButton === null ? true : Boolean(showUploadButton),
            showAttachButton: showAttachButton === null ? true : Boolean(showAttachButton),
            showAnnotateButton: showAnnotateButton === null ? true : Boolean(showAnnotateButton),
            showClearMarksButton: showClearMarksButton === null ? true : Boolean(showClearMarksButton),
            showDownloadButton: showDownloadButton === null ? true : Boolean(showDownloadButton),
            showExpandButton: showExpandButton === null ? true : Boolean(showExpandButton),
            showCloseButton: showCloseButton === null ? true : Boolean(showCloseButton)
        };

        const configSignature = JSON.stringify(nextConfig);
        const documentSignature = `${rawBase64}|${rawMimeType}|${rawFileName}`;

        if (documentSignature !== this.lastDocumentSignature) {
            this.currentInputDocument = {
                base64Output: rawBase64,
                mimeType: rawMimeType,
                fileName: rawFileName
            };
            this.lastDocumentSignature = documentSignature;
        }

        const allocatedWidth = context.mode.allocatedWidth;
        const allocatedHeight = context.mode.allocatedHeight;
        const width = typeof allocatedWidth === "number" && allocatedWidth > 0
            ? `${allocatedWidth}px`
            : "100%";
        const height = typeof allocatedHeight === "number" && allocatedHeight > 0
            ? `${allocatedHeight}px`
            : "100%";

        console.log("[PCF-documentviewer] Rendering component to fill available space");

        const element = React.createElement(DocumentViewerComponent, {
            ref: this.componentRef,
            config: nextConfig,
            input: this.currentInputDocument,
            callbacks: {
                onBase64Change: (base64, action) => {
                    this.documentBase64Output = base64 || "";
                    this.documentViewerActionOutput = action || "";
                    this.notifyOutputChanged();
                }
            },
            width,
            height
        });

        this.root.render(element);

        if (configSignature !== this.lastConfigSignature) {
            this.lastConfigSignature = configSignature;
        }
    }

    public getOutputs(): IOutputs {
        return {
            documentBase64Output: this.documentBase64Output,
            documentViewerActionOutput: this.documentViewerActionOutput
        };
    }

    public destroy(): void {
        this.root.unmount();
    }
}
