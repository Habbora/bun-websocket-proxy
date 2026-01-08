import { expect, test } from "bun:test"

test("import from src root exposes classes", async () => {
  const mod = await import("../index.js")
  expect(typeof mod.WsClient).toBe("function")
  expect(typeof mod.WsServer).toBe("function")
  expect(typeof mod.WsProxy).toBe("function")
})

test("import from src subpath exposes classes", async () => {
  const mod = await import("../websocket/index.js")
  expect(typeof mod.WebsocketClient).toBe("function")
  expect(typeof mod.WsServer).toBe("function")
  expect(typeof mod.WebsocketProxy).toBe("function")
})

