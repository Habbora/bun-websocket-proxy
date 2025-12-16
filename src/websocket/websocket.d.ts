export type WsServerData = {
    sessionId: string;
    url: string;
    protocol?: string;
}

export type WebsocketProxyClientHandler = (client: WebsocketClient) => void

export type WebsocketProxyMessageHandler = (data: {
    direction: 'client' | 'server',
    sessionId: string,
    message: string | ArrayBuffer,
}) => Promise<void>