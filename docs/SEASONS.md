# Temporadas e acesso por PIN

As temporadas seguem o calendário de São Paulo, com início em 1º de janeiro, abril, julho e outubro. A primeira temporada premiada é 2026-Q3. Os resultados anteriores continuam no histórico. Pontos, vitórias, empates, derrotas, partidas e saldo de sets pertencem à temporada; MVP e brasões são conquistas acumuladas.

O desempate usa pontos, vitórias, menos derrotas e saldo de sets. Empates persistentes compartilham posição: 1º, 1º, 3º. Convidados e atletas sem partidas não disputam medalhas. Partidas abertas na virada ficam encerradas sem pontuar. Temporadas encerradas são imutáveis pela API.

Cada avaliação e voto MVP deve chegar antes de `min(finalização + 96 horas, fim do trimestre)`. As datas vêm do servidor. Votos antigos enviados continuam registrados; uma votação MVP já encerrada antes da migração não é reaberta. Alterar o relógio do navegador não estende o prazo.

A média é calculada com precisão integral e arredondada somente na tela. Na virada, o peso acumulado é dividido por dois, sem alterar a média ou apagar votos. O perfil mostra a média final ponderada e os votos reais recebidos no trimestre. O atleta não recebe notas atuais pela API; administradores têm acesso às médias atuais. O sorteio roda no servidor e o compartilhamento de times não inclui notas.

## Acesso

No primeiro acesso, o atleta informa o telefone e cadastra um PIN numérico de quatro dígitos, confirmado duas vezes. Quem cadastrar primeiro assume a conta desse telefone: não há verificação por SMS. Contas com telefone duplicado precisam de correção pelo administrador antes de cadastrar o PIN.

O PIN usa scrypt com salt aleatório. A sessão dura 90 dias, usa token aleatório com hash no banco e cookie HttpOnly, SameSite=Strict e Secure em produção. Não há autenticação por localStorage. A versão nova remove caches antigos de notas e sessões. A recuperação fica em Administração → Recuperar acesso de um atleta, invalida todas as sessões e permite cadastrar outro PIN. Logout encerra apenas a sessão atual.

Cinco erros de PIN em 15 minutos bloqueiam a conta por 15 minutos. O IP tem limite de 30 chamadas de autenticação a cada 15 minutos. Configure `TRUST_PROXY` somente com os endereços/CIDRs do proxy confiável para não compartilhar o limite entre todos os usuários. Produção requer HTTPS.

Somente administradores cadastram/desativam integrantes, gerenciam partidas e sorteiam times. Cada atleta pode editar seu nome/foto e avaliar uma partida da qual participou. O endpoint antigo de sincronização em massa retorna 410; reset de histórico foi desativado para proteger conquistas.

## Implantação

O comando `bash deploy.sh` automatiza a publicação no destino já configurado (`xdmt@85.209.93.46:9213`, app `https://volei.anyco.com.br`). Ele compila antes da parada, preserva a imagem anterior, para somente o app, executa `db:backup` e `db:migrate`, sobe a nova versão e verifica sua saúde no container e por HTTPS. O PostgreSQL não é reiniciado. Não há remoção automática de imagens ou restauração destrutiva de banco. Se o backup ou a migração falhar antes da substituição do container, o app anterior é reiniciado.

O backup de cada deploy é validado com `pg_restore --list`, mesmo quando a migração já foi aplicada. A primeira migração mantém também seu próprio backup obrigatório. Os arquivos ficam em `backups/` no servidor e não são enviados pelo rsync nem incluídos na imagem Docker. A imagem anterior recebe uma tag `volei-formador-de-times:rollback-DATA`. Após o deploy, guarde uma cópia do dump fora do servidor.

1. Instalar dependências com `npm ci` e compilar com `npm run build`.
2. Parar a versão antiga antes da migração para que ela não grave dados durante a transição.
3. Definir `DATABASE_URL` e um diretório persistente `BACKUP_DIR` (padrão `./backups`). Ter `pg_dump` compatível com o PostgreSQL instalado; a imagem Docker já inclui o cliente PostgreSQL 16.
4. Executar `npm run db:migrate`. O comando exige um backup completo em formato custom antes de alterar o banco e não continua se o backup falhar. Validar o arquivo com `pg_restore --list CAMINHO_DO_BACKUP` e guardar uma cópia fora do servidor.
5. Iniciar `npm start`. O servidor recusa iniciar se a migração ainda não foi executada. A primeira sessão após a atualização exige o cadastro do PIN. As permissões de administrador existentes são preservadas.

Com Compose, depois de parar o serviço antigo e construir a nova imagem:

```sh
docker compose run --rm volei-formador-de-times npm run db:migrate
docker compose up -d volei-formador-de-times
```

O diretório de backups do app está montado no host. O comando de migração é idempotente. Não usar `db:push` como substituto: ele não faz o backup nem a associação dos dados históricos. O inicializador legado é utilizado apenas pela migração, depois do backup, nunca no startup normal.

Em caso de rollback, parar as gravações, restaurar o dump em **outro banco vazio** usando `pg_restore --no-owner --dbname=URL_DO_BANCO_VAZIO CAMINHO_DO_BACKUP`, verificar os registros e só então apontar a versão anterior para o banco restaurado. A restauração perde alterações posteriores ao backup; preserve o banco atual para conciliação. Não executar uma restauração destrutiva sobre o banco ativo.

## Verificação

```sh
npm run lint
npm run build
npm test
```

Os testes de integração são habilitados por `TEST_DATABASE_URL`, que deve apontar para PostgreSQL local e um banco descartável cujo nome termina em `_test`. Eles apagam os dados desse banco; nunca use um banco real. Primeiro execute a migração nesse banco usando `DATABASE_URL` e `BACKUP_DIR`. O teste de migração também precisa de permissão para criar um banco temporário, além de `pg_dump` e `pg_restore`.

```sh
TEST_DATABASE_URL=postgres://USUARIO@127.0.0.1:PORTA/volei_seasons_test npm test
```

A suíte verifica PIN, expiração de sessão, limite por conta/IP, permissões, sigilo das notas, avaliações inválidas/expiradas, fechamento concorrente, pódio compartilhado, redução fracionária de peso, preservação dos votos e idempotência da migração.

O fechamento é verificado antes das operações da API e a cada 30 segundos. Um lock transacional no PostgreSQL serializa fechamento e gravações. Após indisponibilidade, todas as viradas pendentes são processadas em ordem, sem duplicar medalhas. Falhas são registradas nos logs do servidor e devem ser investigadas; não há fechamento silencioso em cache.
