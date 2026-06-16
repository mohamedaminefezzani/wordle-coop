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
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
})

app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/', (req, res) => res.send('OK'))

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('create-room', async ({ username }, callback) => {
    try {
      const { createRoom } = await import('./roomManager.js')
      const room = await createRoom(socket.id, username)
      socket.join(room.id)
      callback({ roomId: room.id, room })
    } catch (err) {
      console.error('create-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('join-room', async ({ roomId, username }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      console.log('join-room attempt:', roomId, username)
      const room = await getRoom(roomId)
      console.log('room found:', room)
      if (!room) return callback({ error: 'Room not found' })
      if (room.players.length >= 4) return callback({ error: 'Room is full' })
      if (room.started) return callback({ error: 'Game already started' })

      room.players.push({ id: socket.id, username, ready: false })
      await setRoom(roomId, room)
      socket.join(roomId)
      io.to(roomId).emit('room-updated', room)
      callback({ room })
    } catch (err) {
      console.error('join-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('rejoin-room', async ({ roomId, username }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return callback({ error: 'Room not found' })

      const player = room.players.find(p => p.username === username)
      if (player) {
        // Only update socket id, preserve everything else including ready state
        player.id = socket.id
      } else {
        if (room.players.length >= 4) return callback({ error: 'Room is full' })
        room.players.push({ id: socket.id, username, ready: false })
      }

      await setRoom(roomId, room)
      socket.join(roomId)
      // Broadcast to everyone including the rejoining player
      io.to(roomId).emit('room-updated', room)
      callback({ room })
    } catch (err) {
      console.error('rejoin-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('player-ready', async ({ roomId, username }) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return
      const player = room.players.find(p => p.username === username)
      if (player) player.ready = true
      await setRoom(roomId, room)
      io.to(roomId).emit('room-updated', room)
    } catch (err) {
      console.error('player-ready error:', err)
    }
  })

  socket.on('leave-room', async ({ roomId, username }) => {
    try {
      const { getRoom, setRoom, deleteRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return
      room.players = room.players.filter(p => p.username !== username)
      socket.leave(roomId)
      if (room.players.length === 0) {
        await deleteRoom(roomId)
      } else {
        await setRoom(roomId, room)
        io.to(roomId).emit('room-updated', room)
      }
    } catch (err) {
      console.error('leave-room error:', err)
    }
  })

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))