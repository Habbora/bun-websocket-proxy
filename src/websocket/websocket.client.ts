import { EventEmitter } from "events";

export class WebsocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;

  constructor(
    private readonly url: string,
    private readonly protocols?: string | string[]
  ) {
    super();
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url, this.protocols);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit("open");
      };

      this.ws.onerror = (event) => {
        this.isConnected = false;
        //this.emit("error", event);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit("close");
      };

      this.ws.onmessage = (event) => {
        this.emit("message", event)
      };
    } catch (error) {
      //this.emit("error", error);
    }
  }

  public send(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(message);
  }

  public close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  public get connected(): boolean {
    return this.isConnected;
  }
}
