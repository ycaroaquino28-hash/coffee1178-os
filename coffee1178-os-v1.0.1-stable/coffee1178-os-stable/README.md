# Coffee 1178 OS Stable

Versão sem npm, React ou Vite. O Netlify executa somente `node build-config.mjs`,
gera `config.js` com as duas variáveis públicas do Supabase e publica os arquivos.

## Netlify

- Base directory: `coffee1178-os-stable`
- Build command: `node build-config.mjs`
- Publish directory: `.`
- Functions directory: vazio

Variáveis:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Recursos

- PIN por operador
- Mesas e pedidos
- Cozinha
- Caixa e Ton manual
- Relatórios e auditoria
- Realtime
- PWA
- Cache offline
- Fila offline para pedidos e solicitação de fechamento
