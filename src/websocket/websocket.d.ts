export type WsServerData = {
    sessionId: string;
    route: string;
    protocol?: string;
    authorization?: string;
    userAgent?: string;
}