import { useState, useEffect } from 'react'
import { Image, View } from 'react-native'
import { supabase } from '../services/supabase'
import { listarAcessoriosLoja } from '../services/storage'

const BUCKET = 'pets-images'
const PASTA  = 'icones-ui'

function Neutro({ size, style }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 4, backgroundColor: 'rgba(255,255,255,0.3)' }, style]} />
}

// Ícone fixo vindo do Supabase Storage: pets-images/icones-ui/<nome>.png
export function iconeUIUrl(nome) {
  return supabase.storage.from(BUCKET).getPublicUrl(`${PASTA}/${nome}.png`).data.publicUrl
}

export default function IconeUI({ nome, size = 40, style }) {
  const [erro, setErro] = useState(false)
  if (erro) return <Neutro size={size} style={style} />
  return (
    <Image
      source={{ uri: iconeUIUrl(nome) }}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      onError={() => setErro(true)}
    />
  )
}

// Catálogo carregado uma única vez e compartilhado por todos os ícones
let cacheAcessorios = null
function carregarAcessorios() {
  if (!cacheAcessorios) {
    cacheAcessorios = listarAcessoriosLoja().catch(() => { cacheAcessorios = null; return [] })
  }
  return cacheAcessorios
}

// Ícone = imagem de um acessório sorteado do banco.
// slot: 'chapeu' | 'colar' | 'fundo'  (sem slot, sorteia entre todos)
export function IconeAcessorio({ slot, size = 40, style }) {
  const [uri, setUri] = useState(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarAcessorios().then(itens => {
      const pool = (itens || []).filter(i => i.imagem && (!slot || i.slot === slot))
      if (vivo && pool.length) setUri(pool[Math.floor(Math.random() * pool.length)].imagem)
    })
    return () => { vivo = false }
  }, [slot])

  if (!uri || erro) return <Neutro size={size} style={style} />
  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      onError={() => setErro(true)}
    />
  )
}