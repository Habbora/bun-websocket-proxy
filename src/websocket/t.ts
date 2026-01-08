import { EventEmitter } from "events"
import { WsServer, WsClient } from "."
import type { WsServerData } from "./websocket"

// ============================================
// TIPOS BASE FORTEMENTE TIPADOS
// ============================================

/**
 * Direções de mensagem com type branding
 */
export const MessageDirection = {
    UPSTREAM: 'upstream',      // Cliente → Servidor
    DOWNSTREAM: 'downstream'   // Servidor → Cliente
} as const

export type MessageDirection = typeof MessageDirection[keyof typeof MessageDirection]

/**
 * Tipos de mensagem discriminados
 */
export type TextMessage = {
    type: 'text'
    data: string
}

export type BinaryMessage = {
    type: 'binary'
    data: ArrayBuffer
}

export type Message = TextMessage | BinaryMessage

/**
 * Helper para criar mensagens tipadas
 */
export const createMessage = (data: string | ArrayBuffer): Message => {
    return typeof data === 'string'
        ? { type: 'text', data }
        : { type: 'binary', data }
}

// ============================================
// CONTEXTO DE MENSAGEM TIPADO
// ============================================

/**
 * Metadata extensível com tipos conhecidos
 */
export interface MessageMetadata {
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
    drop(): void
}

/**
 * Contexto downstream (servidor → cliente)
 */
export interface DownstreamMessageContext<T extends Message = Message> 
    extends BaseMessageContext<T> {
    direction: typeof MessageDirection.DOWNSTREAM
    drop(): void
}

/**
 * Union discriminada por direction
 */
export type MessageContext<T extends Message = Message> = 
    | UpstreamMessageContext<T>
    | DownstreamMessageContext<T>

/**
 * Type guard para upstream
 */
export const isUpstream = (
    context: MessageContext
): context is UpstreamMessageContext => {
    return context.direction === MessageDirection.UPSTREAM
}

/**
 * Type guard para downstream
 */
export const isDownstream = (
    context: MessageContext
): context is DownstreamMessageContext => {
    return context.direction === MessageDirection.DOWNSTREAM
}

/**
 * Type guard para mensagem de texto
 */
export const isTextMessage = <T extends Message>(
    context: MessageContext<T>
): context is MessageContext<TextMessage> => {
    return context.message.type === 'text'
}

/**
 * Type guard para mensagem binária
 */
export const isBinaryMessage = <T extends Message>(
    context: MessageContext<T>
): context is MessageContext<BinaryMessage> => {
    return context.message.type === 'binary'
}

// ============================================
// TIPOS DE MIDDLEWARE
// ============================================

/**
 * Função next tipada
 */
export type NextFunction = () => Promise<void>

/**
 * Middleware genérico
 */
export type Middleware<TContext extends MessageContext = MessageContext> = (
    context: TContext,
    next: NextFunction
) => Promise<void> | void

/**
 * Middleware apenas para upstream
 */
export type UpstreamMiddleware = Middleware<UpstreamMessageContext>

/**
 * Middleware apenas para downstream
 */
export type DownstreamMiddleware = Middleware<DownstreamMessageContext>

/**
 * Middleware apenas para texto
 */
export type TextMiddleware = Middleware<MessageContext<TextMessage>>

/**
 * Middleware apenas para binário
 */
export type BinaryMiddleware = Middleware<MessageContext<BinaryMessage>>

/**
 * Middleware condicional tipado
 */
export type ConditionalMiddleware<TContext extends MessageContext> = {
    condition: (context: MessageContext) => context is TContext
    middleware: Middleware<TContext>
}

// ============================================
// EVENTOS TIPADOS
// ============================================

export interface ProxyEvents {
    'client:connected': (data: WsServerData) => void
    'client:disconnected': (data: WsServerData) => void
    'upstream:connected': (client: WsClient) => void
    'upstream:disconnected': (client: WsClient) => void
    'client:message': (context: UpstreamMessageContext) => void
    'upstream:message': (context: DownstreamMessageContext) => void
    'message:dropped': (context: MessageContext) => void
    'middleware:error': (error: Error, context: MessageContext) => void
}

// ============================================
// CONFIGURAÇÃO TIPADA
// ============================================

export interface WebsocketProxyConfig {
    hostname: string
    port: number
    idleTimeout?: number
}

export interface RouteConfig {
    pattern: string
    target: string
    metadata?: MessageMetadata
}

// ============================================
// WEBSOCKET PROXY TIPADO
// ============================================

export class WebsocketProxy extends EventEmitter {
    private server: WsServer
    private routes = new Map<string, RouteConfig>()
    private upstreams = new Map<string, WsClient>()
    private middlewares: Middleware[] = []

    constructor(private readonly config: WebsocketProxyConfig) {
        super()
        this.setupServer()
    }

    // ============================================
    // SISTEMA DE MIDDLEWARE TIPADO
    // ============================================

    /**
     * Registra middleware genérico
     */
    public use(middleware: Middleware): this {
        this.middlewares.push(middleware)
        return this
    }

    /**
     * Registra middleware apenas para upstream (tipado!)
     */
    public useUpstream(middleware: UpstreamMiddleware): this {
        return this.use((context, next) => {
            if (isUpstream(context)) {
                return middleware(context, next)
            }
            return next()
        })
    }

    /**
     * Registra middleware apenas para downstream (tipado!)
     */
    public useDownstream(middleware: DownstreamMiddleware): this {
        return this.use((context, next) => {
            if (isDownstream(context)) {
                return middleware(context, next)
            }
            return next()
        })
    }

    /**
     * Registra middleware apenas para texto (tipado!)
     */
    public useText(middleware: TextMiddleware): this {
        return this.use((context, next) => {
            if (isTextMessage(context)) {
                return middleware(context, next)
            }
            return next()
        })
    }

    /**
     * Registra middleware apenas para binário (tipado!)
     */
    public useBinary(middleware: BinaryMiddleware): this {
        return this.use((context, next) => {
            if (isBinaryMessage(context)) {
                return middleware(context, next)
            }
            return next()
        })
    }

    /**
     * Registra middleware condicional com type guard
     */
    public useIf<TContext extends MessageContext>(
        condition: (context: MessageContext) => context is TContext,
        middleware: Middleware<TContext>
    ): this {
        return this.use((context, next) => {
            if (condition(context)) {
                return middleware(context, next)
            }
            return next()
        })
    }

    /**
     * Remove middleware específico
     */
    public removeMiddleware(middleware: Middleware): this {
        const index = this.middlewares.indexOf(middleware)
        if (index > -1) {
            this.middlewares.splice(index, 1)
        }
        return this
    }

    /**
     * Limpa todos os middlewares
     */
    public clearMiddlewares(): this {
        this.middlewares = []
        return this
    }

    // ============================================
    // EVENTOS TIPADOS
    // ============================================

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

    // ============================================
    // ROTEAMENTO TIPADO
    // ============================================

    public route(pattern: string, target: string, metadata?: MessageMetadata): this {
        this.routes.set(pattern, { pattern, target, metadata })
        return this
    }

    public unroute(pattern: string): this {
        this.routes.delete(pattern)
        return this
    }

    // ============================================
    // PROCESSAMENTO DE MENSAGENS
    // ============================================

    private async processMessage(
        sessionId: string,
        direction: MessageDirection,
        rawMessage: string | ArrayBuffer
    ): Promise<void> {
        let dropped = false
        const message = createMessage(rawMessage)

        const context: MessageContext = {
            sessionId,
            direction,
            message,
            metadata: {},
            drop: () => { dropped = true }
        } as MessageContext

        let index = 0
        const executeMiddleware = async (): Promise<void> => {
            if (dropped) return
            if (index >= this.middlewares.length) return

            const middleware = this.middlewares[index++]!
            await middleware(context, executeMiddleware)
        }

        try {
            await executeMiddleware()

            if (!dropped) {
                await this.forwardMessage(sessionId, direction, context.message)
            } else {
                this.emit('message:dropped', context)
            }
        } catch (error) {
            this.emit('middleware:error', error as Error, context)
            console.error('[Proxy] Middleware error:', error)
        }
    }

    private async forwardMessage(
        sessionId: string,
        direction: MessageDirection,
        message: Message
    ): Promise<void> {
        const rawMessage = message.type === 'text' ? message.data : message.data

        try {
            if (direction === MessageDirection.UPSTREAM) {
                const upstream = this.upstreams.get(sessionId)
                if (!upstream) {
                    console.error(`[Proxy] Upstream ${sessionId} not found`)
                    this.server.close(sessionId, 1011, 'Upstream connection lost')
                    return
                }
                upstream.send(rawMessage)
            } else {
                this.server.send(sessionId, rawMessage)
            }
        } catch (error) {
            console.error('[Proxy] Failed to forward message:', error)
            this.server.close(sessionId)
        }
    }

    // ============================================
    // SETUP INTERNO
    // ============================================

    private setupServer(): void {
        this.server = new WsServer({
            hostname: this.config.hostname,
            port: this.config.port,
            idleTimeout: this.config.idleTimeout ?? 255,
        })
        .on('open', (data) => {
            this.emit('client:connected', data)
        })
        .on('close', (data) => {
            const upstream = this.upstreams.get(data.sessionId)
            if (upstream) {
                upstream.close()
                this.upstreams.delete(data.sessionId)
            }
            this.emit('client:disconnected', data)
        })
        .on('message', async (data: WsServerData, message: string | ArrayBuffer) => {
            await this.processMessage(
                data.sessionId,
                MessageDirection.UPSTREAM,
                message
            )
        })
        .onUpgrade(async (ctx) => {
            if (!await this.onUpgrade(ctx)) {
                throw new Error('No route matched or connection failed')
            }
        })
    }

    private async createUpstreamConnection(
        sessionId: string,
        href: string,
        protocol: string | string[] | undefined,
        metadata?: MessageMetadata
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'))
            }, 10000)

            const upstream = new WsClient(sessionId, href, protocol)
                .on('open', () => {
                    clearTimeout(timeout)
                    this.emit('upstream:connected', upstream)
                    resolve()
                })
                .on('error', (err) => {
                    clearTimeout(timeout)
                    reject(err)
                })
                .on('close', () => {
                    this.emit('upstream:disconnected', upstream)
                    this.upstreams.delete(sessionId)
                    this.server.close(sessionId)
                })
                .on('message', async (event: any) => {
                    await this.processMessage(
                        sessionId,
                        MessageDirection.DOWNSTREAM,
                        event.data
                    )
                })

            this.upstreams.set(sessionId, upstream)
        })
    }

    private findRoute(url: string): RouteConfig | null {
        for (const [pattern, config] of this.routes.entries()) {
            const routeUrl = new URL(pattern, 'http://localhost')
            const inputUrl = new URL(url)
            const routeParts = routeUrl.pathname.split('/').filter(Boolean)
            const pathParts = inputUrl.pathname.split('/').filter(Boolean)

            if (pathParts.length !== routeParts.length) continue

            if (routeParts.every((part, index) =>
                part === pathParts[index] || part.startsWith(':')
            )) {
                return config
            }
        }
        return null
    }

    private async onUpgrade(data: WsServerData): Promise<boolean> {
        const routeConfig = this.findRoute(data.url)
        if (!routeConfig) return false

        const { output } = this.matchRoute(
            routeConfig.pattern,
            data.url,
            routeConfig.target
        )

        if (!output) return false

        try {
            await this.createUpstreamConnection(
                data.sessionId,
                output,
                data.protocol,
                routeConfig.metadata
            )
            return true
        } catch (error) {
            console.error('[Proxy] Failed to create upstream connection:', error)
            return false
        }
    }

    private matchRoute(
        route: string,
        input: string,
        target: string
    ): { match: boolean, output?: string } {
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
            console.error('[Proxy] Router match error:', err)
            return { match: false }
        }
    }
}

// ============================================
// MIDDLEWARES PRÉ-CONSTRUÍDOS TIPADOS
// ============================================

/**
 * Logger tipado
 */
export const logger = (name = 'proxy'): Middleware => {
    return async (context, next) => {
        const start = Date.now()
        const preview = context.message.type === 'text'
            ? context.message.data.substring(0, 50)
            : `[Binary ${context.message.data.byteLength} bytes]`

        console.log(`[${name}] ${context.direction} | ${context.sessionId} | ${preview}`)

        await next()

        const duration = Date.now() - start
        console.log(`[${name}] ✓ ${duration}ms`)
    }
}

/**
 * Rate limiter tipado
 */
export const rateLimit = (maxMessages: number, windowMs: number): Middleware => {
    const counts = new Map<string, { count: number, resetAt: number }>()

    return async (context, next) => {
        const now = Date.now()
        const key = `${context.sessionId}:${context.direction}`
        const record = counts.get(key)

        if (!record || now > record.resetAt) {
            counts.set(key, { count: 1, resetAt: now + windowMs })
            await next()
            return
        }

        if (record.count >= maxMessages) {
            console.warn(`[RateLimit] Dropped from ${context.sessionId}`)
            context.drop()
            return
        }

        record.count++
        await next()
    }
}

/**
 * JSON transformer fortemente tipado
 */
export const jsonTransform = <TInput = any, TOutput = any>(
    transformer: (data: TInput) => TOutput
): TextMiddleware => {
    return async (context, next) => {
        try {
            const data = JSON.parse(context.message.data) as TInput
            const transformed = transformer(data)
            context.message.data = JSON.stringify(transformed)
        } catch {
            // Não é JSON válido, passa adiante
        }
        await next()
    }
}

/**
 * Autenticação tipada
 */
export const auth = (
    validateToken: (token: string) => Promise<boolean>
): UpstreamMiddleware => {
    const authenticated = new Set<string>()

    return async (context, next) => {
        if (authenticated.has(context.sessionId)) {
            await next()
            return
        }

        if (context.message.type === 'text') {
            try {
                const data = JSON.parse(context.message.data)
                if (data.type === 'auth' && data.token) {
                    const valid = await validateToken(data.token)
                    if (valid) {
                        authenticated.add(context.sessionId)
                        context.metadata.authenticated = true
                        context.metadata.userId = data.userId
                        context.drop()
                        return
                    }
                }
            } catch {}
        }

        if (!authenticated.has(context.sessionId)) {
            console.warn(`[Auth] Unauthorized: ${context.sessionId}`)
            context.drop()
        } else {
            await next()
        }
    }
}