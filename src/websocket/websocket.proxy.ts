import { EventEmitter } from "events"
import { WsServer, WsClient, WsServerData } from "."
import type { WebsocketProxyClientHandler, WebsocketProxyMessageHandler } from "./websocket"

export const MessageDirection = {
    UPSTREAM: 'upstream',
    DOWNSTREAM: 'downstream'
} as const

export type MessageDirection = typeof MessageDirection[keyof typeof MessageDirection]

export type TextMessage = {
    type: 'text'
    data: string
}

export type BinaryMessage = {
    type: 'binary'
    data: ArrayBuffer
}

export type Message = TextMessage | BinaryMessage

export const createMessage = (data: string | ArrayBuffer): Message => {
    return typeof data === 'string'
        ? { type: 'text', data }
        : { type: 'binary', data }
}

/**
 * Metadata extensível com tipos conhecidos
 */
export type MessageMetadata = {
    timestamp?: number
    userId?: string
    authenticated?: boolean
    routeParams?: Record<string, string>
    [key: string]: unknown
}

/**
 * Contexto base (não usar diretamente)
 */
interface BaseMessageContext<T extends Message = Message> {
    sessionId: string
    direction: MessageDirection
    message: T
    metadata: MessageMetadata
}

/**
 * Contexto upstream (cliente → servidor)
 */
export interface UpstreamMessageContext<T extends Message = Message>
    extends BaseMessageContext<T> {
    direction: typeof MessageDirection.UPSTREAM
}

/**
 * Contexto downstream (servidor → cliente)
 */
export interface DownstreamMessageContext<T extends Message = Message>
    extends BaseMessageContext<T> {
    direction: typeof MessageDirection.DOWNSTREAM
}

export type MessageContext<T extends Message = Message> =
    | UpstreamMessageContext<T>
    | DownstreamMessageContext<T>

export type NextFunction = () => Promise<void>

export type Middleware<TContext extends MessageContext = MessageContext> = (
    context: TContext,
    next: NextFunction
) => Promise<void> | void

export interface ProxyEvents {
    'client:connected': (data: WsServerData) => void
    'client:disconnected': (data: WsServerData, code: number) => void
    'client:message': (context: UpstreamMessageContext) => void

    'upstream:connected': (data: { sessionId: string, url: string, protocol?: string | string[] }) => void
    'upstream:disconnected': (data: { sessionId: string, url: string, protocol?: string | string[] }, code: number) => void
    'upstream:message': (context: DownstreamMessageContext) => void
}

export type WebsocketProxyProps = {
    hostname: string,
    port: number,
    rootFunction?: (req: Request) => Promise<any | undefined>,
}

export type RouteConfig = {
    pattern: string,
    target: string,
    metadata?: Record<string, any>,
}

export class WsProxy extends EventEmitter {
    private server!: WsServer
    private routes = new Map<string, string>()
    private upstreams = new Map<string, WsClient>()
    private middlewares: WebsocketProxyClientHandler[] = []

    constructor(private readonly props: WebsocketProxyProps) {
        super()
        this.setupServer()
    }

    /**
     *  Configuração Interna do Servidor WebSocket
     */

    private async setupServer(): Promise<void> {
        this.server = new WsServer({
            hostname: this.props.hostname,
            port: this.props.port,
            idleTimeout: 255,
            rootFunction: this.props.rootFunction,
        }).on('open', async (data) => {
            this.emit('client:connected', data)
        }).on('close', async (data, code) => {
            this.emit('client:disconnected', data, code)
        }).on("message", async (data: WsServerData, message: string | ArrayBuffer) => {
            const ctx: UpstreamMessageContext = {
                sessionId: data.sessionId,
                direction: MessageDirection.UPSTREAM,
                message: createMessage(message),
                metadata: {},
            }
            this.emit('client:message', ctx)
            this.upstreams.get(data.sessionId)?.send(message)
        }).onUpgrade(async (ctx) => {
            if (!await this.onUpgrade(ctx)) throw new Error('Unauthorized')
        })
    }

    private async createUpstreamConnection({ sessionId, href, protocol, metadata }: {
        sessionId: string,
        href: string,
        protocol: string | string[] | undefined,
        metadata?: MessageMetadata,
    }) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'))
            }, 10000)
            const upstream = new WsClient(sessionId, href, protocol)
                .on('open', () => {
                    clearTimeout(timeout)
                    this.emit('upstream:connected', { sessionId, url: href, protocol })
                    resolve(upstream)
                })
                .on('close', (code) => {
                    this.upstreams.delete(sessionId)
                    this.server.close(sessionId)
                    this.emit('upstream:disconnected', { sessionId, url: href, protocol }, code)
                })
                .on('message', async (event) => {
                    const ctx: DownstreamMessageContext = {
                        sessionId,
                        direction: MessageDirection.DOWNSTREAM,
                        message: createMessage(event),
                        metadata: {},
                    }
                    this.emit('upstream:message', ctx)
                })

            this.upstreams.set(sessionId, upstream)
        })
    }

    /**
     * @param route ex.: /ws/:id
     * @param input ex.: wss://habbora.com.br/ws/123
     * @param target ex.: wss://target.com.br/ws/:id
     * @returns { match: boolean, output?: string }
     */
    private static matchRouter = ({ route, input, target }: {
        route: string,
        input: string,
        target: string,
    }): { match: boolean, output?: string } => {
        try {
            const routeUrl = new URL(route, 'http://localhost')
            const inputUrl = new URL(input)
            const targetUrl = new URL(target)

            const routeParts = routeUrl.pathname.split('/').filter(Boolean)
            const pathParts = inputUrl.pathname.split('/').filter(Boolean)
            const targetParts = targetUrl.pathname.split('/').filter(Boolean)

            if (pathParts.length !== routeParts.length) {
                return { match: false }
            }

            const isMatch = routeParts.every((part, index) => part === pathParts[index] || part.startsWith(':'))
            if (!isMatch) return { match: false }

            const params: Record<string, string> = {}
            routeParts.forEach((part, index) => {
                if (part.startsWith(':')) {
                    params[part] = pathParts[index]!
                }
            })

            const targetParams = targetParts.map(part => params[part] || part)
            const output = targetUrl.origin + '/' + targetParams.join('/') + inputUrl.search

            return { match: true, output }
        } catch (err) {
            console.error(err)
            return { match: false }
        }
    }

    /**
     * Find a route that matches the input url
     * @param url       wss://habbora.com.br/ws/123
     * @returns         /ws/:id
     */
    private findRoute(url: string): string | undefined {
        return Array.from(this.routes.keys()).find((route) => {
            const routeUrl = new URL(route, 'http://localhost')
            const inputUrl = new URL(url)
            const routeParts = routeUrl.pathname!.split('/').filter(Boolean)
            const pathParts = inputUrl.pathname!.split('/').filter(Boolean)
            if (pathParts.length !== routeParts.length) return
            if (routeParts.every((part, index) => part === pathParts[index] || part.startsWith(':'))) return true
        })
    }

    private async onUpgrade(data: WsServerData): Promise<boolean> {
        const route = this.findRoute(data.url)
        if (!route) return false

        const { output } = WsProxy.matchRouter({
            route,
            input: data.url,
            target: this.routes.get(route)!
        })

        if (!output) return false

        try {
            await this.createUpstreamConnection({
                sessionId: data.sessionId,
                href: output!,
                protocol: data.protocol
            })
            return true
        } catch (error) {
            console.error('[Proxy] Failed to create upstream connection:', error)
            return false
        }
    }

    /**
     * Add a new route to the proxy
     * @param route     /intelbras'
     * @param target    ws://localhost:8081/ocpp/
     * @returns         WebsocketProxy
     */
    public route(route: string, target: string): this {
        this.routes.set(route, target)
        return this
    }

    /**
     * Remove a route from the proxy
     * @param route     /intelbras'
     * @returns         WebsocketProxy
     */
    public unroute(route: string): this {
        this.routes.delete(route)
        return this
    }

    /**
     * Override the on method to add type checking
     */

    public override on<K extends keyof ProxyEvents>(
        event: K,
        listener: ProxyEvents[K]
    ): this {
        return super.on(event, listener)
    }

    public override once<K extends keyof ProxyEvents>(
        event: K,
        listener: ProxyEvents[K]
    ): this {
        return super.once(event, listener)
    }

    public override emit<K extends keyof ProxyEvents>(
        event: K,
        ...args: Parameters<ProxyEvents[K]>
    ): boolean {
        return super.emit(event, ...args)
    }
}


