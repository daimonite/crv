import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("Proxy CORS Handling", () => {
  it("returns 204 with CORS headers for OPTIONS on /api/marketplace/:path*", async () => {
    const req = new NextRequest("http://localhost:3000/api/marketplace/products", {
      method: "OPTIONS",
      headers: {
        origin: "http://tauri.localhost",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, PATCH, PUT, DELETE, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
  });

  it("returns 204 with CORS headers for OPTIONS on /api/subscription/:path*", async () => {
    const req = new NextRequest("http://localhost:3000/api/subscription/status", {
      method: "OPTIONS",
      headers: {
        origin: "http://tauri.localhost",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, PATCH, PUT, DELETE, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
  });

  it("attaches CORS headers to GET requests on /api/marketplace/:path*", async () => {
    const req = new NextRequest("http://localhost:3000/api/marketplace/products", {
      method: "GET",
      headers: {
        origin: "http://tauri.localhost",
      },
    });

    const res = await proxy(req);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, PATCH, PUT, DELETE, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
  });
});
