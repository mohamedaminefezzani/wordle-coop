import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function Home() {
  const [username, setUsername] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function generatePlayerId() {
    return Math.random().toString(36).slice(2, 10)
  }

  function handleCreate() {
    if (!username.trim()) return setError('Enter a username')
    const playerId = generatePlayerId()
    sessionStorage.setItem('username', username)
    sessionStorage.setItem('playerId', playerId)
    socket.emit('create-room', { username, playerId }, ({ roomId }) => {
      navigate(`/lobby/${roomId}`)
    })
  }

  function handleJoin() {
    if (!username.trim()) return setError('Enter a username')
    if (!roomId.trim()) return setError('Enter a room code')
    const playerId = generatePlayerId()
    sessionStorage.setItem('username', username)
    sessionStorage.setItem('playerId', playerId)
    socket.emit('join-room', { roomId: roomId.toUpperCase(), username, playerId }, ({ room, error }) => {
      if (error) return setError(error)
      navigate(`/lobby/${roomId.toUpperCase()}`)
    })
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleCreate()
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{
        textAlign: 'center', fontSize: 32, fontWeight: 800,
        letterSpacing: 6, marginBottom: 8, color: 'white'
      }}>
        WORDLE
      </h1>
      <p style={{ textAlign: 'center', color: '#818384', marginBottom: 32, fontSize: 14 }}>
        cooperative
      </p>

      <label style={labelStyle}>Username</label>
      <input
        placeholder="Enter your username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        onKeyDown={handleKey}
        style={inputStyle}
        maxLength={16}
        autoFocus
      />

      {error && (
        <p style={{ color: '#ff4444', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      <button onClick={handleCreate} style={{ ...btnStyle, background: '#538d4e' }}>
        Create Room
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#3a3a3c' }} />
        <span style={{ color: '#565758', fontSize: 12, letterSpacing: 1 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: '#3a3a3c' }} />
      </div>

      <label style={labelStyle}>Room Code</label>
      <input
        placeholder="Enter room code"
        value={roomId}
        onChange={e => setRoomId(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
        style={{ ...inputStyle, letterSpacing: 6, textTransform: 'uppercase' }}
        maxLength={6}
      />

      <button onClick={handleJoin} style={{ ...btnStyle, background: '#1a1a1b', border: '2px solid #565758' }}>
        Join Room
      </button>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  letterSpacing: 1, color: '#818384',
  textTransform: 'uppercase', marginBottom: 6
}

const inputStyle = {
  display: 'block', width: '100%',
  padding: '12px 14px', marginBottom: 12,
  fontSize: 16, background: '#1a1a1b',
  color: 'white', border: '2px solid #3a3a3c',
  borderRadius: 6, outline: 'none'
}

const btnStyle = {
  width: '100%', padding: '13px',
  fontSize: 15, fontWeight: 700,
  color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer',
  letterSpacing: 1
}