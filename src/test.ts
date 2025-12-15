import { WebsocketServer, WebsocketProxy, WebsocketClient } from "./websocket"

console.log('start')

const server1 = new WebsocketServer({ hostname: "localhost", port: 8080, })
server1.on('message', (data, message) => {
    console.log('server1 message', data, message)
    server1.send(data.sessionId, message)
})
const server2 = new WebsocketServer({ hostname: "localhost", port: 8081, })
server2.on('message', (data, message) => {
    console.log('server2 message', data, message)
    server2.send(data.sessionId, message)
})

const proxy = new WebsocketProxy({ hostname: "localhost", port: 8082, })
    .route('/ocpp/:id', 'ws://localhost:8080/:id')
    .route('/ocpp/cve-pro/:id', 'ws://localhost:8081/:id')

proxy.on('fetch', (data, message) => {
    console.log('fetch', data, message)
})

proxy.on('upgrade', (data) => {
    console.log('upgrade', data)
})

proxy.on('server message', (data, message) => {
    console.log('server message', data, message)
})

proxy.on('client message', (sessionId, message) => {
    console.log('client message', sessionId, message)
})



setTimeout(() => {
    const client1 = new WebsocketClient('ws://localhost:8082/ocpp/123')
    client1.on('message', (data) => {
        console.log('client1 message', data)
    })
    const client2 = new WebsocketClient('ws://localhost:8082/ocpp/cve-pro/123')
    client2.on('message', (data) => {
        console.log('client2 message', data)
    })

    setTimeout(() => {
        client1.send('hello server1')
    }, 5000)
    setTimeout(() => {
        client2.send('hello server2')
    }, 5000)
}, 5000)


