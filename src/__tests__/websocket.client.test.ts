import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { WebsocketClient } from "../websocket/websocket.client";

describe("WebsocketClient", () => {
    const TEST_PORT = 9002;
    let mockServer: any;

    beforeEach(() => {
        // Create a mock WebSocket server
        mockServer = Bun.serve({
            port: TEST_PORT,
            fetch(req, server) {
                if (req.headers.get("upgrade") === "websocket") {
                    server.upgrade(req);
                }
            },
            websocket: {
                open(ws: any) {},
                message(ws: any, message: string) {
                    ws.send(`Echo: ${message}`);
                },
                close(ws: any) {},
            },
        });
    });

    afterEach(() => {
        mockServer?.stop();
    });

    test("should connect successfully", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`);

        const openPromise = new Promise((resolve) => {
            client.once("open", () => resolve("connected"));
        });

        const result = await openPromise;
        expect(result).toBe("connected");
        expect(client.connected).toBe(true);
        client.close();
    });

    test("should send and receive messages", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`);

        await new Promise((resolve) => {
            client.once("open", resolve);
        });

        const messagePromise = new Promise((resolve) => {
            client.once("message", (msg) => resolve(msg));
        });

        client.send("Hello");

        const received = await messagePromise;
        expect(received).toBe("Echo: Hello");
        client.close();
    });

    test("should support protocols", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`, "ocpp1.6");

        const openPromise = new Promise((resolve) => {
            client.once("open", () => resolve("connected"));
        });

        await openPromise;
        expect(client.connected).toBe(true);
        client.close();
    });

    test("should support array of protocols", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`, ["ocpp1.6", "ocpp2.0"]);

        const openPromise = new Promise((resolve) => {
            client.once("open", () => resolve("connected"));
        });

        await openPromise;
        expect(client.connected).toBe(true);
        client.close();
    });

    test("should emit close event when connection closes", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`);

        await new Promise((resolve) => {
            client.once("open", resolve);
        });

        const closePromise = new Promise((resolve) => {
            client.once("close", () => resolve("closed"));
        });

        client.close();

        const result = await closePromise;
        expect(result).toBe("closed");
        expect(client.connected).toBe(false);
    });

    test("should not send messages when not connected", async () => {
        const client = new WebsocketClient(`ws://localhost:${TEST_PORT}`);

        await new Promise((resolve) => {
            client.once("open", resolve);
        });

        client.close();
        await new Promise(resolve => setTimeout(resolve, 100));

        // This should not throw
        client.send("This should not be sent");
        expect(client.connected).toBe(false);
    });

    test("should handle connection to invalid URL", async () => {
        const client = new WebsocketClient(`ws://localhost:9999`); // Invalid port

        const errorPromise = new Promise((resolve) => {
            client.once("close", () => resolve("error"));
            client.once("error", () => resolve("error"));
        });

        const result = await errorPromise;
        expect(result).toBe("error");
        expect(client.connected).toBe(false);
    });
});
