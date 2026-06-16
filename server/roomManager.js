import { Redis } from '@upstash/redis'
import dotenv from 'dotenv'
dotenv.config()

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
})

const TTL = 60 * 60 * 2 // 2 hours

export async function createRoom(socketId, username, playerId) {
  const roomId = Math.random().toString(36).slice(2, 8).toUpperCase()
  const room = {
    id: roomId,
    players: [{ socketId, username, playerId, ready: false }],
    started: false,
    currentTurn: 0,
    board: [],
    word: null
  }
  await setRoom(roomId, room)
  return room
}

export async function setRoom(roomId, room) {
  await redis.set(`room:${roomId}`, JSON.stringify(room), { ex: TTL })
}

export async function getRoom(roomId) {
  const data = await redis.get(`room:${roomId}`)
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data
}

export async function deleteRoom(roomId) {
  await redis.del(`room:${roomId}`)
}