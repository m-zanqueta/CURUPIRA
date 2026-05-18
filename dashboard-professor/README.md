# 🌳 Curupira — MVP

App de gamificação de atividades extracurriculares.  
Este repositório contém o MVP da **área do professor**: tela de login e dashboard.

## Como rodar localmente

```bash
# 1. Instale as dependências
npm install

# 2. Rode o servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) no navegador.

## Como fazer o build para publicar

```bash
npm run build
```

A pasta `dist/` gerada pode ser publicada no **GitHub Pages**, **Netlify** ou **Vercel**.

### Deploy no GitHub Pages (mais simples)

1. Instale o gh-pages:
   ```bash
   npm install --save-dev gh-pages
   ```

2. Adicione ao `package.json` em `"scripts"`:
   ```json
   "deploy": "gh-pages -d dist"
   ```

3. Rode:
   ```bash
   npm run build && npm run deploy
   ```

## Credenciais de demonstração

Qualquer e-mail + qualquer senha funcionam no MVP.

## Identidade visual

- **Fonte:** Montserrat
- **Verde:** `#009D25`
- **Amarelo:** `#DBB407`
- **Roxo:** `#6A109E`
- **Preto:** `#090C0E`
- **Creme:** `#F5F4D9`
