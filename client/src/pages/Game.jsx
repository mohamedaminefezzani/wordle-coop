import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'

// ─── Constants ───────────────────────────────────────────────────────────────

const TILE_COLORS = {
  green:  { bg: '#538d4e', border: '#538d4e' },
  yellow: { bg: '#b59f3b', border: '#b59f3b' },
  gray:   { bg: '#3a3a3c', border: '#3a3a3c' },
  empty:  { bg: '#121213', border: '#3a3a3c' },
  tbd:    { bg: '#121213', border: '#565758' },
}

const KEY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

const FLIP_DURATION = 250   // ms per half-flip
const FLIP_STAGGER  = 350   // ms between each tile in a row

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message }) {
  if (!message) return null
  return (
    <div
      className="toast"
      style={{
        position: 'fixed', top: 70, left: '50%',
        transform: 'translateX(-50%)',
        background: 'white', color: '#121213',
        padding: '10px 20px', borderRadius: 6,
        fontWeight: 700, fontSize: 14,
        zIndex: 100, pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  )
}

// ─── Tile ─────────────────────────────────────────────────────────────────────
//
// Each tile manages its own two-phase flip independently.
// Phase 1 (flip-front): tile rotates from 0° → -90°  (disappears)
// At the halfway point the color is swapped to the revealed color.
// Phase 2 (flip-back):  tile rotates from +90° → 0°  (reappears with new color)
//
// This guarantees the color is NEVER visible before the halfway point.

function Tile({ letter, colorKey, animate, animDelay }) {
  const [phase, setPhase]       = useState('idle')   // 'idle' | 'front' | 'back'
  const [displayColor, setDisplayColor] = useState('empty')
  const timerRef = useRef(null)

  // When animate turns true, kick off the flip sequence
  useEffect(() => {
    if (!animate) {
      // No animation — just show the color immediately (e.g. past rows on rejoin)
      setPhase('idle')
      setDisplayColor(colorKey)
      return
    }

    // Clear any previous timers
    clearTimeout(timerRef.current)

    // Start in unflipped state with no color
    setPhase('idle')
    setDisplayColor('tbd')

    // After stagger delay, begin phase 1
    timerRef.current = setTimeout(() => {
      setPhase('front')

      // Halfway through phase 1 → swap to revealed color
      timerRef.current = setTimeout(() => {
        setDisplayColor(colorKey)
        setPhase('back')
      }, FLIP_DURATION)
    }, animDelay)

    return () => clearTimeout(timerRef.current)
  }, [animate, colorKey, animDelay])

  const { bg, border } = TILE_COLORS[displayColor] || TILE_COLORS.empty

  return (
    <div
      className={
        phase === 'front' ? 'tile-flip-front' :
        phase === 'back'  ? 'tile-flip-back'  : ''
      }
      style={{
        width: 54, height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 800,
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: 4,
        color: 'white',
        textTransform: 'uppercase',
        // Perspective needed on the element itself for rotateX to look 3D
        perspective: '250px',
        willChange: 'transform',
      }}
    >
      {letter}
    </div>
  )
}

// ─── Main Game component ──────────────────────────────────────────────────────

export default function Game() {
  const { roomId }  = useParams()
  const navigate    = useNavigate()
  const playerId    = sessionStorage.getItem('playerId')
  const username    = sessionStorage.getItem('username')

  const [board, setBoard]               = useState([])
  const [currentTurn, setCurrentTurn]   = useState(0)
  const [players, setPlayers]           = useState([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [gameOver, setGameOver]         = useState(null)   // { won, word }
  const [toast, setToast]               = useState('')
  const [letterStates, setLetterStates] = useState({})     // { A: 'green', ... }
  const [shakingRow, setShakingRow]     = useState(false)
  // revealingRowIdx: the board row currently animating (-1 = none)
  const [revealingRowIdx, setRevealingRowIdx] = useState(-1)

  const toastTimer = useRef(null)

  // ── helpers ──

  function showToast(msg, duration = 1800) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), duration)
  }

  function triggerShake() {
    setShakingRow(true)
    setTimeout(() => setShakingRow(false), 400)
  }

  function buildLetterStates(board) {
    const priority = { green: 3, yellow: 2, gray: 1 }
    const states = {}
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

  // Total animation time for a full row reveal
  function rowRevealDuration(numTiles = 5) {
    return numTiles * FLIP_STAGGER + FLIP_DURATION * 2
  }

  function syncRoom(room) {
    setBoard(room.board || [])
    setCurrentTurn(room.currentTurn || 0)
    setPlayers(room.players || [])
    setLetterStates(buildLetterStates(room.board || []))
    setRevealingRowIdx(-1)
  }

  // ── socket setup ──

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
      const rowIdx = board.length - 1
      // Update board data immediately — Tile components handle their own animation
      setBoard(board)
      setCurrentTurn(currentTurn)
      setPlayers(players)
      setRevealingRowIdx(rowIdx)

      // After the full row animation finishes, update keyboard colors & clear flag
      setTimeout(() => {
        setLetterStates(buildLetterStates(board))
        setRevealingRowIdx(-1)
      }, rowRevealDuration())
    })

    socket.on('game-over', ({ won, word, board }) => {
      const rowIdx = board.length - 1
      setBoard(board)
      setRevealingRowIdx(rowIdx)

      setTimeout(() => {
        setLetterStates(buildLetterStates(board))
        setRevealingRowIdx(-1)
        setGameOver({ won, word })
        showToast(won ? '🎉 You won!' : `The word was ${word.toUpperCase()}`, 4000)
      }, rowRevealDuration())
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

  // ── input ──

  const activePlayer = players[currentTurn % players.length]
  const isMyTurn     = activePlayer?.playerId === playerId
  const isHost       = players[0]?.playerId === playerId

  const handleKey = useCallback((key) => {
    if (gameOver) return
    if (!isMyTurn) { showToast("It's not your turn!"); return }

    if (key === 'ENTER') {
      if (currentGuess.length !== 5) {
        showToast('Not enough letters')
        triggerShake()
        return
      }
      socket.emit('submit-guess', { roomId, playerId, guess: currentGuess }, ({ error }) => {
        if (error) { showToast(error); triggerShake(); return }
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

  // Physical keyboard listener
  useEffect(() => {
    const onKeyDown = e => handleKey(e.key.toUpperCase())
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

  // ── render ──

  const rows = Array(6).fill(null).map((_, i) => board[i] || null)
  const previewRowIdx = board.length

  return (
    <div style={{
      maxWidth: 420, margin: '0 auto',
      padding: '12px 8px', userSelect: 'none',
    }}>
      <Toast message={toast} />

      {/* Header */}
      <div style={{
        textAlign: 'center',
        borderBottom: '1px solid #3a3a3c',
        paddingBottom: 10, marginBottom: 10,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: 5 }}>WORDLE COOP</h1>
      </div>

      {/* Players */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        gap: 6, marginBottom: 8, flexWrap: 'wrap',
      }}>
        {players.map((p, i) => {
          const isActive = !gameOver &&
            players[currentTurn % players.length]?.playerId === p.playerId
          return (
            <span key={p.playerId} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 12,
              background: isActive ? '#538d4e' : '#1a1a1b',
              border: `1px solid ${isActive ? '#538d4e' : '#3a3a3c'}`,
              color: isActive ? 'white' : '#818384',
              fontWeight: isActive ? 700 : 400,
              transition: 'background 0.2s, border-color 0.2s',
            }}>
              {i === 0 ? '👑 ' : ''}{p.username}{p.playerId === playerId ? ' (you)' : ''}
            </span>
          )
        })}
      </div>

      {/* Turn indicator */}
      {!gameOver && (
        <p style={{ textAlign: 'center', color: '#818384', fontSize: 13, marginBottom: 10 }}>
          {isMyTurn
            ? '🟢 Your turn — type your guess'
            : `⏳ ${activePlayer?.username}'s turn`}
        </p>
      )}

      {/* Board */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: 5, alignItems: 'center', marginBottom: 12,
      }}>
        {rows.map((row, rowIdx) => {
          const isPreviewRow = !row && rowIdx === previewRowIdx && isMyTurn && !gameOver
          const isAnimating  = rowIdx === revealingRowIdx

          return (
            <div
              key={rowIdx}
              className={isPreviewRow && shakingRow ? 'shake' : ''}
              style={{ display: 'flex', gap: 5 }}
            >
              {Array(5).fill(null).map((_, colIdx) => {
                let letter   = ''
                let colorKey = 'empty'
                let animate  = false

                if (row) {
                  letter   = row.guess[colIdx]
                  colorKey = row.result[colIdx]   // 'green' | 'yellow' | 'gray'
                  animate  = isAnimating
                } else if (isPreviewRow) {
                  letter   = currentGuess[colIdx] || ''
                  colorKey = letter ? 'tbd' : 'empty'
                }

                return (
                  <Tile
                    key={colIdx}
                    letter={letter}
                    colorKey={colorKey}
                    animate={animate}
                    animDelay={colIdx * FLIP_STAGGER}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Who guessed each row */}
      {board.length > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          {board.map((row, i) => (
            <span key={i} style={{ fontSize: 11, color: '#565758', marginRight: 8 }}>
              Row {i + 1}:{' '}
              <span style={{ color: '#818384' }}>{row.username}</span>
            </span>
          ))}
        </div>
      )}

      {/* Game over panel */}
      {gameOver && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ marginBottom: 10 }}>
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
              ...btnStyle, background: '#538d4e', marginBottom: 8,
            }}>
              Play Again
            </button>
          ) : (
            <p style={{ color: '#818384', fontSize: 13, marginBottom: 8 }}>
              ⏳ Waiting for host to start a new game...
            </p>
          )}

          <button onClick={handleLeave} style={{
            ...btnStyle,
            background: 'transparent',
            border: '1px solid #3a3a3c',
            color: '#818384',
          }}>
            Leave Room
          </button>
        </div>
      )}

      {/* Keyboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {KEY_ROWS.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map(key => {
              const state = letterStates[key]
              const isWide = key === 'ENTER' || key === '⌫'
              const bg =
                state === 'green'  ? '#538d4e' :
                state === 'yellow' ? '#b59f3b' :
                state === 'gray'   ? '#3a3a3c' :
                '#818384'

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
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.3s',
                    flexShrink: 0,
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

const btnStyle = {
  width: '100%', padding: '12px',
  fontSize: 15, fontWeight: 700,
  color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer',
}