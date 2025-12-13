import { EventEmitter } from "events";
export type WebSocketServerProps = {
    hostname: string;
    port: number;
};
export declare class WebsocketServer extends EventEmitter {
    private clients;
    constructor(props: WebSocketServerProps);
    connect(sessionId: string): void;
    send(sessionId: string, message: string): void;
    close(sessionId: string): void;
}
