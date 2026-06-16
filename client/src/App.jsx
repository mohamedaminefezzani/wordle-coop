import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Lobby from './pages/Lobby'
import Game from './pages/Game'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:roomId" element={<Lobby />} />
        <Route path="/game/:roomId" element={<Game />} />
      </Routes>
    </BrowserRouter>
  )
}