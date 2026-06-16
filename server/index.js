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

function safeRoom(room) {
  const { word, ...rest } = room
  return rest
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('create-room', async ({ username, playerId }, callback) => {
    try {
      const { createRoom } = await import('./roomManager.js')
      const room = await createRoom(socket.id, username, playerId)
      socket.join(room.id)
      callback({ roomId: room.id, room: safeRoom(room) })
    } catch (err) {
      console.error('create-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('join-room', async ({ roomId, username, playerId }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return callback({ error: 'Room not found' })
      if (room.players.length >= 4) return callback({ error: 'Room is full' })
      if (room.started) return callback({ error: 'Game already started' })

      room.players.push({ socketId: socket.id, username, playerId, ready: false })
      await setRoom(roomId, room)
      socket.join(roomId)
      io.to(roomId).emit('room-updated', safeRoom(room))
      callback({ room: safeRoom(room) })
    } catch (err) {
      console.error('join-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('rejoin-room', async ({ roomId, playerId, username }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return callback({ error: 'Room not found' })

      const player = room.players.find(p => p.playerId === playerId)
      if (player) {
        player.socketId = socket.id
      } else {
        if (room.players.length >= 4) return callback({ error: 'Room is full' })
        room.players.push({ socketId: socket.id, username, playerId, ready: false })
      }

      await setRoom(roomId, room)
      socket.join(roomId)
      io.to(roomId).emit('room-updated', safeRoom(room))
      callback({ room: safeRoom(room) })
    } catch (err) {
      console.error('rejoin-room error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('player-ready', async ({ roomId, playerId }) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return
      const player = room.players.find(p => p.playerId === playerId)
      if (player) player.ready = true
      await setRoom(roomId, room)
      io.to(roomId).emit('room-updated', safeRoom(room))
    } catch (err) {
      console.error('player-ready error:', err)
    }
  })

  socket.on('leave-room', async ({ roomId, playerId }) => {
    try {
      const { getRoom, setRoom, deleteRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return
      room.players = room.players.filter(p => p.playerId !== playerId)
      socket.leave(roomId)
      if (room.players.length === 0) {
        await deleteRoom(roomId)
      } else {
        await setRoom(roomId, room)
        io.to(roomId).emit('room-updated', safeRoom(room))
      }
    } catch (err) {
      console.error('leave-room error:', err)
    }
  })

  socket.on('start-game', async ({ roomId, playerId }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const { getRandomWord } = await import('./db.js')

      const room = await getRoom(roomId)
      if (!room) return callback({ error: 'Room not found' })
      if (room.players[0].playerId !== playerId) return callback({ error: 'Only host can start' })

      const word = await getRandomWord()
      room.word = word
      room.started = true
      room.currentTurn = 0
      room.board = []
      room.currentGuess = []

      await setRoom(roomId, room)
      io.to(roomId).emit('game-started', { room: safeRoom(room) })
      callback({ room: safeRoom(room) })
    } catch (err) {
      console.error('start-game error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('submit-guess', async ({ roomId, playerId, guess }, callback) => {
    try {
      const { getRoom, setRoom } = await import('./roomManager.js')
      const room = await getRoom(roomId)
      if (!room) return callback({ error: 'Room not found' })

      // Validate it's this player's turn
      const activePlayer = room.players[room.currentTurn % room.players.length]
      if (activePlayer.playerId !== playerId) return callback({ error: 'Not your turn' })

      // Validate guess length
      if (!guess || guess.length !== 5) return callback({ error: 'Guess must be 5 letters' })

      const guessUpper = guess.toUpperCase()
      const wordUpper = room.word.toUpperCase()

      // Evaluate guess — build result array
      const result = evaluateGuess(guessUpper, wordUpper)

      // Append to board
      room.board.push({ guess: guessUpper, result, playerId, username: activePlayer.username })
      room.currentTurn += 1

      const won = guessUpper === wordUpper
      const lost = !won && room.currentTurn >= 6

      if (won || lost) {
        room.started = false
        await setRoom(roomId, room)
        io.to(roomId).emit('game-over', {
          won,
          word: room.word,
          board: room.board
        })
        callback({ result, won, lost })
      } else {
        await setRoom(roomId, room)
        io.to(roomId).emit('board-updated', { board: room.board, currentTurn: room.currentTurn, players: room.players })
        callback({ result })
      }
    } catch (err) {
      console.error('submit-guess error:', err)
      callback({ error: 'Server error' })
    }
  })

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id)
  })
})

function evaluateGuess(guess, word) {
  const result = Array(5).fill('gray')
  const wordArr = word.split('')
  const guessArr = guess.split('')
  const used = Array(5).fill(false)

  // First pass — greens
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === wordArr[i]) {
      result[i] = 'green'
      used[i] = true
      guessArr[i] = null
    }
  }

  // Second pass — yellows
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === null) continue
    for (let j = 0; j < 5; j++) {
      if (!used[j] && guessArr[i] === wordArr[j]) {
        result[i] = 'yellow'
        used[j] = true
        break
      }
    }
  }

  return result
}

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))