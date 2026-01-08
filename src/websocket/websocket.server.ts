import { EventEmitter } from "events";

export type WsServerProps = {
    hostname: string,
    port: number,
    idleTimeout?: number,
    rootFunction?: (req: Request) => Promise<any | undefined>,
}

export type WsServerData = {
    sessionId: string;
    url: string;
    protocol?: string;
}

export interface WsServerEvents {
    'open': (data: WsServerData) => void
    'message': (data: WsServerData, message: string) => void
    'close': (data: WsServerData, code: number) => void
}

export class WsServer extends EventEmitter {
    private clients: Map<string, Bun.ServerWebSocket<WsServerData>> = new Map()
    private onUpgradeHandler?: UpgradeHandler

    constructor(props: WsServerProps) {
        super()
        Bun.serve({
            hostname: props.hostname,
            port: props.port,
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
                if (props.rootFunction) {
                    const response = await props.rootFunction(req)
                    return response
                }
                return new Response('Not Found', { status: 404 })
            },
            websocket: {
                open: (ws: Bun.ServerWebSocket<WsServerData>) => {
                    this.clients.set(ws.data.sessionId, ws)
                    this.emit('open', ws.data)
                },
                close: (ws: Bun.ServerWebSocket<WsServerData>, code: number) => {
                    this.clients.delete(ws.data.sessionId)
                    this.emit('close', ws.data, code)
                },
                message: (ws: Bun.ServerWebSocket<WsServerData>, message: string) => {
                    this.emit('message', ws.data, message)
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

    public override on<K extends keyof WsServerEvents>(
        event: K,
        listener: WsServerEvents[K]
    ): this {
        return super.on(event, listener)
    }
}

type UpgradeHandler = (data: {
    sessionId: string
    url: string
    protocol?: string
}) => Promise<void>