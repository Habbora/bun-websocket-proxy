import { EventEmitter } from "events"
import { WebsocketServer, WebsocketClient } from "."
import type { WsServerData } from "./websocket"

export type WebsocketProxyProps = {
    hostname: string,
    port: number,
}

export class WebsocketProxy extends EventEmitter {
    private server: WebsocketServer
    private targets = new Map<string, string>()
    private clients = new Map<string, WebsocketClient>()
    private proxies = new Map<string, WebsocketClient>()

    constructor(private readonly props: WebsocketProxyProps) {
        super();

        this.server = new WebsocketServer({
            hostname: this.props.hostname,
            port: this.props.port
        })

        this.server.on('request', (req: Request) => {
            this.emit('server:request', req)
        })

        this.server.on('upgrade', (data: WsServerData) => {
            this.emit('server:upgrade', data)
            this.onUpgrade(data)
        })

        this.server.on("message", (data: WsServerData, message: string) => {
            this.emit('server:message', data, message)
            this.onMessage(data, message)
        })
    }

    /**
     * 
     * @param route ex.: /ws/:id
     * @param input ex.: wss://habbora.com.br/ws/123
     * @param target ex.: wss://target.com.br/ws/:id
     * @returns { match: boolean, output?: string }
     */
    static matchRouter = ({ route, input, target }: {
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
        const clientTarget = new WebsocketClient(href, protocol)

        clientTarget.on('open', () => {
            this.emit('client:open', sessionId)
            this.server.connect(sessionId)
        })

        clientTarget.on('close', () => {
            this.emit('client:close', sessionId)
            this.server.close(sessionId)
        })

        clientTarget.on('message', (event: any) => {
            this.emit('client:message', sessionId, event.data)
            this.server.send(sessionId, event.data)
        })

        this.emit('client open', clientTarget)

        this.clients.set(sessionId, clientTarget)
    }

    private async onUpgrade(data: WsServerData) {
        const target = Array.from(this.targets.keys()).find((route) => {
            const routeUrl = new URL(route, 'http://localhost')
            const inputUrl = new URL(data.route)
            const routeParts = routeUrl.pathname!.split('/').filter(Boolean)
            const pathParts = inputUrl.pathname!.split('/').filter(Boolean)
            if (pathParts.length !== routeParts.length) return
            if (routeParts.every((part, index) => part === pathParts[index] || part.startsWith(':'))) return true
        })
        //console.log('target', target)
        if (!target) return

        const { match, output } = WebsocketProxy.matchRouter({ route: target, input: data.route, target: this.targets.get(target)! })
        if (!match) return

        //console.log('output', output)
        this.createClientProxy({ sessionId: data.sessionId, href: output!, protocol: data.protocol })
    }

    private async onMessage(data: WsServerData, message: string) {
        this.clients.get(data.sessionId)?.send(message)
        this.proxies.get(data.sessionId)?.send(message)
    }

    /**
     * 
     * @param route     route('/intelbras', 'ws://localhost:8081/ocpp/)
     * @param target 
     * @returns         WebsocketProxy
     */
    public route(route: string, target: string): this {
        this.targets.set(route, target)
        return this
    }
}
