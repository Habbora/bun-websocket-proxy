// @bun
// src/websocket/websocket.client.ts
import { EventEmitter } from "events";

class WebsocketClient extends EventEmitter {
  url;
  protocols;
  ws = null;
  isConnected = false;
  constructor(url, protocols) {
    super();
    this.url = url;
    this.protocols = protocols;
    this.connect();
  }
  connect() {
    try {
      this.ws = new WebSocket(this.url, this.protocols);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit("open");
      };
      this.ws.onerror = (event) => {
        this.isConnected = false;
        this.emit("error", event);
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit("close");
      };
      this.ws.onmessage = (event) => {
        this.emit("message", event.data);
      };
    } catch (error) {
      this.emit("error", error);
    }
  }
  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(message);
  }
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
  get connected() {
    return this.isConnected;
  }
}
// src/websocket/websocket.server.ts
import { EventEmitter as EventEmitter2 } from "events";

class WebsocketServer extends EventEmitter2 {
  clients = new Map;
  constructor(props) {
    super();
    Bun.serve({
      hostname: props.hostname,
      port: props.port,
      fetch: async (req, server) => {
        this.emit("fetch", req);
        if (req.headers.get("upgrade") === "websocket") {
          const sessionId = Bun.randomUUIDv7();
          const route = req.url;
          const protocol = req.headers.get("sec-websocket-protocol") || undefined;
          const authorization = req.headers.get("authorization") || undefined;
          const userAgent = req.headers.get("user-agent") || undefined;
          server.upgrade(req, {
            data: { sessionId, route, protocol, authorization, userAgent }
          });
          this.emit("upgrade", { sessionId, route, protocol, authorization, userAgent });
        }
      },
      websocket: {
        open: (ws) => {
          const data = ws.data;
          this.clients.set(data.sessionId, ws);
          this.emit("open", data);
        },
        message: (ws, message) => {
          const data = ws.data;
          this.emit("message", data, message);
        },
        close: (ws) => {
          const { sessionId } = ws.data;
          this.clients.delete(sessionId);
          this.emit("close", sessionId);
        }
      }
    });
  }
  connect(sessionId) {}
  send(sessionId, message) {
    this.clients.get(sessionId)?.send(message);
  }
  close(sessionId) {
    this.clients.get(sessionId)?.close();
  }
}
// src/websocket/websocket.proxy.ts
import { EventEmitter as EventEmitter3 } from "events";
class WebsocketProxy extends EventEmitter3 {
  props;
  server;
  routes = new Map;
  clients = new Map;
  proxies = new Map;
  constructor(props) {
    super();
    this.props = props;
    this.server = new WebsocketServer({
      hostname: this.props.hostname,
      port: this.props.port
    });
    this.server.on("upgrade", (data) => {
      this.onUpgrade(data);
    });
    this.server.on("message", (data, message) => {
      this.onMessage(data, message);
    });
  }
  static matchRouter = ({ route, input, target }) => {
    try {
      const routeUrl = new URL(route, "http://localhost");
      const inputUrl = new URL(input);
      const targetUrl = new URL(target);
      const [routePath] = [routeUrl.pathname, routeUrl.search];
      const [inputPath, inputSearch] = [inputUrl.pathname, inputUrl.search];
      const [targetPath] = [targetUrl.pathname, targetUrl.search];
      const routeParts = routePath.split("/").filter(Boolean);
      const pathParts = inputPath.split("/").filter(Boolean);
      const targetParts = targetPath.split("/").filter(Boolean);
      if (pathParts.length !== routeParts.length)
        return { match: false };
      const isMatch = routeParts.every((part, index) => part === pathParts[index] || part.startsWith(":"));
      if (!isMatch)
        return { match: false };
      const params = {};
      routeParts.forEach((part, index) => {
        if (part.startsWith(":"))
          params[part] = pathParts[index];
      });
      const targetParams = targetParts.map((part) => params[part] || part);
      const output = targetUrl.origin + "/" + targetParams.join("/") + inputSearch;
      return { match: true, output };
    } catch (err) {
      console.error(err);
      return { match: false };
    }
  };
  async createClientProxy({ sessionId, href, protocol }) {
    const clientTarget = new WebsocketClient(href, protocol);
    clientTarget.on("open", () => {
      this.server.connect(sessionId);
    });
    clientTarget.on("close", () => {
      this.server.close(sessionId);
    });
    clientTarget.on("message", (data) => {
      this.server.send(sessionId, data);
    });
    this.clients.set(sessionId, clientTarget);
  }
  async onUpgrade(data) {
    const routesKeys = Array.from(this.routes.keys());
    routesKeys.forEach((route) => {
      const target = this.routes.get(data.route);
      if (!target)
        return;
      const match = WebsocketProxy.matchRouter({
        route,
        input: data.route,
        target
      });
      if (match.output)
        this.createClientProxy({
          sessionId: data.sessionId,
          href: match.output,
          protocol: data.protocol
        });
    });
  }
  async onMessage(data, message) {
    this.clients.get(data.sessionId)?.send(message);
    this.proxies.get(data.sessionId)?.send(message);
  }
  route(route, target) {
    this.routes.set(route, target);
    return this;
  }
}
export {
  WebsocketServer,
  WebsocketProxy,
  WebsocketClient
};
