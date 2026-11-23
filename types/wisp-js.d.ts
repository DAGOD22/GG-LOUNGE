declare module "@mercuryworkshop/wisp-js/server" {
  import type { Server } from "node:http";
  export const server: {
    options: Record<string, unknown>;
    routeRequest(req: unknown, socket: unknown, head: unknown): void;
    handleRequest(req: unknown, res: unknown): void;
    attach(server: Server, path?: string): Server;
  };
}
