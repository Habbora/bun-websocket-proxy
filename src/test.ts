import { WsProxy, WsServer } from "./websocket"

// Servidor Teste:
const server = new WsServer({
    hostname: 'localhost',
    port: 8081,
})

server.on('message', (data, message) => {
    server.send(data.sessionId, message)
})

// Proxy
const proxy = new WsProxy({ hostname: 'localhost', port: 3000, })
    .route('/ocpp/cve-pro/:id', 'ws://localhost:8081/ocpp/:id')

proxy.on('client:connected', (data) => {
    console.log('client connected:', data.url)
})

proxy.on('client:disconnected', (data) => {
    console.log('client disconnected:', data.url)
})

proxy.on('client:message', (context) => {
    console.log('client message:', context)
})

proxy.on('client:error', (error, data) => {
    console.log('client error:', error, data)
})

proxy.on('upstream:connected', (client) => {
    console.log('upstream connected:', client.url)
})

proxy.on('upstream:disconnected', (client) => {
    console.log('upstream disconnected:', client.url)
})

proxy.on('upstream:message', (context) => {
    console.log('upstream message:', context)
})

console.log('Proxy server is running on ws://localhost:3000')