# Backups do banco

Em produção, o servidor verifica a cada minuto se passaram 7 dias desde o último backup bem-sucedido. Ao vencer o prazo, executa `pg_dump` em formato custom e valida o arquivo com `pg_restore --list`. Se o app estiver parado, faz o backup pendente assim que iniciar. Em caso de falha, tenta novamente no próximo minuto.

Os arquivos ficam em `/home/xdmt/projects/volei-formador-de-times/backups` no servidor, montado como `/app/backups` no contêiner. Reinícios e publicações preservam os arquivos e o prazo. Backups de publicação também contam como backup recente e reiniciam o intervalo de 7 dias.

São mantidos no máximo 4 backups concluídos no total, incluindo os automáticos, de publicação e de migração. Um novo arquivo só substitui os mais antigos depois da validação. Durante sua criação pode existir um quinto arquivo temporário. Arquivos incompletos não contam para o agendamento nem para a retenção. Arquivos de outros nomes não são removidos.

O agendamento inicia automaticamente em `NODE_ENV=production`. Não depende do Codex ou de cron no host. Há uma única instância do aplicativo em produção; não executar jobs de backup simultâneos manualmente. O deploy para o aplicativo antes de gerar seu backup.

Essas cópias ficam no mesmo servidor do banco. A validação verifica a leitura do catálogo do dump; não substitui um teste de restauração completo.
