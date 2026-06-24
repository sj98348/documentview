/*
*This is auto generated from the ControlManifest.Input.xml file
*/

// Define IInputs and IOutputs Type. They should match with ControlManifest.
export interface IInputs {
    documentBase64: ComponentFramework.PropertyTypes.StringProperty;
    documentMimeType: ComponentFramework.PropertyTypes.StringProperty;
    documentFileName: ComponentFramework.PropertyTypes.StringProperty;
    viewerMode: ComponentFramework.PropertyTypes.StringProperty;
    showBase64Input: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showUploadButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showAttachButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showAnnotateButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showClearMarksButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showDownloadButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showExpandButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
    showCloseButton: ComponentFramework.PropertyTypes.TwoOptionsProperty;
}
export interface IOutputs {
    documentBase64Output?: string;
    documentViewerActionOutput?: string;
}
