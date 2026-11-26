export const codeFormats = {
  qr: {
    label: "QR code",
    filename: "qr-code",
    placeholder: "Enter text or a URL (up to 2,000 UTF-8 bytes)",
    async render(text) {
      if (new TextEncoder().encode(text).length > 2000) {
        throw new Error("QR code input must be 2,000 UTF-8 bytes or fewer.");
      }
      const { default: QRCode } = await import("qrcode");
      return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
    },
  },
  barcode: {
    label: "Code 128 barcode",
    filename: "barcode",
    placeholder: "Enter up to 80 printable ASCII characters",
    async render(text) {
      if (text.length > 80 || /[^\x20-\x7e]/.test(text)) {
        throw new Error("Use up to 80 printable ASCII characters for a Code 128 barcode.");
      }
      const { default: JsBarcode } = await import("jsbarcode");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, text, { format: "CODE128", width: 2, height: 90, margin: 24 });
      return new XMLSerializer().serializeToString(svg);
    },
  },
};
