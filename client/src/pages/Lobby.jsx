import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function Lobby() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [ready, setReady] = useState(false)
  const username = sessionStorage.getItem('username')
  const playerId = sessionStorage.getItem('playerId')

  useEffect(() => {
    socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
      if (error) { navigate('/'); return }
      setRoom(room)
      const me = room?.players.find(p => p.playerId === playerId)
      if (me?.ready) setReady(true)
    })

    socket.on('connect', () => {
      socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
        if (error) { navigate('/'); return }
        setRoom(room)
        const me = room?.players.find(p => p.playerId === playerId)
        if (me?.ready) setReady(true)
      })
    })

    socket.on('room-updated', setRoom)
    socket.on('game-started', () => navigate(`/game/${roomId}`))

    return () => {
      socket.off('connect')
      socket.off('room-updated')
      socket.off('game-started')
    }
  }, [roomId])

  function handleReady() {
    socket.emit('player-ready', { roomId, playerId })
    setReady(true)
  }

  function handleLeave() {
    socket.emit('leave-room', { roomId, playerId })
    sessionStorage.removeItem('username')
    sessionStorage.removeItem('playerId')
    navigate('/')
  }

  function handleStart() {
    socket.emit('start-game', { roomId, playerId }, ({ error }) => {
      if (error) return console.error(error)
      navigate(`/game/${roomId}`)
    })
  }

  const isHost = room?.players[0]?.playerId === playerId
  const allReady = room?.players.length >= 2 && room?.players.every(p => p.ready)

  if (!room) return (
    <p style={{ textAlign: 'center', marginTop: 100, color: '#818384' }}>
      Loading room...
    </p>
  )

  return (
    <div style={{ maxWidth: 380, margin: '60px auto', padding: '0 16px' }}>
      <h1 style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: 6, marginBottom: 4 }}>
        WORDLE
      </h1>
      <p style={{ textAlign: 'center', color: '#818384', fontSize: 13, marginBottom: 28 }}>cooperative</p>

      <div style={{
        background: '#1a1a1b', border: '1px solid #3a3a3c',
        borderRadius: 10, padding: '16px 20px', marginBottom: 20
      }}>
        <p style={{ fontSize: 11, color: '#818384', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
          Room Code
        </p>
        <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: 8, color: 'white' }}>{roomId}</p>
        <p style={{ fontSize: 12, color: '#565758', marginTop: 4 }}>Share this code with your friends</p>
      </div>

      <p style={{ fontSize: 11, color: '#818384', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
        Players ({room.players.length}/4)
      </p>

      <div style={{ marginBottom: 24 }}>
        {room.players.map((p, i) => (
          <div key={p.playerId} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', marginBottom: 6,
            background: '#1a1a1b', border: '1px solid #3a3a3c', borderRadius: 8
          }}>
            <span style={{ fontSize: 15 }}>
              {i === 0 && <span style={{ marginRight: 6 }}>👑</span>}
              {p.username}
              {p.playerId === playerId && (
                <span style={{ color: '#565758', fontSize: 11, marginLeft: 6 }}>(you)</span>
              )}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase',
              color: p.ready ? '#538d4e' : '#565758'
            }}>
              {p.ready ? '✓ Ready' : 'Not ready'}
            </span>
          </div>
        ))}
      </div>

      {!ready && (
        <button onClick={handleReady} style={{ ...btnStyle, background: '#538d4e', marginBottom: 8 }}>
          Ready Up
        </button>
      )}

      {isHost && allReady && (
        <button onClick={handleStart} style={{ ...btnStyle, background: '#b59f3b', marginBottom: 8 }}>
          Start Game
        </button>
      )}

      {!isHost && allReady && ready && (
        <p style={{ textAlign: 'center', color: '#818384', fontSize: 13, marginBottom: 8 }}>
          ⏳ Waiting for host to start...
        </p>
      )}

      <button onClick={handleLeave} style={{
        ...btnStyle, background: 'transparent',
        border: '1px solid #3a3a3c', color: '#818384'
      }}>
        Leave Room
      </button>
    </div>
  )
}

const btnStyle = {
  width: '100%', padding: '13px',
  fontSize: 15, fontWeight: 700,
  color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer',
  letterSpacing: 1, marginBottom: 0
}