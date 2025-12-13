import { EventEmitter } from "events";
export declare class WebsocketClient extends EventEmitter {
    private readonly url;
    private readonly protocols?;
    private ws;
    private isConnected;
    constructor(url: string, protocols?: string | string[] | undefined);
    private connect;
    send(message: string): void;
    close(): void;
    get connected(): boolean;
}
