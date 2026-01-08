import { EventEmitter } from "events"

export interface WsClientEvents {
    'open': () => void
    'message': (message: string | ArrayBuffer) => void
    'close': (code: number) => void
}

export class WsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;

  constructor(
    readonly sessionId: string,
    readonly url: string,
    readonly protocols?: string | string[]
  ) {
    super();
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url, this.protocols)
      
      this.ws.onopen = () => {
        this.isConnected = true
        this.emit("open")
      }

      this.ws.onerror = (event) => {
        this.isConnected = false
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.emit("close", event.code)
      };

      this.ws.onmessage = (event) => {
        this.emit("message", event.data)
      }

    } catch (error) {
    }
  }

  public send(message: string | ArrayBuffer): void {
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

  public override on<K extends keyof WsClientEvents>(
          event: K,
          listener: WsClientEvents[K]
      ): this {
          return super.on(event, listener)
      }
}
