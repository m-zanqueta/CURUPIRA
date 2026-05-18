import { useState } from 'react'
import styles from './Dashboard.module.css'

const NAV = [
  { id: 'overview',  label: 'Visão Geral',   icon: '📊' },
  { id: 'turmas',    label: 'Turmas',         icon: '👥' },
  { id: 'missoes',   label: 'Missões',        icon: '🏆' },
  { id: 'relatorio', label: 'Relatórios',     icon: '📈' },
  { id: 'conquistas',label: 'Conquistas',     icon: '🎖️' },
]

const MISSIONS = [
  { name: 'Horta Escolar', turma: 'Todas as turmas', alunos: 92, xp: 150, color: 'green', icon: '🌱', active: true, progress: 68, recompensa: 'Chapéu Jardineiro #67' },
  { name: 'Clube de Leitura',      turma: '2º B', alunos: 18, xp: 100, color: 'yellow', icon: '📖', active: false },
  { name: 'Coral da Escola',       turma: '2º C', alunos: 24, xp: 200, color: 'purple', icon: '🎵', active: false },
  { name: 'Atletismo Comunitário', turma: '2º D', alunos: 15, xp: 120, color: 'red',    icon: '🏃', active: false },
]

const TURMAS = [
  { nome: '2º A', pet: '🐉', estagio: 'Jovem',   xp: 980, progresso: 78, emocao: '😄', cor: '#009D25', cosmetico: true  },
  { nome: '2º B', pet: '🦊', estagio: 'Filhote', xp: 640, progresso: 52, emocao: '😐', cor: '#6A109E', cosmetico: false },
  { nome: '2º C', pet: '🦅', estagio: 'Adulto',  xp: 830, progresso: 91, emocao: '🤩', cor: '#DBB407', cosmetico: true  },
  { nome: '2º D', pet: '🐺', estagio: 'Filhote', xp: 510, progresso: 41, emocao: '😴', cor: '#009D25', cosmetico: false },
]

const RANKING = [
  { name: 'Maria Fernanda', turma: '2º A', xp: 980, pct: 100, initials: 'MF', color: '#009D25' },
  { name: 'João Pedro',     turma: '2º B', xp: 830, pct: 85,  initials: 'JP', color: '#6A109E' },
  { name: 'Letícia S.',     turma: '2º C', xp: 710, pct: 72,  initials: 'LS', color: '#DBB407' },
  { name: 'Carlos R.',      turma: '2º D', xp: 570, pct: 58,  initials: 'CR', color: '#888'    },
]

const BADGES = [
  { label: 'Guardião da Natureza', color: 'green',  icon: '🌿' },
  { label: 'Estrela em Ascensão',  color: 'yellow', icon: '⭐' },
  { label: 'Artista do Coral',     color: 'purple', icon: '🎵' },
  { label: 'Atleta Comunitário',   color: 'green',  icon: '🏃' },
  { label: 'Leitor Voraz',         color: 'yellow', icon: '📚' },
  { label: 'Primeira Missão',      color: 'purple', icon: '🎖️' },
]

const MEDALS = ['🥇', '🥈', '🥉', '4']

export default function Dashboard({ onLogout }) {
  const [activeNav, setActiveNav] = useState('overview')

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="./logo.png" alt="Curupira" className={styles.sidebarLogoImg} />
          <span className={styles.sidebarLogoText}>CURUPIRA</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(item => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeNav === item.id ? styles.navActive : ''}`}
              onClick={() => setActiveNav(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.teacherCard}>
            <div className={styles.teacherAvatar}>P</div>
            <div>
              <div className={styles.teacherName}>Professor</div>
              <div className={styles.teacherRole}>Área do Professor</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={onLogout}>
            ← Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img src="./logo.png" alt="Curupira" className={styles.topBarLogo} />
            <div>
              <h2 className={styles.pageTitle}>Seja bem-vindo(a), Professor(a)! 👋</h2>
              <p className={styles.pageSub}>4 turmas ativas · Semana de {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
            </div>
          </div>
          <button className={styles.btnNew} onClick={() => setActiveNav('missoes')}>
            + Nova Missão
          </button>
        </div>

        {/* Horta Week Banner */}
        <div className={styles.hortaBanner}>
          <div className={styles.hortaBannerLeft}>
            <span className={styles.hortaTag}>🌱 MISSÃO DA SEMANA</span>
            <h3 className={styles.hortaTitle}>Horta Escolar</h3>
            <p className={styles.hortaDesc}>72 alunos participando · Todas as turmas · Encerra em 3 dias</p>
            <div className={styles.hortaProgressWrap}>
              <div className={styles.hortaProgressBar}>
                <div className={styles.hortaProgressFill} style={{ width: '68%' }} />
              </div>
              <span className={styles.hortaProgressLabel}>68% concluído</span>
            </div>
          </div>
          <div className={styles.hortaBannerRight}>
            <div className={styles.recompensaCard}>
              <div className={styles.recompensaLabel}>🎁 Recompensa</div>
              <img src="./chapeu-horta.png" alt="Chapéu Jardineiro #67" className={styles.recompensaImg} />
              <div className={styles.recompensaNome}>Chapéu Jardineiro #67</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          {[
            { label: 'Alunos ativos',         value: '87',  icon: '👥', color: 'green'  },
            { label: 'Missões abertas',        value: '12',  icon: '🏆', color: 'yellow' },
            { label: 'Conquistas entregues',   value: '234', icon: '🎖️', color: 'purple' },
            { label: 'XP distribuído',         value: '4.8k',icon: '⭐', color: 'dark'   },
          ].map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles['icon_' + s.color]}`}>{s.icon}</div>
              <div className={styles.statNum}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pets das Turmas */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Pets das Turmas</div>
          <div className={styles.petsGrid}>
            {TURMAS.map(t => (
              <div key={t.nome} className={styles.petCard}>
                <div className={styles.petHeader}>
                  <span className={styles.petTurma}>{t.nome}</span>
                  <span className={styles.petEmocao}>{t.emocao}</span>
                </div>
                <div className={styles.petAvatar} style={{ borderColor: t.cor }}>
                  <span className={styles.petEmoji}>{t.pet}</span>
                  {t.cosmetico && (
                    <img src="./chapeu-horta.png" alt="chapéu" className={styles.petChapeu} />
                  )}
                </div>
                <div className={styles.petEstagio} style={{ color: t.cor }}>{t.estagio}</div>
                <div className={styles.petXpWrap}>
                  <div className={styles.petXpBar}>
                    <div className={styles.petXpFill} style={{ width: t.progresso + '%', background: t.cor }} />
                  </div>
                  <span className={styles.petXpNum}>{t.xp} XP</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two columns */}
        <div className={styles.grid2}>
          {/* Missions */}
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Missões recentes</div>
            {MISSIONS.map(m => (
              <div key={m.name} className={`${styles.missionRow} ${m.active ? styles.missionActive : ''}`}>
                <div className={`${styles.missionIcon} ${styles['icon_' + m.color]}`}>{m.icon}</div>
                <div className={styles.missionInfo}>
                  <div className={styles.missionName}>
                    {m.name}
                    {m.active && <span className={styles.activePill}>ativa</span>}
                  </div>
                  <div className={styles.missionMeta}>{m.turma} · {m.alunos} alunos</div>
                  {m.active && (
                    <div className={styles.missionProgressWrap}>
                      <div className={styles.missionProgressBar}>
                        <div className={styles.missionProgressFill} style={{ width: m.progress + '%' }} />
                      </div>
                      <span className={styles.missionProgressTxt}>{m.progress}%</span>
                    </div>
                  )}
                </div>
                <div className={styles.xpBadge}>+{m.xp} XP</div>
              </div>
            ))}
          </div>

          {/* Ranking */}
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Ranking da semana</div>
            {RANKING.map((r, i) => (
              <div key={r.name} className={styles.rankRow}>
                <div className={styles.rankMedal}>{MEDALS[i]}</div>
                <div className={styles.rankAvatar} style={{ background: r.color }}>{r.initials}</div>
                <div className={styles.rankInfo}>
                  <div className={styles.rankName}>{r.name}</div>
                  <div className={styles.rankClass}>{r.turma}</div>
                </div>
                <div className={styles.rankBarWrap}>
                  <div className={styles.rankBar} style={{ width: r.pct + '%', background: r.color }} />
                </div>
                <div className={styles.rankXp}>{r.xp}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Conquistas desbloqueadas esta semana</div>
          <div className={styles.badgeRow}>
            {BADGES.map(b => (
              <span key={b.label} className={`${styles.badge} ${styles['badge_' + b.color]}`}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
