# WhatsApp — Evolution API (somente envio)

## O que está pronto

- O servidor verifica a cada 30 segundos: uma notificação por rodada/tipo, registrada no PostgreSQL.
- Uma hora antes do encerramento das notas gerais (normalmente 95 horas após a **finalização**), marca com @ os jogadores dos times que ainda não enviaram o formulário completo. Exclui convidados e telefones inválidos. Telefones brasileiros recebem DDI 55.
- Não envia lembrete após o encerramento (96 horas ou virada da temporada, o que ocorrer primeiro).
- Na última hora do MVP, marca com @ somente os jogadores dos times que ainda não votaram no MVP, uma única vez por rodada. Verifica os votos de MVP separadamente das notas gerais. Se todos já votaram, não envia.
- Ao encerrar o MVP (24 horas após a finalização ou virada da temporada), anuncia o resultado, incluindo todos os empatados. Sem votos, não anuncia.
- Link abre a aba de votação e prioriza a rodada; o login por PIN continua obrigatório.
- Não publica notas, avaliações individuais ou identidade de quem votou em quem.
- Não há webhook, assinatura de eventos, consulta de mensagens ou leitura de conversas pelo app. A própria Evolution/WhatsApp pode sincronizar dados internamente; isso não equivale a impedir tecnicamente o recebimento no serviço WhatsApp.
- Desativado por padrão. Nenhuma mensagem real foi enviada durante a implementação.

## Situação encontrada no VPS

Na inspeção de setembro de 2026: `evolution-api` usa `evoapicloud/evolution-api:v2.3.7`, mas estava parada (exit 1), assim como `evolution-postgres` e `evolution-manager`. Não foram reiniciados nem alterados. A causa precisa ser verificada antes da ativação.

## Como ativar

1. Pelo SSH na porta 9213, verificar e recuperar a instalação em `/home/xdmt/projects/evolution-api`. Conferir os logs localmente, sem compartilhar chaves, QR codes ou conteúdo de mensagens. Subir os serviços com o Compose existente após resolver o erro. Recuperar também o painel em `/home/xdmt/projects/evolution-manager`. Não recriar volumes/bancos nem instalar serviços no host.
2. Manter Evolution e o app na rede Docker `nginx-proxy`. Usar `http://evolution-api:8080` internamente, sem expor a porta 8080 publicamente, conforme SERVER-ROLES.md. O painel pode continuar atrás do Nginx Proxy Manager.
3. No Evolution Manager, criar uma instância dedicada chamada `volei` (WhatsApp/Baileys), conectar o número pelo QR code em **WhatsApp → Aparelhos conectados** e confirmar estado `open`. Preferir um número dedicado. Não habilitar webhooks, bots ou integrações de leitura para esta instância; desativar opções de marcar mensagens/status como lidos e sincronizar histórico quando disponíveis.
4. Adicionar esse número ao grupo de vôlei. Ele precisa poder enviar mensagens; em grupos restritos a administradores, precisa ser administrador.
5. Obter o identificador do grupo (JID terminado em `@g.us`) pelo painel ou `GET /group/fetchAllGroups/volei?getParticipants=false`, autenticado com cabeçalho `apikey`. Isso consulta metadados dos grupos, não conversas. Não usar o link de convite como JID. Confirmar cuidadosamente o destino.
6. No `.env` **do projeto de vôlei no VPS**, preencher as variáveis abaixo. A chave fica apenas no servidor: não enviar pelo chat, não versionar, não usar prefixo `VITE_`. Proteger o arquivo com permissão 600.

```dotenv
WHATSAPP_ENABLED=false
EVOLUTION_URL=http://evolution-api:8080
EVOLUTION_API_KEY=CHAVE_DA_INSTANCIA_OU_CHAVE_AUTORIZADA
EVOLUTION_INSTANCE=volei
WHATSAPP_GROUP_JID=ID_DO_GRUPO@g.us
APP_PUBLIC_URL=https://volei.anyco.com.br
WHATSAPP_START_AT=DATA_ISO_COM_FUSO
```

`WHATSAPP_START_AT` é obrigatório: preencher com a data/hora real de ativação, por exemplo no formato `2026-09-20T10:00:00-03:00`. Somente partidas finalizadas a partir desse instante geram notificações. Manter o valor em reinícios para não perder notificações; não retroceder sem avaliar o risco de enviar anúncios antigos.

7. Publicar o código com `bash deploy.sh` a partir do projeto local. O deploy faz backup e roda `npm run db:migrate`; a nova migração preserva temporadas/votos e atualiza a tabela de controle de envios para aceitar o lembrete de MVP. Não usar `db:push` como substituto.
8. Primeiro validar a instância e as menções em **um grupo de teste**, com participantes cientes. Depois configurar o JID definitivo, alterar `WHATSAPP_ENABLED=true` e recriar apenas o app: `docker compose up -d --no-deps --force-recreate volei-formador-de-times`. Somente a ativação explícita inicia os envios. O botão manual de compartilhar continua independente.

## Acompanhamento e falhas

`GET /api/admin/whatsapp`, com sessão administrativa do app, mostra se está habilitado e os últimos 100 registros, sem chave, telefones ou texto. Não foi criado um painel visual novo.

Estados da tabela `whatsapp_deliveries`:

- `sending`: tentativa reservada e persistida antes de chamar a API.
- `accepted`: Evolution retornou o ID da mensagem; não é confirmação de leitura nem garantia de entrega final.
- `skipped`: ninguém pendente ou votação sem MVP.
- `uncertain`: erro/timeout ou processo interrompido durante envio. Exige conferência manual.

A chave única `(match_id, kind)` evita reenvios em reinícios e processos simultâneos, inclusive se o grupo configurado mudar. Não existe promessa de “exactly once”: uma falha pode ocorrer após o provedor aceitar a mensagem. Por segurança, **não há repetição automática de tentativas incertas**, inclusive erros HTTP. Conferir a mensagem no grupo/painel; só um operador deve decidir reenvio. Não apagar registros de controle indiscriminadamente. O app não oferece endpoint público para disparar mensagens arbitrárias.

Se o app ficou desligado, retoma anúncios MVP elegíveis ao voltar; lembretes vencidos são descartados. Se a Evolution está fora do ar, tentativas ficam incertas para revisão. Há no máximo uma tentativa por ciclo de 30 segundos. Desativar com `WHATSAPP_ENABLED=false` e recriar o app; uma requisição já em voo pode terminar.

Menções dependem de o telefone cadastrado corresponder ao número WhatsApp do participante; validar em grupo de teste, especialmente contas que utilizam LID. O app não lê participantes automaticamente nem tenta adivinhar números diferentes. Na 2.3.7, o campo `mentionsEveryOne` é omitido para evitar implementações que marcam todos mesmo com `false`.

Referência: [Send Plain Text — documentação Evolution API v2](https://evolution-74046672.mintlify.app/v2/api-reference/message-controller/send-text).
