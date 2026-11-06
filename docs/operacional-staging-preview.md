# Coffee 1178 OS — preview operacional de staging

URL: https://coffee1178-autoatendimento-preview.netlify.app/operacional-staging/

Branch de publicação: `cliente-autoatendimento-staging-preview`.
Projeto Netlify: `coffee1178-autoatendimento-preview`, ID `fdc1fbfe-1dd7-4ab6-9956-3bedf1ef3987`.
Esta é uma URL operacional isolada no projeto de testes existente, separada da entrada do cliente. Nenhum novo projeto Netlify foi criado e o projeto operacional de produção não foi modificado.

## Origem e integridade

Arquivos copiados da versão operacional que está publicada: commit `1bf058e76b29f0234b7d6110ae08e7d78142409b`, consultado somente para leitura. Index, manifest e árvore assets são reutilizados por seus blobs/árvore Git originais. `assets/app.js` permanece byte a byte idêntico, blob `46392174f914cf0d709dd53fdc5063884170aa7d`. Nenhuma mudança em lógica operacional, PIN, cozinha, pagamentos, pedidos ou estoque.

A única configuração Supabase desta cópia é a configuração pública de `qjeosulasnnafpnwgimu`, o mesmo projeto staging do autoatendimento. Nenhuma service_role é publicada. A autenticação do cliente já usa storage próprio; a autenticação padrão do SDK do OS nesta origem de staging não compartilha a sessão do cliente.

O service worker fica restrito a `/operacional-staging/`, com cache `coffee1178-operacional-staging-v1`. A limpeza de caches limita-se ao seu prefixo; não limpa caches de outros aplicativos. O manifest original já usa start_url e scope relativos. Os redirects da cópia ficam antes do fallback do cliente.

## Leitura real do staging

Em 2026-11-06:
- Mesa 01: occupied.
- Pedido customer #3: sent, total 1290 centavos.
- Itens: 1 Café Especial 1178 e 1 Café Tradicional, este com observação “Sem coco”.
- Pedido customer #2 também presente: sent, 1 Café Tradicional, total 300 centavos.
- Total aberto observado na mesa: 1590 centavos.

## Testes

1. Backend real de staging: contexto de teste authenticated vinculado temporariamente ao Administrador Staging existente, sem criar operador e sem usar PIN de produção. Conta Auth e operator_session de teste foram criadas dentro de uma única transação, para testar as policies/RPCs existentes.
2. RLS de leitura: Mesa 01, pedido customer, itens e observação acessíveis ao operador.
3. RPC real `set_order_status`: sent → preparing → ready → delivered, com asserções após cada etapa.
4. RPCs reais `request_table_closing` e `close_table_with_payment`: mesa liberada e pedidos fechados.
5. ROLLBACK da transação inteira: mudanças em status, estoque, pagamentos, auditoria e sessões de teste desfeitas. Conferência posterior confirmou Mesa 01 occupied, pedido mais recente sent e ausência da conta/sessão temporária.
6. Chromium móvel com toque: app original, config de staging e snapshot real lido do staging; SDK simulado no navegador por falta de acesso de rede do terminal. Renderização de mesa ocupada, pedido #3, itens, “Sem coco”, cozinha e fechamento pela interface passaram.
7. Hash do app.js verificado. Login real com PIN e conexão Realtime pelo navegador público precisam de conferência manual: o proxy do ambiente continua indisponível. Não afirmamos ter autenticado no site público.

Para uso manual, abrir a URL operacional acima e entrar com o PIN do Administrador Staging já provisionado. Não presumir que PINs de produção funcionem no staging. Manter o cliente em sua URL Mesa 01 no mesmo projeto staging. Nenhuma migration foi aplicada e nenhum dado de produção foi alterado.
