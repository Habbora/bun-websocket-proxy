import { describe, test, expect } from "bun:test";
import { WsServer } from "../websocket/websocket.server";

describe("WsServer", () => {
    const BASE_PORT = 9100;
    let counter = 0;
    const nextPort = () => BASE_PORT + (++counter);

    test("should emit open event when client connects", async () => {
        const TEST_PORT = nextPort();
        let openEventData: any = null;

        const server = new WsServer({ hostname: "localhost", port: TEST_PORT });

        server.once("open", (data) => {
            openEventData = data;
        });

        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ocpp/CHARGER`);
        await new Promise(resolve => {
            ws.onopen = resolve;
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(openEventData).not.toBeNull();
        expect(typeof openEventData.sessionId).toBe("string");
        expect(openEventData.url).toContain("/ocpp/CHARGER");
        ws.close();
    });

    test("should capture protocol header", async () => {
        const TEST_PORT = nextPort();
        let capturedData: any = null;

        const server = new WsServer({ hostname: "localhost", port: TEST_PORT });

        server.once("open", (data) => {
            capturedData = data;
        });

        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ocpp/CHARGER`, ["ocpp1.6"]);
        await new Promise(resolve => setTimeout(resolve, 100));
        ws.close();

        expect(capturedData).not.toBeNull();
        expect(capturedData.protocol).toBe("ocpp1.6");
    });

    test("should emit message event when client sends data", async () => {
        const TEST_PORT = nextPort();
        let receivedMessage: string = "";
        let receivedData: any = null;

        const server = new WsServer({ hostname: "localhost", port: TEST_PORT });

        server.once("message", (data, message) => {
            receivedData = data;
            receivedMessage = message;
        });

        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ocpp/CHARGER`);
        await new Promise(resolve => {
            ws.onopen = resolve;
        });

        ws.send("Hello from charger");
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(receivedMessage).toBe("Hello from charger");
        expect(typeof receivedData.sessionId).toBe("string");
        ws.close();
    });

    test("should send message to specific client", async () => {
        const TEST_PORT = nextPort();
        let sessionId: string | undefined;

        const server = new WsServer({ hostname: "localhost", port: TEST_PORT });

        server.once("open", (data) => {
            sessionId = data.sessionId;
        });

        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ocpp/CHARGER`);
        await new Promise(resolve => {
            ws.onopen = resolve;
        });

        const messagePromise = new Promise((resolve) => {
            ws.onmessage = (event) => resolve(event.data);
        });

        if (sessionId) {
            server.send(sessionId, "Hello from server");
        }

        const receivedMessage = await messagePromise;
        expect(receivedMessage).toBe("Hello from server");
        ws.close();
    });

    test("should emit close event when client disconnects", async () => {
        const TEST_PORT = nextPort();
        let closedSessionId: string = "";

        const server = new WsServer({ hostname: "localhost", port: TEST_PORT });

        server.once("close", (data) => {
            closedSessionId = data.sessionId;
        });

        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ocpp/CHARGER`);
        await new Promise(resolve => {
            ws.onopen = resolve;
        });

        ws.close();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(typeof closedSessionId).toBe("string");
    });
});
