/**
 * The `qrcode` package ships a browser-specific entry point that has no bundled
 * type declarations. It exposes the same API as the main module but avoids the
 * Node-only code paths (fs, stream), which is what we want in the client bundle.
 */
declare module 'qrcode/lib/browser' {
  const QRCode: typeof import('qrcode');
  export default QRCode;
}
