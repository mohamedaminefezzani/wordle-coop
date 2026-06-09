import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
})

app.use(cors({ origin: process.env.CLIENT_URL || '*' }))
app.use(express.json())

app.get('/', (req, res) => res.send('OK'))

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('create-room', async ({ username }, callback) => {
    const { createRoom } = await import('./roomManager.js')
    const room = await createRoom(socket.id, username)
    socket.join(room.id)
    callback({ roomId: room.id, room })
  })

  socket.on('join-room', async ({ roomId, username }, callback) => {
    const { getRoom, setRoom } = await import('./roomManager.js')
    const room = await getRoom(roomId)
    if (!room) return callback({ error: 'Room not found' })
    if (room.players.length >= 4) return callback({ error: 'Room is full' })
    if (room.started) return callback({ error: 'Game already started' })

    room.players.push({ id: socket.id, username, ready: false })
    await setRoom(roomId, room)
    socket.join(roomId)
    io.to(roomId).emit('room-updated', room)
    callback({ room })
  })

  socket.on('player-ready', async ({ roomId }) => {
    const { getRoom, setRoom } = await import('./roomManager.js')
    const room = await getRoom(roomId)
    if (!room) return
    const player = room.players.find(p => p.id === socket.id)
    if (player) player.ready = true
    await setRoom(roomId, room)
    io.to(roomId).emit('room-updated', room)
  })

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))