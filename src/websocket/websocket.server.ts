import { EventEmitter } from "events";
import type { WsServerData } from "./websocket";

export type WebSocketServerProps = {
    hostname: string,
    port: number,
    idleTimeout?: number,
}

export class WebsocketServer extends EventEmitter {
    private onUpgradeHandler?: UpgradeHandler
    private clients: Map<string, Bun.ServerWebSocket<WsServerData>> = new Map();

    constructor(props: WebSocketServerProps) {
        super()
        Bun.serve({
            hostname: props.hostname,
            port: props.port,
            idleTimeout: props.idleTimeout || 255,
            fetch: async (req, server) => {
                if (req.headers.get('upgrade') === 'websocket') {
                    const protocol = req.headers.get('sec-websocket-protocol') || undefined
                    const ctx = { sessionId: Bun.randomUUIDv7(), url: req.url, protocol }
                    try {
                        await this.onUpgradeHandler?.(ctx)
                        server.upgrade(req, { data: ctx })
                        return
                    } catch {
                        return
                    }
                }
            },
            websocket: {
                open: (ws: Bun.ServerWebSocket<WsServerData>) => {
                    this.clients.set(ws.data.sessionId, ws)
                    this.emit('open', ws.data)
                },
                message: (ws: Bun.ServerWebSocket<WsServerData>, message: string) => {
                    this.emit('message', ws.data, message)
                },
                close: (ws: Bun.ServerWebSocket<WsServerData>, code: number, reason: string) => {
                    this.clients.delete(ws.data.sessionId)
                    this.emit('close', ws.data, code, reason)
                },
                ping: (ws: Bun.ServerWebSocket<WsServerData>, data: Buffer) => {
                    console.log('server ping:', data.toString())
                    ws.pong(data)
                },
                pong: (ws: Bun.ServerWebSocket<WsServerData>, data: Buffer) => {
                    console.log('server pong:', data.toString())
                },
                idleTimeout: 255,
            },
        });
    }

    onUpgrade(handler: UpgradeHandler): this {
        this.onUpgradeHandler = handler
        return this
    }

    send(sessionId: string, message: string | ArrayBuffer) {
        this.clients.get(sessionId)?.send(message);
    }

    close(sessionId: string) {
        this.clients.get(sessionId)?.close();
    }
}

type UpgradeHandler = (data: {
    sessionId: string
    url: string
    protocol?: string
}) => Promise<void>