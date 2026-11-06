import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleApi } from "./http";
import { resumePending } from "./process";

export function sverkoApiPlugin(): Plugin {
  return {
    name: "sverko-api",
    configureServer(server) {
      resumePending();
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        void serve(req, res);
      });
    },
    configurePreviewServer(server) {
      resumePending();
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        void serve(req, res);
      });
    },
  };
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const request = await toRequest(req);
    const response = await handleApi(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Внутренняя ошибка сервера" }));
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const url = `http://${host}${req.url}`;
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}
