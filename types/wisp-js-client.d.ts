declare module '@mercuryworkshop/wisp-js/client' {
  export class ClientConnection {
    constructor(wispUrl: string, options?: { wisp_version?: number; wisp_extensions?: unknown[] | null });
    onopen: () => void;
    onclose: () => void;
    onerror: () => void;
    close(): void;
  }
}
