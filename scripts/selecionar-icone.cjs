const fs = require('node:fs')
const path = require('node:path')

const numero = process.argv[2]
if (!['1', '2', '3'].includes(numero)) {
  console.error('Uso: npm run icone:1 | icone:2 | icone:3')
  process.exit(1)
}

const raiz = path.resolve(__dirname, '..')
const origem = path.join(raiz, 'assets', 'app-icon-options', `imagem-${numero}`)
const copias = [
  ['original-1024.png', 'assets/app-icon-selected.png'],
  ['favicon.png', 'public/icons/favicon.png'],
  ['icon-192.png', 'public/icons/icon-192.png'],
  ['icon-512.png', 'public/icons/icon-512.png'],
  ['apple-touch-icon.png', 'public/icons/apple-touch-icon.png'],
]

for (const [arquivoOrigem, arquivoDestino] of copias) {
  fs.copyFileSync(path.join(origem, arquivoOrigem), path.join(raiz, arquivoDestino))
}

console.log(`Imagem ${numero} selecionada para o ícone do app.`)
