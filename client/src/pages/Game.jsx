import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'

const COLORS = {
  green: '#538d4e',
  yellow: '#b59f3b',
  gray: '#3a3a3c',
  empty: '#121213',
  tbd: '#2a2a2c'
}

export default function Game() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const playerId = sessionStorage.getItem('playerId')
  const username = sessionStorage.getItem('username')

  const [room, setRoom] = useState(null)
  const [board, setBoard] = useState([])
  const [currentTurn, setCurrentTurn] = useState(0)
  const [players, setPlayers] = useState([])
  const [guess, setGuess] = useState('')
  const [error, setError] = useState('')
  const [gameOver, setGameOver] = useState(null) // { won, word }

  useEffect(() => {
    // Rejoin socket room in case of refresh
    socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
      if (error) { navigate('/'); return }
      setRoom(room)
      setBoard(room.board || [])
      setCurrentTurn(room.currentTurn || 0)
      setPlayers(room.players || [])
    })

    socket.on('connect', () => {
    // Reconnected — rejoin room and get latest state
    socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
        if (error) { navigate('/'); return }
        setBoard(room.board || [])
        setCurrentTurn(room.currentTurn || 0)
        setPlayers(room.players || [])
    })
    })

    socket.on('board-updated', ({ board, currentTurn, players }) => {
      setBoard(board)
      setCurrentTurn(currentTurn)
      setPlayers(players)
      setError('')
    })

    socket.on('game-over', ({ won, word, board }) => {
      setBoard(board)
      setGameOver({ won, word })
    })

    socket.on('game-started', () => {
      setRoom(room)
      setBoard([])
      setPlayers(room.players || [])
      setGameOver(null)
      setGuess('')
      setError('')
    })

    return () => {
      socket.off('connect')
      socket.off('board-updated')
      socket.off('game-over')
      socket.off('game-started')
    }
  }, [roomId])

  const activePlayer = players[currentTurn % players.length]
  const isMyTurn = activePlayer?.playerId === playerId

  function handleSubmit() {
    if (guess.length !== 5) return setError('Guess must be 5 letters')
    setError('')
    socket.emit('submit-guess', { roomId, playerId, guess }, ({ error }) => {
      if (error) return setError(error)
      setGuess('')
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  function handlePlayAgain() {
    socket.emit('start-game', {roomId, playerId, username}, ({room, error}) => {
      if (error) return setError(error)
    
    setGameOver(null)
    setGuess('')
    setError('')
    })
  }

  // Build display rows — 6 total
  const rows = Array(6).fill(null).map((_, i) => board[i] || null)

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', fontFamily: 'sans-serif', color: 'white' }}>
      <h2 style={{ textAlign: 'center' }}>Room: {roomId}</h2>

      {/* Turn indicator */}
      {!gameOver && (
        <p style={{ textAlign: 'center', color: '#aaa', marginBottom: 16 }}>
          {isMyTurn
            ? '🟢 Your turn!'
            : `⏳ Waiting for ${activePlayer?.username}...`}
        </p>
      )}

      {/* Players */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {players.map((p, i) => {
          const isActive = players[currentTurn % players.length]?.playerId === p.playerId
          return (
            <span key={p.playerId} style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 13,
              background: isActive ? '#538d4e' : '#333',
              color: 'white',
              fontWeight: isActive ? 'bold' : 'normal'
            }}>
              {i === 0 ? '👑 ' : ''}{p.username}
            </span>
          )
        })}
      </div>

      {/* Board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', marginBottom: 24 }}>
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', gap: 6 }}>
            {Array(5).fill(null).map((_, colIdx) => {
              const letter = row?.guess[colIdx] || ''
              const color = row ? COLORS[row.result[colIdx]] : COLORS.empty
              return (
                <div key={colIdx} style={{
                  width: 56, height: 56,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 'bold',
                  background: color,
                  border: `2px solid ${row ? color : '#3a3a3c'}`,
                  borderRadius: 4,
                  color: 'white',
                  textTransform: 'uppercase'
                }}>
                  {letter}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Input */}
      {!gameOver && isMyTurn && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={guess}
            onChange={e => setGuess(e.target.value.toUpperCase().slice(0, 5))}
            onKeyDown={handleKeyDown}
            placeholder="Type your guess"
            maxLength={5}
            autoFocus
            style={{
              flex: 1, padding: '10px 14px', fontSize: 18,
              background: '#1a1a1b', color: 'white',
              border: '2px solid #3a3a3c', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: 4
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              padding: '10px 16px', fontSize: 16,
              background: '#538d4e', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer'
            }}
          >
            Submit
          </button>
        </div>
      )}

      {error && <p style={{ color: '#ff4444', textAlign: 'center', marginTop: 8 }}>{error}</p>}

      {/* Game over */}
      {gameOver && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <h2>{gameOver.won ? '🎉 You won!' : '😞 Game over'}</h2>
          <p style={{ color: '#aaa' }}>The word was <strong style={{ color: 'white' }}>{gameOver.word.toUpperCase()}</strong></p>
          <button
            onClick={handlePlayAgain}
            style={{
              marginTop: 16, padding: '12px 24px',
              background: '#538d4e', color: 'white',
              border: 'none', borderRadius: 4,
              fontSize: 16, cursor: 'pointer'
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  )
}