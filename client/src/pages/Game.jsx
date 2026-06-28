import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'

const COLORS = {
  green:  { bg: '#538d4e', border: '#538d4e' },
  yellow: { bg: '#b59f3b', border: '#b59f3b' },
  gray:   { bg: '#3a3a3c', border: '#3a3a3c' },
  empty:  { bg: '#121213', border: '#3a3a3c' },
  tbd:    { bg: '#121213', border: '#565758' },
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

// Toast component
function Toast({ message }) {
  if (!message) return null
  return (
    <div className="toast" style={{
      position: 'fixed', top: 80, left: '50%',
      transform: 'translateX(-50%)',
      background: 'white', color: '#121213',
      padding: '10px 20px', borderRadius: 6,
      fontWeight: 700, fontSize: 14,
      zIndex: 100, pointerEvents: 'none',
      whiteSpace: 'nowrap'
    }}>
      {message}
    </div>
  )
}

export default function Game() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const playerId = sessionStorage.getItem('playerId')
  const username = sessionStorage.getItem('username')

  const [board, setBoard] = useState([])
  const [currentTurn, setCurrentTurn] = useState(0)
  const [players, setPlayers] = useState([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [gameOver, setGameOver] = useState(null)
  const [toast, setToast] = useState('')
  const [revealingRow, setRevealingRow] = useState(-1)
  const [letterStates, setLetterStates] = useState({})
  const [shaking, setShaking] = useState(false)
  const toastTimer = useRef(null)

  function showToast(msg, duration = 1500) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), duration)
  }

  function triggerShake() {
    setShaking(true)
    setTimeout(() => setShaking(false), 400)
  }

  // Build letter states from board
  function buildLetterStates(board) {
    const states = {}
    const priority = { green: 3, yellow: 2, gray: 1 }
    board.forEach(row => {
      row.guess.split('').forEach((letter, i) => {
        const color = row.result[i]
        if (!states[letter] || priority[color] > priority[states[letter]]) {
          states[letter] = color
        }
      })
    })
    return states
  }

  function syncRoom(room) {
    setBoard(room.board || [])
    setCurrentTurn(room.currentTurn || 0)
    setPlayers(room.players || [])
    setLetterStates(buildLetterStates(room.board || []))
  }

  useEffect(() => {
    socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
      if (error) { navigate('/'); return }
      syncRoom(room)
    })

    socket.on('connect', () => {
      socket.emit('rejoin-room', { roomId, playerId, username }, ({ room, error }) => {
        if (error) { navigate('/'); return }
        syncRoom(room)
      })
    })

    socket.on('board-updated', ({ board, currentTurn, players }) => {
      setRevealingRow(board.length - 1)
      setTimeout(() => setRevealingRow(-1), 500 * 5 + 200)
      setBoard(board)
      setCurrentTurn(currentTurn)
      setPlayers(players)
      setLetterStates(buildLetterStates(board))
    })

    socket.on('game-over', ({ won, word, board }) => {
      setRevealingRow(board.length - 1)
      setTimeout(() => {
        setRevealingRow(-1)
        setBoard(board)
        setLetterStates(buildLetterStates(board))
        setGameOver({ won, word })
        showToast(won ? '🎉 You won!' : `The word was ${word.toUpperCase()}`, 4000)
      }, 500 * 5 + 200)
    })

    socket.on('game-started', ({ room }) => {
      syncRoom(room)
      setGameOver(null)
      setCurrentGuess('')
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
  const isHost = players[0]?.playerId === playerId

  const handleKey = useCallback((key) => {
    if (gameOver) return
    if (!isMyTurn) {
      showToast("It's not your turn!")
      return
    }

    if (key === 'ENTER') {
      if (currentGuess.length !== 5) {
        showToast('Not enough letters')
        triggerShake()
        return
      }
      socket.emit('submit-guess', { roomId, playerId, guess: currentGuess }, ({ error }) => {
        if (error) {
          showToast(error)
          triggerShake()
          return
        }
        setCurrentGuess('')
      })
      return
    }

    if (key === '⌫' || key === 'BACKSPACE') {
      setCurrentGuess(g => g.slice(0, -1))
      return
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess(g => g + key)
    }
  }, [gameOver, isMyTurn, currentGuess, roomId, playerId])

  // Physical keyboard
  useEffect(() => {
    function onKeyDown(e) {
      handleKey(e.key.toUpperCase())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleKey])

  function handlePlayAgain() {
    socket.emit('start-game', { roomId, playerId }, ({ error }) => {
      if (error) showToast(error)
    })
  }

  function handleLeave() {
    socket.emit('leave-room', { roomId, playerId })
    sessionStorage.removeItem('username')
    sessionStorage.removeItem('playerId')
    navigate('/')
  }

  // Build 6 rows
  const rows = Array(6).fill(null).map((_, i) => board[i] || null)

  // Current guess preview row index
  const previewRowIdx = board.length

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px', userSelect: 'none' }}>
      <Toast message={toast} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid #3a3a3c', paddingBottom: 12, marginBottom: 12
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: 5 }}>WORDLE COOP</h1>
      </div>

      {/* Players row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {players.map((p, i) => {
          const isActive = players[currentTurn % players.length]?.playerId === p.playerId && !gameOver
          return (
            <span key={p.playerId} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 12,
              background: isActive ? '#538d4e' : '#1a1a1b',
              border: `1px solid ${isActive ? '#538d4e' : '#3a3a3c'}`,
              color: isActive ? 'white' : '#818384',
              fontWeight: isActive ? 700 : 400,
              transition: 'all 0.2s'
            }}>
              {i === 0 ? '👑 ' : ''}{p.username}
              {p.playerId === playerId ? ' (you)' : ''}
            </span>
          )
        })}
      </div>

      {/* Turn indicator */}
      {!gameOver && (
        <p style={{ textAlign: 'center', color: '#818384', fontSize: 13, marginBottom: 12 }}>
          {isMyTurn ? '🟢 Your turn — type your guess' : `⏳ ${activePlayer?.username}'s turn`}
        </p>
      )}

      {/* Board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', marginBottom: 16 }}>
        {rows.map((row, rowIdx) => {
          const isPreview = !row && rowIdx === previewRowIdx && isMyTurn && !gameOver
          const isRevealing = rowIdx === revealingRow

          return (
            <div
              key={rowIdx}
              className={isPreview && shaking ? 'shake' : ''}
              style={{ display: 'flex', gap: 5 }}
            >
              {Array(5).fill(null).map((_, colIdx) => {
                let letter = ''
                let colorKey = 'empty'
                let animDelay = 0

                if (row) {
                  letter = row.guess[colIdx]
                  colorKey = isRevealing ? 'tbd' : row.result[colIdx]
                  if (isRevealing) {
                    animDelay = colIdx * 0.5
                  }
                } else if (isPreview) {
                  letter = currentGuess[colIdx] || ''
                  colorKey = letter ? 'tbd' : 'empty'
                }

                const { bg, border } = COLORS[colorKey] || COLORS.empty

                return (
                  <div
                    key={colIdx}
                    className={isRevealing ? 'tile-flip' : ''}
                    style={{
                      width: 54, height: 54,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, fontWeight: 800,
                      background: bg, border: `2px solid ${border}`,
                      borderRadius: 4, color: 'white',
                      textTransform: 'uppercase',
                      animationDelay: isRevealing ? `${colIdx * 0.35}s` : '0s',
                      transition: letter && !row ? 'border-color 0.1s' : 'none'
                    }}
                  >
                    {letter}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Who guessed each row */}
      {board.length > 0 && !gameOver && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          {board.map((row, i) => (
            <span key={i} style={{
              fontSize: 11, color: '#565758', marginRight: 8
            }}>
              Row {i + 1}: <span style={{ color: '#818384' }}>{row.username}</span>
            </span>
          ))}
        </div>
      )}

      {/* Game over panel */}
      {gameOver && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {/* Who guessed what — shown on game over */}
          <div style={{ marginBottom: 12 }}>
            {board.map((row, i) => (
              <div key={i} style={{ fontSize: 12, color: '#565758', marginBottom: 2 }}>
                <span style={{ color: '#818384' }}>{row.username}</span>
                {' — '}
                <span style={{ letterSpacing: 3, color: '#aaa' }}>{row.guess}</span>
              </div>
            ))}
          </div>

          {isHost ? (
            <button onClick={handlePlayAgain} style={{
              padding: '12px 24px', fontSize: 15, fontWeight: 700,
              background: '#538d4e', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              marginBottom: 8, width: '100%'
            }}>
              Play Again
            </button>
          ) : (
            <p style={{ color: '#818384', fontSize: 13, marginBottom: 8 }}>
              ⏳ Waiting for host to start a new game...
            </p>
          )}

          <button onClick={handleLeave} style={{
            padding: '12px 24px', fontSize: 15, fontWeight: 700,
            background: 'transparent', color: '#818384',
            border: '1px solid #3a3a3c', borderRadius: 6,
            cursor: 'pointer', width: '100%'
          }}>
            Leave Room
          </button>
        </div>
      )}

      {/* Keyboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map(key => {
              const state = letterStates[key]
              const isWide = key === 'ENTER' || key === '⌫'
              const bg = state === 'green' ? '#538d4e'
                : state === 'yellow' ? '#b59f3b'
                : state === 'gray' ? '#3a3a3c'
                : '#818384'

              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  style={{
                    width: isWide ? 58 : 34, height: 54,
                    background: bg, color: 'white',
                    border: 'none', borderRadius: 4,
                    fontSize: isWide ? 11 : 14,
                    fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.3s',
                    flexShrink: 0
                  }}
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}