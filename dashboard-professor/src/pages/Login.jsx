import { useState } from 'react'
import styles from './Login.module.css'

export default function Login({ onLogin }) {
  const [screen, setScreen] = useState('login') // 'login' | 'forgot' | 'sent'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      setError('Preencha e-mail e senha para continuar.')
      return
    }
    setError('')
    onLogin()
  }

  function handleForgot(e) {
    e.preventDefault()
    if (!resetEmail) {
      setError('Informe seu e-mail institucional.')
      return
    }
    setError('')
    setScreen('sent')
  }

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.logoWrap}>
          <img src="./logo.png" alt="Logo Curupira" className={styles.logoImg} />
        </div>
        <p className={styles.logoTagline}>Atividades extracurriculares gamificadas</p>
        <ul className={styles.features}>
          <li><span className={styles.dot} style={{ background: 'var(--green)' }}>✓</span> Acompanhe o progresso dos alunos</li>
          <li><span className={styles.dot} style={{ background: 'var(--yellow)', color: '#333' }}>✓</span> Crie missões e recompensas</li>
          <li><span className={styles.dot} style={{ background: 'var(--purple)' }}>✓</span> Engaje turmas com rankings</li>
        </ul>
      </div>

      <div className={styles.right}>

        {screen === 'login' && (
          <>
            <h2 className={styles.title}>Bem-vindo(a) de volta!</h2>
            <p className={styles.subtitle}>Portal exclusivo para professores</p>
            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>E-mail institucional</label>
              <input className={styles.input} type="email" placeholder="seu@escola.edu.br" value={email} onChange={e => setEmail(e.target.value)} />
              <label className={styles.label}>Senha</label>
              <input className={styles.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.forgotRow}>
                <button type="button" className={styles.forgotLink} onClick={() => { setError(''); setScreen('forgot') }}>
                  Esqueci minha senha
                </button>
              </div>
              <button type="submit" className={styles.btnLogin}>Entrar na plataforma →</button>
            </form>
            <p className={styles.footer}>Plataforma exclusiva para escolas parceiras.</p>
          </>
        )}

        {screen === 'forgot' && (
          <>
            <button className={styles.backBtn} onClick={() => { setError(''); setScreen('login') }}>← Voltar</button>
            <h2 className={styles.title}>Recuperar senha</h2>
            <p className={styles.subtitle}>Informe seu e-mail institucional e enviaremos um link para redefinir sua senha.</p>
            <form onSubmit={handleForgot} className={styles.form}>
              <label className={styles.label}>E-mail institucional</label>
              <input className={styles.input} type="email" placeholder="seu@escola.edu.br" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className={styles.btnLogin}>Enviar link de recuperação →</button>
            </form>
          </>
        )}

        {screen === 'sent' && (
          <div className={styles.sentWrap}>
            <div className={styles.sentIcon}>📧</div>
            <h2 className={styles.title}>E-mail enviado!</h2>
            <p className={styles.subtitle}>
              Enviamos um link de recuperação para <strong>{resetEmail}</strong>. Verifique sua caixa de entrada.
            </p>
            <button className={styles.btnLogin} style={{ marginTop: '2rem' }} onClick={() => { setScreen('login'); setResetEmail('') }}>
              Voltar para o login
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
