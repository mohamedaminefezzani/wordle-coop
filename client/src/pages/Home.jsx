import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function Home() {
  const [username, setUsername] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function handleCreate() {
    if (!username.trim()) return setError('Enter a username')
    sessionStorage.setItem('username', username)
    socket.emit('create-room', { username }, ({ roomId, room }) => {
      navigate(`/lobby/${roomId}`, { state: { room, username } })
    })
  }

  function handleJoin() {
    if (!username.trim()) return setError('Enter a username')
    if (!roomId.trim()) return setError('Enter a room code')
    sessionStorage.setItem('username', username)
    socket.emit('join-room', { roomId: roomId.toUpperCase(), username }, ({ room, error }) => {
      if (error) return setError(error)
      navigate(`/lobby/${roomId.toUpperCase()}`, { state: { room, username } })
    })
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h1>Wordle Coop</h1>

      <input
        placeholder="Your username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        style={inputStyle}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleCreate} style={btnStyle}>
        Create Room
      </button>

      <hr style={{ margin: '24px 0' }} />

      <input
        placeholder="Room code"
        value={roomId}
        onChange={e => setRoomId(e.target.value.toUpperCase())}
        style={inputStyle}
      />

      <button onClick={handleJoin} style={btnStyle}>
        Join Room
      </button>
    </div>
  )
}

const inputStyle = {
  display: 'block', width: '100%', padding: '10px',
  marginBottom: '12px', fontSize: '16px', boxSizing: 'border-box'
}
const btnStyle = {
  width: '100%', padding: '12px',
  fontSize: '16px', cursor: 'pointer'
}