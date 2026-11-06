# Acompanhamento do pedido — frontend de staging

Branch: `cliente-autoatendimento-staging-preview`. Preview: https://coffee1178-autoatendimento-preview.netlify.app/

Implementação somente no cliente; banco, schema, RLS, RPCs e Coffee 1178 OS não foram alterados.

## Comportamento

- Timeline por pedido: Pedido recebido → Preparando → Pronto para servir → Entregue.
- `sent`, `preparing`, `ready` e `delivered` destacam somente a etapa correspondente; as anteriores recebem check de conclusão. Em delivered, a última etapa também recebe check.
- Entregue: “Pedido entregue. Aproveite seu momento na Coffee 1178.”
- Cancelado: “Pedido cancelado. Consulte nossa equipe.”
- `closed` é apresentado como Finalizado; closed e cancelled não inventam uma sequência de etapas anteriores que o status isolado não comprova.
- Cada cartão contém número, itens, observações e total confirmado. Cada pedido tem seu próprio status, mesmo quando há vários pedidos da mesma sessão.
- Após a resposta de sucesso da RPC de criação, o novo cartão já aparece como Pedido recebido e o carrinho é fechado para apresentar o acompanhamento. Quantidades, observações, preços, payload, validações e idempotência da criação permanecem intactos. Erros continuam mantendo o carrinho para conferência/reenvio seguro.
- Um pedido confirmado não desaparece quando termina uma consulta iniciada antes da criação: a confirmação local é preservada até a leitura segura retornar aquele ID. Esse estado temporário não é persistido nem permite consultar outros pedidos.

## Atualização automática e acesso

É mantida exclusivamente a RPC `get_customer_orders`, com a autenticação/sessão existente. Não foi adicionado SELECT de orders, assinatura global de Realtime, parâmetro de mesa ou acesso privilegiado.

Intervalo normal: **5000 ms depois da conclusão da consulta anterior**, no máximo uma chamada simultânea. Em condições normais, aproximadamente 12 chamadas por minuto por página ativa; não foi realizado benchmark de carga do Supabase. Em segundo plano e offline o timer pausa; ao voltar, consulta novamente. Falhas transitórias usam 10, 20 e até 30 segundos entre tentativas; uma leitura bem-sucedida retorna ao intervalo de 5 segundos. Erro de sessão mantém a invalidação já existente.

A região de acompanhamento anuncia atualizações com aria-live polite; etapas usam lista ordenada e aria-current. Cartões idênticos não são recriados a cada consulta. As cores vêm das variáveis existentes das áreas Cafeteria/House. Imagens, fotografias, nomes de produtos, preços, QR e configuração de staging foram preservados.

## Verificações

- `node tests/customer-core.test.mjs`: 16 testes de regressão passaram, incluindo carrinho, limites, mapeamentos, preços, idempotência e status labels.
- `node tests/customer-tracking.test.mjs`: 6 testes passaram para etapas, estados finais, itens/notas/total, escaping, resposta antiga após criação e pedidos independentes.
- `python tests/browser_clean_preview.py`: regressões móveis com toque, fotos, frase, carrinho, duplicidade e sobreposições passaram com SDK simulado.
- `python tests/browser_order_tracking.py`: duas interfaces reais em navegadores locais, OS original intacto e cliente móvel, conectadas a um servidor mock compartilhado. As mudanças foram feitas pelos botões do OS: sent → preparing → ready → delivered. O cliente acompanhou sem recarregar, mantendo os outros pedidos independentes. Atualizações observadas em aproximadamente 5 segundos; a primeira levou 6,32 segundos por haver uma resposta atrasada intencionalmente em andamento. Confirmação imediata do envio, cancelamento, contraste House, atraso de 6,2 segundos sem sobreposição e pausa/retomada offline/segundo plano passaram.

## Teste real de staging — pendência explícita

O teste das duas interfaces acima usa API simulada e NÃO comprova a sessão real do cliente ou o login de operador no Supabase. Não foram alterados status nem dados no banco para simular um resultado real.

O acesso HTTP público voltou a funcionar ao liberar rede no executor, mantendo o proxy e TLS. Para o teste autenticado exigido no OS staging são necessários a URL completa já provisionada da Mesa 01 e acesso de operador staging. Sem essas credenciais/sessões, não contornamos o PIN, não elevamos o cliente a operador e não criamos sessões de operador pelo banco.

`tests/browser_tracking_public.py` executa somente verificações estáticas no site publicado, sem token, login, criação de pedido ou mudança de status. O teste autenticado real precisa ser concluído separadamente: manter a tela do cliente aberta com o QR da Mesa 01, avançar as etapas no OS staging e verificar a timeline em até aproximadamente 5 segundos após cada consulta, sem atualizar a página.
