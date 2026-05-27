import { useState } from 'react'
import Login from './screens/Login'
import Home from './screens/Home'

export default function App() {
  const [logado, setLogado] = useState(false)

  return logado
    ? <Home />
    : <Login onLogin={() => setLogado(true)} />
}