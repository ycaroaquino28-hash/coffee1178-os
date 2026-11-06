# Entrada pública do cardápio e entrada da mesa

## Causa

Antes, qualquer URL que abrisse o aplicativo inicializava o SDK Supabase. Se havia sessão anônima persistida, `start_customer_session` era chamada com token nulo e recuperava a mesa daquela sessão. Assim, o link genérico da bio podia mostrar uma mesa usada anteriormente, como Mesa 02.

## Correção de frontend

- `https://coffee1178-autoatendimento.netlify.app/` é somente consulta: exibe produtos, fotografias e preços; não mostra mesa, carrinho, controles de adicionar ou histórico de pedidos.
- A entrada pública retorna antes de importar o SDK, ler a autenticação persistida ou chamar RPCs. Parâmetros de marketing e `?mesa=2` não ativam pedidos.
- `/pedido?t=TOKEN` continua o acesso por QR, com a validação existente no servidor.
- Links de QR antigos na forma `/?t=TOKEN` continuam funcionando; a URL é normalizada para `/pedido` e o token é retirado do histórico, como antes.
- `/pedido` é a área explícita de atendimento. Depois de validar o QR, recarregar essa área continua a visita já validada e permite acompanhar os pedidos.
- Abrir a entrada pública não faz logout nem apaga a sessão/carrinho pendente persistido do atendimento. Isso evita encerrar uma visita ativa em outra aba.

Nenhuma mudança no banco, RPCs, autenticação do servidor, configuração Supabase, preços, fotografias, mapeamentos, criação de pedidos ou Coffee 1178 OS. Essa separação não representa detecção de presença física: a autorização da área de pedidos continua sendo feita pelo token/sessão existente.

## Testes

- Dois testes de decisão de entrada: URL pública e parâmetros de marketing/número de mesa não entram em pedidos; rota explícita/QR entram no fluxo de validação existente.
- Navegador móvel com sessão simulada válida da Mesa 02: QR e refresh de `/pedido` continuam na Mesa 02; abrir a raiz em outra aba mostra somente Cardápio, sem SDK, leitura de Auth, pedidos ou controles de compra; não encerra a visita ativa.
- As suítes de carrinho e timeline permanecem válidas; regressão móvel do atendimento por QR executada sem modificar dados reais.

Para a bio, compartilhar somente o domínio raiz acima. Não compartilhar a rota de pedidos nem URLs com `t=`.
