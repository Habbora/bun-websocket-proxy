import { EventEmitter } from "events";
export type WebsocketProxyProps = {
    hostname: string;
    port: number;
};
export declare class WebsocketProxy extends EventEmitter {
    private readonly props;
    private server;
    private routes;
    private clients;
    private proxies;
    constructor(props: WebsocketProxyProps);
    /**
     *
     * @param route ex.: /ws/:id
     * @param input ex.: wss://habbora.com.br/ws/123
     * @param target ex.: wss://target.com.br/ws/:id
     * @returns { match: boolean, output?: string }
     */
    static matchRouter: ({ route, input, target }: {
        route: string;
        input: string;
        target: string;
    }) => {
        match: boolean;
        output?: string;
    };
    private createClientProxy;
    private onUpgrade;
    private onMessage;
    /**
     *
     * @param route     route('/intelbras', 'ws://localhost:8081/ocpp/)
     * @param target
     * @returns         WebsocketProxy
     */
    route(route: string, target: string): this;
}
