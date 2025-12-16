import { EventEmitter } from "events"
import { WebsocketServer, WebsocketClient } from "."
import type { WebsocketProxyClientHandler, WebsocketProxyMessageHandler, WsServerData } from "./websocket"

export type WebsocketProxyProps = {
    hostname: string,
    port: number,
    observer: string,
}

export class WebsocketProxy extends EventEmitter {
    private server: WebsocketServer
    private targets = new Map<string, string>()
    private clients = new Map<string, WebsocketClient>()
    private observer = new Map<string, WebsocketClient>()

    private onOpenClientHandlers: WebsocketProxyClientHandler[] = []
    private onCloseClientHandlers: WebsocketProxyClientHandler[] = []
    private onOpenConnectionHandlers: WebsocketProxyClientHandler[] = []
    private onCloseConnectionHandlers: WebsocketProxyClientHandler[] = []
    private onNewMessageHandlers: WebsocketProxyMessageHandler[] = []

    constructor(private readonly props: WebsocketProxyProps) {
        super();

        this.server = new WebsocketServer({
            hostname: this.props.hostname,
            port: this.props.port,
            idleTimeout: 255,
        }).on('open', async (data) => {
            await Promise.all(this.onOpenClientHandlers.map(handler => handler(data)))
        }).on('close', async (data, code, reason) => {
            await Promise.all(this.onCloseClientHandlers.map(handler => handler(data)))
        }).on("message", async (data: WsServerData, message: string | ArrayBuffer) => {
            await Promise.all(this.onNewMessageHandlers.map(handler => handler({
                direction: 'client',
                sessionId: data.sessionId,
                message,
            })))
            this.clients.get(data.sessionId)?.send(message)
        }).onUpgrade(async (ctx) => {
            if (!await this.onUpgrade(ctx)) throw new Error('Unauthorized')
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

            const [routePath] = [routeUrl.pathname, routeUrl.search]
            const [inputPath, inputSearch] = [inputUrl.pathname, inputUrl.search]
            const [targetPath] = [targetUrl.pathname, targetUrl.search]

            const routeParts = routePath!.split('/').filter(Boolean)
            const pathParts = inputPath!.split('/').filter(Boolean)
            const targetParts = targetPath!.split('/').filter(Boolean)

            if (pathParts.length !== routeParts.length)
                return { match: false }

            const isMatch = routeParts.every((part, index) => part === pathParts[index] || part.startsWith(':'))
            if (!isMatch) return { match: false }

            const params: Record<string, string> = {}

            routeParts.forEach((part, index) => {
                if (part.startsWith(':')) params[part] = pathParts[index]!
            })

            const targetParams = targetParts.map(part => params[part] || part)
            const output = targetUrl.origin + '/' + targetParams.join('/') + inputSearch

            return { match: true, output }
        } catch (err) {
            console.error(err)
            return { match: false }
        }
    }

    private async createClientProxy({ sessionId, href, protocol }: {
        sessionId: string,
        href: string,
        protocol: string | string[] | undefined,
    }) {
        const client = new WebsocketClient(
            sessionId,
            href,
            protocol
        ).on('open', async () => {
            await Promise.all(this.onOpenConnectionHandlers.map(handler => handler(client)))
        }).on('close', async () => {
            await Promise.all(this.onCloseConnectionHandlers.map(handler => handler(client)))
            this.server.close(sessionId)
        }).on('message', async (event: any) => {
            try {
                await Promise.all(this.onNewMessageHandlers.map(handler => handler({
                    direction: 'server',
                    sessionId,
                    message: event.data
                })))
                this.server.send(sessionId, event.data)
            } catch {}
        })

        this.clients.set(sessionId, client)
    }

    private async createObserverProxy({ sessionId, href, protocol }: {
        sessionId: string,
        href: string,
        protocol: string | string[] | undefined,
    }) {
        const observer = new WebsocketClient(
            sessionId,
            href,
            protocol
        ).on('open', async () => {
        }).on('close', async () => {
        }).on('message', async (event: any) => {
        })

        this.observer.set(sessionId, observer)
    }

    private async onUpgrade(data: WsServerData) {
        const target = Array.from(this.targets.keys()).find((route) => {
            const routeUrl = new URL(route, 'http://localhost')
            const inputUrl = new URL(data.url)
            const routeParts = routeUrl.pathname!.split('/').filter(Boolean)
            const pathParts = inputUrl.pathname!.split('/').filter(Boolean)
            if (pathParts.length !== routeParts.length) return
            if (routeParts.every((part, index) => part === pathParts[index] || part.startsWith(':'))) return true
        })
        if (!target) return
        const { output } = WebsocketProxy.matchRouter({ route: target, input: data.url, target: this.targets.get(target)! })
        if (!output) return
        this.createClientProxy({ sessionId: data.sessionId, href: output!, protocol: data.protocol })
        return true
    }

    public onOpenClient(handler: WebsocketProxyClientHandler) {
        this.onOpenClientHandlers.push(handler)
    }

    public onCloseClient(handler: WebsocketProxyClientHandler) {
        this.onCloseClientHandlers.push(handler)
    }

    public onOpenConnection(handler: WebsocketProxyClientHandler) {
        this.onOpenConnectionHandlers.push(handler)
    }

    public onCloseConnection(handler: WebsocketProxyClientHandler) {
        this.onCloseConnectionHandlers.push(handler)
    }

    public onNewMessage(handler: WebsocketProxyMessageHandler) {
        this.onNewMessageHandlers.push(handler)
    }

    /**
     * @param route     /intelbras'
     * @param target    ws://localhost:8081/ocpp/
     * @returns         WebsocketProxy
     */
    public route(route: string, target: string): this {
        this.targets.set(route, target)
        return this
    }

    /**
     * @param route     /intelbras'
     * @returns         WebsocketProxy
     */
    public unroute(route: string): this {
        this.targets.delete(route)
        return this
    }
}


