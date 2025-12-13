import { expect, test } from "bun:test"

test("import from src root exposes classes", async () => {
  const mod = await import("../../src/index.ts")
  expect(typeof mod.WebsocketClient).toBe("function")
  expect(typeof mod.WebsocketServer).toBe("function")
  expect(typeof mod.WebsocketProxy).toBe("function")
})

test("import from src subpath exposes classes", async () => {
  const mod = await import("../../src/websocket/index.ts")
  expect(typeof mod.WebsocketClient).toBe("function")
  expect(typeof mod.WebsocketServer).toBe("function")
  expect(typeof mod.WebsocketProxy).toBe("function")
})

