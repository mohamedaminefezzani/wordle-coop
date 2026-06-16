import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function Lobby() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [ready, setReady] = useState(false)
  const username = sessionStorage.getItem('username')

  useEffect(() => {
    // Always rejoin on mount — works for first load and refresh
    socket.emit('rejoin-room', { roomId, username }, ({ room, error }) => {
      if (error) {
        console.error(error)
        navigate('/')
        return
      }
      setRoom(room)
      // Restore ready state from room
      const me = room?.players.find(p => p.username === username)
      if (me?.ready) setReady(true)
    })

    socket.on('room-updated', (updatedRoom) => {
      setRoom(updatedRoom)
    })

    return () => socket.off('room-updated')
  }, [roomId])

  function handleReady() {
    socket.emit('player-ready', { roomId, username })
    setReady(true)
  }

  function handleLeave() {
    socket.emit('leave-room', { roomId, username })
    sessionStorage.removeItem('username')
    navigate('/')
  }

  const isHost = room?.players[0]?.username === username
  const allReady = room?.players.length >= 2 && room?.players.every(p => p.ready)

  if (!room) return <p style={{ textAlign: 'center', marginTop: 100 }}>Loading room...</p>

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h2>Room: {roomId}</h2>
      <p style={{ color: '#888' }}>Share this code with your friends</p>

      <h3>Players ({room.players.length}/4)</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {room.players.map((p, i) => (
          <li key={p.username} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            {i === 0 && '👑 '}
            {p.username}
            <span style={{ float: 'right', color: p.ready ? 'green' : '#aaa' }}>
              {p.ready ? 'Ready' : 'Not ready'}
            </span>
          </li>
        ))}
      </ul>

      {!ready && (
        <button onClick={handleReady} style={{ ...btnStyle, marginTop: 24 }}>
          Ready up
        </button>
      )}

      {isHost && allReady && (
        <button style={{ ...btnStyle, marginTop: 12, background: 'green', color: 'white' }}>
          Start Game
        </button>
      )}

      <button
        onClick={handleLeave}
        style={{ ...btnStyle, marginTop: 12, background: '#cc0000', color: 'white' }}
      >
        Leave Room
      </button>
    </div>
  )
}

const btnStyle = {
  width: '100%', padding: '12px',
  fontSize: '16px', cursor: 'pointer'
}