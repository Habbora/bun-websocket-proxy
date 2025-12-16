import { WebsocketProxy, WebsocketServer } from "./websocket";

const server = new WebsocketServer({
    hostname: 'localhost',
    port: 8081,
})

server.on('message', (data, message) => {
    server.send(data.sessionId, message)
})

const proxy = new WebsocketProxy({
    hostname: 'localhost',
    port: 8080,
    observer: 'ws://localhost:8082',
}).route('/ocpp/cve-pro/:id', 'ws://localhost:8081/ocpp/:id')

proxy.onOpenClient((client) => {
    console.log('open client:', client.url)
})

proxy.onCloseClient((client) => {
    console.log('close client:', client.url)
})

proxy.onOpenConnection((client) => {
    console.log('open connection:', client.url)
})

proxy.onCloseConnection((client) => {
    console.log('close connection:', client.url)
})

proxy.onNewMessage(async ({ direction, sessionId, message }) => {
    console.log('new message', direction, sessionId, message)
})