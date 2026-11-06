# Autoatendimento Coffee 1178 — implementação preparada

Branch exclusiva: `cliente-autoatendimento`. Sem merge da PR #1, sem alteração de main, sem deploy e sem migrations aplicadas. O app operacional `assets/app.js` foi apenas lido; seu blob permanece `46392174f914cf0d709dd53fdc5063884170aa7d`.

## Arquivos e visual

O frontend usa o `index.html` existente em `coffee1178-os-v1.0.1-stable/coffee1178-os-stable/`, mantendo seu CSS de identidade, nomes, descrições e associações de fotografias. O comportamento foi extraído para `assets/customer-app.mjs`, `customer-core.mjs` e `customer-menu.mjs`; estilos adicionais de formulário ficam em `customer.css`. Os arquivos das fotos não foram modificados. Caffè d’Oro passou de 3490 para **3290** apenas no catálogo visual. Nenhum preço foi escrito no Supabase.

O mapeamento de produtos usa UUIDs lidos do banco. Correspondências ambíguas (composição, sabor ou embalagem) não são habilitadas para envio até conferência. Preços diferentes do banco também bloqueiam o item, sem corrigir seu preço visual automaticamente. O catálogo oficial é consultado por RPC antes de cada novo envio. O backend sempre calcula o total com `products.price_cents`, independentemente do navegador.

Relatório completo: `product-reconciliation.md` e versão estruturada `.json`. São 40 itens visuais únicos: 18 iguais e 22 com nome diferente; não há divergências de preço nem ausências. Os quatro mapeamentos comerciais aprovados (duas Coca-Colas, Suco de Uva em Lata e Leite e Canela) estão conferidos e liberados quando houver sessão válida. Não restam mapeamentos bloqueados por conferência após confirmação do bolo como Calda pelo proprietário. A tortinha foi liberada a pedido do proprietário em 2026-11-06, usando o UUID ativo de Tortinha de Frango, a R$ 7,90. O relatório pode ser regenerado com `node scripts/reconcile-products.mjs`.

## QR → sessão → pedido → operação

1. QR contém `/pedido?t=` seguido de 32 bytes aleatórios em hexadecimal (256 bits). A URL deve usar HTTPS. Nenhum número/UUID de mesa vindo do navegador determina o pedido.
2. SDK Supabase **2.57.4**, mesma versão do app existente, com armazenamento Auth separado (`coffee1178.customer.auth.v1`). Cria sessão anônima somente se houver QR. Não insere nada em `operator_sessions`.
3. `start_customer_session` exige `auth.uid()`, claim assinada `is_anonymous=true` e ausência de operador. Valida SHA-256 do token ativo e associa definitivamente o usuário à primeira mesa/token. QR diferente é rejeitado, inclusive em chamadas concorrentes. Só retorna número/nome da mesa e validade de quatro horas.
4. Token é removido do histórico antes de carregar o SDK externo. A página usa `no-referrer`. Token bruto não vai ao banco. QR não pode ser revogado individualmente para quem já o copiou sem rotacionar o token da mesa.
5. `get_customer_menu` retorna somente ID, nome e preço de produtos ativos após validar sessão.
6. Carrinho contém UUID, quantidade e observação. A chave de idempotência é persistida **antes** da requisição; falha de armazenamento impede envio. Falha de rede mantém a mesma chave e bloqueia edição até confirmar o resultado. Rejeições explícitas por item inválido/indisponível liberam edição. Não há envio automático offline.
7. `create_customer_order` determina a mesa pela sessão, valida produtos/quantidades/notas e soma preços do banco. Não aceita preço unitário, mesa, usuário ou sessão no payload. O total esperado é enviado apenas como trava de consentimento: se o total calculado pelo banco for diferente, a transação rejeita o pedido sem gravar nada; o valor do navegador nunca é usado para calcular a cobrança. Grava `orders` e `order_items` atomicamente, status `sent`, mesa `occupied`. Mesmo pedido/chave retorna o mesmo ID; chave reutilizada com conteúdo diferente falha.
8. Realtime já publicado nas tabelas existentes notifica o Coffee 1178 OS, sem modificar suas assinaturas. As policies da equipe continuam enxergando pedidos de cliente. Cozinha/equipe seguem `sent → preparing → ready → delivered`, incluindo as rotinas atuais de baixa de estoque ao entregar.
9. Cliente consulta somente `get_customer_orders` a cada 5 segundos no uso normal, pausando em aba oculta ou offline e espaçando tentativas em falhas. A resposta contém apenas os pedidos da própria sessão; nunca assinatura global de Realtime, dados de outros clientes ou dados administrativos.

## Proposta de banco — NÃO APLICADA

Arquivo: `supabase/proposals/customer_self_service.sql`, transacional, preparado a partir do schema inspecionado. CLI Supabase ausente e rede do terminal bloqueada: por isso foi mantido fora do diretório de migrations, sem inventar número/versão. Em staging, registrar com `supabase migration new customer_self_service` e copiar o SQL para o arquivo gerado.

Novas tabelas em schema **não exposto** `customer_private`:

- `customer_table_tokens`: hash SHA-256 único, mesa, ativação e validade opcional.
- `customer_sessions`: `auth.uid()` único, mesa/token consistentes por FK composta, expiração e revogação.
- `customer_order_requests`: chave única por sessão, conteúdo exato e vínculo único ao pedido.

Mudanças propostas em `orders`:

- `source` com padrão `staff`, preservando inserts das RPCs atuais.
- `customer_session_id` com FK composta garantindo a mesma mesa da sessão.
- `created_by` anulável, com CHECK: staff exige operador e não tem sessão de cliente; customer exige operador NULL, sessão e nome de apresentação `Cliente`.
- Índice por sessão/data. Nenhum operador fictício.

RPCs públicas (SECURITY INVOKER): `start_customer_session`, `get_customer_menu`, `create_customer_order`, `get_customer_orders`. Delegam a quatro funções SECURITY DEFINER no schema privado. Helpers privados não são executáveis pelo cliente.

Privilégios dessas funções pertencem ao papel dedicado `coffee_customer_rpc`: NOLOGIN, NOINHERIT, NOBYPASSRLS, nunca concedido a anon/authenticated/authenticator. Grants e policies específicos permitem somente tabelas/colunas necessárias. Não há permissões para pagamentos, operadores, auditoria ou painéis. Nenhuma policy de cliente nas tabelas operacionais é concedida ao papel authenticated. RLS também está habilitada nas três tabelas privadas, sem SELECT/DML dos usuários.

Um trigger novo em `cafe_tables` revoga sessões de cliente quando a mesa volta a `free` e rejeita um fechamento concorrente que deixaria um pedido de cliente aberto numa mesa livre. Não altera sessões de funcionários nem as RPCs atuais. **Esse caso concorrente pode exigir que a equipe atualize e tente fechar novamente; validar com o fluxo real em staging.**

Limites preparados: até 40 linhas, 99 unidades por linha, 100 unidades por pedido, observações de 300 caracteres, 20 pedidos por sessão e intervalo mínimo de 5 segundos entre novos pedidos. Esses limites não substituem proteção contra abuso na criação de usuários anônimos.

## Preparação de QR (offline)

`node scripts/create-table-qr.mjs UUID_REAL_DA_MESA https://DOMINIO_DA_PREVIEW`

Gera em `private-qr/` (ignorado pelo Git) URL portadora privada e SQL contendo **apenas hash**. Não executa SQL nem publica nada. Usar o hash em staging primeiro; gerar a imagem QR offline a partir da URL, sem enviar tokens para geradores externos. Nenhum QR real foi emitido nesta execução. Não reutilizar tokens de staging em produção.

## Verificação executada

- `node tests/customer-core.test.mjs`: 13 testes passaram. Payload sem mesa/preço; limites; IDs/preço Caffè/fotos; indisponibilidade e divergência; duplo clique; falha de rede/reload com mesma chave; edição bloqueada durante envio incerto; falha de storage; rejeição explícita; escaping; labels dos status; verificações estáticas do SQL.
- `python tests/browser_customer.py`: Chromium local, 390×844 e 1024×768. Interface com **SDK Supabase simulado**: mesa 01/02, tratamento de QR inválido e troca de mesa negada, Cafeteria/House, frase, Caffè a R$32,90, fotos decodificadas, carrinho/observação, dupla submissão com uma chamada, status recebido/pronto, sem overflow horizontal e sem exceções JavaScript.
- Hash do app operacional conferido; fotos originais mantidas.
- Script de provisionamento testado offline: token aleatório de 256 bits e SQL contendo apenas o hash SHA-256, sem token bruto.
- Reinício explícito de visita encerrada também passou no teste de navegador com Auth simulado.

Os testes simulados não comprovam RLS nem validação no servidor. A suite SQL `tests/sql/bootstrap.sql` cria um schema mínimo apenas em banco descartável cujo nome começa com `coffee_customer_test`, aplica a proposta e testa isolamento, permissões, preço, produto inativo, quantidade, idempotência, operador rejeitado e fim da visita. **Preparada, ainda não executada:** não há PostgreSQL/psql/CLI disponível localmente.

## Pendências antes de preview funcional/produção

1. Executar SQL em banco descartável e depois em clone staging completo, revisar com advisors e confirmar versões/documentação atuais. A consulta de docs foi feita pelo conector; changelog HTTP não abriu pelo proxy.
2. Testar QR real, Auth anônimo, REST/RLS e concorrência em duas sessões, inclusive revogação/expiração e diferentes payloads concorrentes.
3. Testar recebimento no OS e cozinha, status pelo operador, estoque, auditoria/relatórios e fechamento/pagamento. Inspecionar também consumidores externos não presentes no app lido que possam presumir `created_by` não nulo.
4. Validar nova visita no mesmo dispositivo: sessão encerrada não é renovada/reassociada implicitamente. Ao reler o QR com uma sessão já inválida, aparece “Iniciar nova visita”; somente após o toque o cliente encerra seu Auth local e cria outra identidade anônima. O storage do app operacional permanece separado. Esse caminho exige teste com Auth real.
5. Token QR é uma credencial portadora: quem fotografar o QR poderá iniciar uma nova identidade anônima para aquela mesa. Troca de URL na mesma sessão é negada, mas isso não prova presença física. Definir rotação/ativação por visita, proteção antiabuso/CAPTCHA e limites por mesa antes de produção.
6. O envio inclui total esperado para rejeitar variação de total entre catálogo e transação. O banco calcula os preços e compara, sem usar o total do cliente para cobrança. Validar esse cenário com atualização concorrente de produtos em staging; snapshots dos nomes/preços são os lidos na transação.
7. O `netlify.toml` da raiz da branch contém JavaScript e não é TOML válido. Não foi alterado por ser configuração preexistente; não usar build automático da raiz. O frontend fica no diretório stable, cujo `netlify.toml` é válido. Configurar preview isolada após revisar a publicação desse diretório (inclui outros arquivos do app). Não publicar todo o repositório.
8. SDK remoto e dependências precisam carregar em ambiente conectado; verificar o build que gera config.js com **somente chave pública**, nunca service_role. Não compartilhar o storage de Auth do app operacional.
9. Grants preexistentes nas tabelas operacionais são amplos (incluindo TRUNCATE para anon/authenticated), embora RLS esteja habilitada. A proposta não amplia esses grants, mas uma auditoria completa das RPCs/permissões preexistentes continua necessária antes de abrir acesso de clientes. Não foram removidos para evitar alterar produção fora do escopo aprovado.

Não há preview nova nem deploy de produção. Nenhuma migration, role, trigger ou policy desta proposta foi criada no Supabase conectado.

## Sincronização comercial aprovada — 2026-11-05

Consulta somente de leitura confirmou os quatro UUIDs, nomes, preços e `active=true` no Supabase. Mapeamentos liberados: Coca-Cola Original 350 ml (700), Coca-Cola Zero 350 ml (700), Suco de Uva em Lata (700) e Leite e Canela (890). Caffè d’Oro continua a 3290 centavos. A foto anterior de leite/canela foi preservada na nova chave do catálogo.

Reexecutados: 13 testes de unidade/regressão, teste Chromium em celular/tablet com Supabase simulado, validação sintática dos módulos e teste offline do provisionamento QR; todos passaram. O navegador verificou os quatro produtos liberados nas áreas correspondentes e as quatro associações ainda bloqueadas. A suite SQL continua sem execução porque `psql`/PostgreSQL/Supabase CLI não estão disponíveis; não foi executada no banco de produção como alternativa. O hash do app operacional permanece inalterado. Nenhuma migration, deploy ou alteração de produto no banco nesta sincronização.


## Liberação da tortinha — 2026-11-06

Consulta somente de leitura ao staging confirmou produto ativo `8abb0c24-242d-4e95-96a1-d79f0c1ccde2`, preço 790 centavos. O mapeamento visual da tortinha foi marcado como conferido a pedido do proprietário. A lógica geral de indisponibilidade, preços e autorização da mesa permanece intacta. Os outros três mapeamentos pendentes não foram liberados sem confirmação das diferenças de composição. O catálogo e seu módulo importador receberam versão de URL para evitar cache antigo.


## Confirmação de pães e maçã verde — 2026-11-06

O proprietário confirmou pão francês com requeijão a R$ 7,90 e pão francês com queijo Canastra e presunto a R$ 9,90; este é separado do Misto Canastra de R$ 21,90. Os nomes/descrições do frontend foram alinhados sem mudar UUIDs, fotos ou preços. Verde Firenze foi confirmado como o drink sem álcool: descrição “Drink gaseificado de maçã verde com especiarias, sem álcool.” Mapeamentos liberados no frontend; nenhuma escrita no banco. Firenze Gin continua separado e alcoólico. Somente a associação do bolo de cenoura continua aguardando confirmação.


## Bolo de cenoura confirmado — 2026-11-06

Nome visual mantido como Bolo de Cenoura com Calda; mapeamento liberado conforme confirmação do proprietário. UUID `98e0913e-3ce3-4c63-a9b1-10c3c3a70d49`, ativo no staging e preço preservado de 990 centavos. O banco ainda usa o nome Bolo de Cenoura com Ganache e não foi alterado; o fluxo operacional pode exibir esse nome cadastrado. Todos os 40 itens visuais estão conferidos, mantendo bloqueios de segurança por sessão, inatividade ou divergência futura de preço.


Acompanhamento visual atualizado: ver `customer-tracking.md`. Timeline por pedido, confirmação imediata após resposta da criação e consulta segura existente; nenhum acesso direto às tabelas foi adicionado.
