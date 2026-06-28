import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

export async function getRandomWord() {
  const result = await pool.query('SELECT word FROM words ORDER BY RANDOM() LIMIT 1')
  return result.rows[0].word
}

export async function isValidGuess(word) {
  const result = await pool.query(
    'SELECT 1 FROM valid_guesses WHERE word = $1',
    [word.toLowerCase()]
  )
  return result.rows.length > 0
}