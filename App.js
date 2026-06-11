import { useState } from 'react'
import Login from './screens/Login'
import CriarPerfil from './screens/CriarPerfil'
import LoginProfessor from './screens/LoginProfessor'
import Home from './screens/Home'

export default function App() {
  const [tela, setTela] = useState('login')

  if (tela === 'criarPerfil') {
    return <CriarPerfil onVoltar={() => setTela('login')} />
  }

  if (tela === 'loginProfessor') {
    return (
      <LoginProfessor
        onLogin={() => setTela('home')}
        onSouAluno={() => setTela('login')}
      />
    )
  }

  if (tela === 'home') {
    return <Home />
  }

  return (
    <Login
      onLogin={() => setTela('home')}
      onCriarPerfil={() => setTela('criarPerfil')}
      onSouProfessor={() => setTela('loginProfessor')}
    />
  )
}