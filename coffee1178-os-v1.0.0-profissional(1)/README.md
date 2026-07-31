# Coffee 1178 OS — v1.0.0

Sistema profissional de comandas da Coffee 1178.

## Incluído nesta versão

- Login individual por PIN
- Perfis: administrador, garçom, cozinha e caixa
- Mesas sincronizadas
- Produtos e comandas
- Painel da cozinha
- Fechamento e pagamento
- Ton com confirmação manual
- Relatórios e auditoria
- Supabase Realtime
- PWA instalável
- Cache do aplicativo
- Fila offline para novos pedidos e solicitações de fechamento

## Publicar no GitHub

Envie todos os arquivos e pastas deste projeto para a raiz do repositório.

## Conectar ao Netlify

1. Importe o repositório do GitHub.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Crie estas variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

A URL é a URL base do projeto, sem `/rest/v1/`.

## PINs iniciais do banco já criado

- Administrador: 1234
- Garçom: 5678
- Cozinha: 2468
- Caixa: 1357

Troque-os após o primeiro teste.

## Offline

A interface e o último estado carregado permanecem disponíveis sem internet.
Novos pedidos e solicitações de fechamento feitos offline são guardados no aparelho e enviados quando a internet voltar.
Mudanças de cozinha, cancelamentos e pagamentos exigem conexão para evitar conflitos financeiros.
