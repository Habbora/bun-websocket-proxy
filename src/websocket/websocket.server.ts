import { EventEmitter } from "events";
import type { WsServerData } from "./websocket";

export type WebSocketServerProps = {
    hostname: string,
    port: number,
}

export class WebsocketServer extends EventEmitter {
    private clients: Map<string, Bun.ServerWebSocket<WsServerData>> = new Map();

    constructor(props: WebSocketServerProps) {
        super()

        Bun.serve({
            hostname: props.hostname,
            port: props.port,
            fetch: async (req, server) => {
                this.emit('fetch', req)

                if (req.headers.get('upgrade') === 'websocket') {
                    const sessionId = Bun.randomUUIDv7()
                    const route = req.url
                    const protocol = req.headers.get('sec-websocket-protocol') || undefined
                    const authorization = req.headers.get('authorization') || undefined
                    const userAgent = req.headers.get('user-agent') || undefined

                    server.upgrade(req, {
                        data: { sessionId, route, protocol, authorization, userAgent }
                    })

                    this.emit('upgrade', { sessionId, route, protocol, authorization, userAgent })
                }
            },
            websocket: {
                open: (ws: Bun.ServerWebSocket<WsServerData>) => {
                    const data = ws.data;
                    this.clients.set(data.sessionId, ws);
                    this.emit('open', data);
                },
                message: (ws: Bun.ServerWebSocket<WsServerData>, message: string) => {
                    const data = ws.data;
                    this.emit('message', data, message);
                },
                close: (ws: Bun.ServerWebSocket<WsServerData>) => {
                    const { sessionId } = ws.data;
                    this.clients.delete(sessionId);
                    this.emit('close', sessionId);
                },
            },
        });
    }

    connect(sessionId: string) {
        
    }

    send(sessionId: string, message: string) {
        this.clients.get(sessionId)?.send(message);
    }

    close(sessionId: string) {
        this.clients.get(sessionId)?.close();
    }
}
