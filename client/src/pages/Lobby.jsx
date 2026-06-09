import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import socket from '../socket'

export default function Lobby() {
  const { roomId } = useParams()
  const { state } = useLocation()
  const [room, setRoom] = useState(state?.room)
  const [ready, setReady] = useState(false)
  const username = state?.username

  useEffect(() => {
    socket.on('room-updated', setRoom)
    return () => socket.off('room-updated')
  }, [])

  function handleReady() {
    socket.emit('player-ready', { roomId })
    setReady(true)
  }

  const allReady = room?.players.every(p => p.ready)
  const isHost = room?.players[0]?.id === socket.id

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h2>Room: {roomId}</h2>
      <p style={{ color: '#888' }}>Share this code with your friends</p>

      <h3>Players ({room?.players.length}/4)</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {room?.players.map((p, i) => (
          <li key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
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

      {isHost && allReady && room?.players.length >= 2 && (
        <button style={{ ...btnStyle, marginTop: 12, background: 'green', color: 'white' }}>
          Start Game
        </button>
      )}
    </div>
  )
}

const btnStyle = {
  width: '100%', padding: '12px',
  fontSize: '16px', cursor: 'pointer'
}