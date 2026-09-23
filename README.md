<div align="center">
  <img src="favicon.png" alt="Culto de Segunda Logo" width="100" height="100" style="border-radius: 24px;" />

  # 🏐 Culto de Segunda — Formador de Times de Vôlei

  <p align="center">
    <strong>Sistema web moderno, inteligente e ágil para sorteio equilibrado de times de vôlei, gestão de partidas e ranking estatístico de jogadores.</strong>
  </p>

  <p align="center">
    <a href="#-funcionalidades">Funcionalidades</a> •
    <a href="#-tecnologias">Tecnologias</a> •
    <a href="#-arquitetura">Arquitetura</a> •
    <a href="#-execução-com-docker">Docker</a> •
    <a href="#-deploy--banco-de-dados">Deploy & DB</a> •
    <a href="#-licença">Licença</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>
</div>

> **Temporadas e PIN:** a versão atual exige `npm run db:migrate` antes de iniciar. Consulte [as regras, implantação com backup e testes](docs/SEASONS.md). As regras de temporadas, privacidade, autenticação e prazo de votação desse documento substituem as descrições antigas abaixo.

---

## 🌟 Sobre o Projeto

O **Culto de Segunda** foi desenvolvido para resolver o desafio semanal de organizar partidas de vôlei recreativo e competitivo. Esqueça a bagunça de listas em grupos de mensagem ou sorteios injustos: nossa aplicação calcula o nível dos jogadores, considera posições em quadra (Levantador, Ponteiro, Central, Oposto, Líbero) e gera **confrontos totalmente equilibrados e dinâmicos**.

Além do sorteio inteligente, a aplicação conta com registro de placares em tempo real, ranking estatístico por estrelas, histórico de rodadas e geração de cards visuais para compartilhamento direto no WhatsApp e redes sociais.

---

## ✨ Funcionalidades

### ⚡ Algoritmo de Sorteio Inteligente
- **Algoritmo de Troca Gulosa (Greedy Swap)**: Avalia a pontuação (`rating`) de cada jogador para que a diferença média entre os dois times seja mínima.
- **Distribuição de Posições**: Garante a alocação proporcional de Levantadores e atacantes entre os dois lados da quadra.
- **Tratamento de Ímpares**: Caso haja um número ímpar de participantes, o sistema realiza o balanceamento sem penalizar a média do time com jogadores excedentes.

### 📊 Gestão do Dia de Jogo & Placares
- **Montagem e Sorteio Local com Auto-Save (Draft Persistente)**: Seleção de presenças, adição de convidados, sorteio e trocas manuais de jogadores ocorrem de forma fluida e são **automaticamente persistidos no armazenamento local (`localStorage`)**. Se o organizador fechar o navegador, trocar de aba ou reiniciar o smartphone, toda a escalação, presenças e times montados permanecem salvos exatamente como estavam.
- **Ciclo de Vida do Rascunho**: O rascunho temporário é mantido salvo até que o organizador clique em **Começar Rodada** (momento em que a partida é oficializada e o rascunho é limpo) ou clique em **Cancelar e Excluir**.
- **Finalização Reativa & Modal de Conclusão**: Ao clicar em **Finalizar Rodada**, o estado em andamento é instantaneamente descarregado da tela, abrindo um modal celebrativo com o placar final oficial e atalho direto para a votação do Craque da Partida (MVP), liberando imediatamente a tela para novas rodadas e exibindo os cards no histórico.
- Marcador de placar por sets (ex: 25x23) e vitórias acumuladas.
- Histórico completo das rodadas com estatísticas individuais de vitórias, empates, derrotas e taxa de aproveitamento calculadas dinamicamente.

### 🌟 Ranking, Feedback Coletivo & Craque da Partida
- **Votação do Craque da Partida (MVP)**: Votação popular anônima disponível por 24 horas após o término do jogo, permitindo que cada participante vote no destaque de ambos os times (auto-voto bloqueado).
- **Submissão Atômica e Resiliente de Votos (`POST /api/feedback`)**: Votos de MVP, avaliações de equilíbrio e notas para companheiros de equipe são transmitidos em um payload atômico ultra-leve (~1 KB) com persistência imediata no PostgreSQL. O fluxo conta com feedback de carregamento no botão, desduplicação de votos por telefone sanitizado e tratamento de erro explícito com aviso na tela em caso de instabilidade.
- **Proteção Relacional e Constraints Únicas Formais**: Constraints únicas e índices formais no PostgreSQL (`balance_feedbacks_match_evaluator_key`, `rating_feedbacks_match_evaluator_target_key` e `mvp_votes_match_evaluator_key`) com resolução `ON CONFLICT DO UPDATE` do Drizzle ORM garantem idempotência total e impedem o erro relacional `42P10`.
- **Integridade de Chaves Estrangeiras (FK Resilience)**: O backend valida a existência de partidas e jogadores antes de qualquer inserção relacional. Caso uma partida tenha acabado de ser concluída e receba votos imediatos, registros stub são criados automaticamente para garantir que nenhum voto seja recusado por violação de FK.
- **Cache Local com Merge Não-Destrutivo**: O mecanismo de sincronização periódica (`GET /api/db`) realiza merge inteligente preservando avaliações locais recentes (< 30 min) ainda não refletidas pelo banco de dados, impedindo que o polling periódico apague votos recém-computados pelo usuário.
- **Gravação Prioritária de Logs de Auditoria**: Logs de auditoria são persistidos tanto localmente quanto via endpoint `/api/logs` e no topo do fluxo de feedback, assegurando que o histórico de participação dos atletas nunca seja perdido.
- **Banner Televisivo (Broadcast TV)**: Exibição no topo do *Dia de Jogo* com contagem regressiva, contador de votos registrados em tempo real durante a votação (com parcial de votos oculta até o encerramento) e pódio oficial com porcentagens do Top 3 após o término das 24h.
- **Transparência com Voto Secreto**: Ao clicar na barra de **Resultado Final**, exibe a lista com os avatares e nomes de todos os atletas que votaram naquela rodada (mantendo o voto individual em sigilo).
- **Histórico de Craques no Ranking**: Contagem acumulada de títulos de Craque da Partida no perfil de cada atleta e opção de ordenação por Craques.
- **Estrelas Dinâmicas**: Avaliação de 1 a 5 estrelas atribuída aos colegas de time após os jogos.
- **Feedback de Equilíbrio**: Jogadores votam ao final da rodada se o confronto esteve realmente parelho (registrado com chave estrangeira e vínculo relacional direto ao jogador avaliador no PostgreSQL).

### 📋 Logs de Auditoria do App (Exclusivo para Administradores)
- **Registro Relacional de Ações**: Rastreabilidade completa e cronológica de todas as ações de usuários (acessos/logins, agendamento, início, finalização e exclusão de rodadas, cadastro, edição e exclusão de atletas, resets e votos).
- **Proteção Integral do Sigilo e Anonimato do Voto**: Ao registrar votos e avaliações de rodadas, o sistema registra unicamente a participação do atleta no evento e o timestamp da ação (ex: *"Roberto Carlos registrou voto na rodada 26/08 e no Craque da Partida (MVP)"*), sem salvar notas atribuídas, sem identificar o alvo das estrelas e sem revelar o atleta escolhido para MVP.
- **Painel com Filtros e Busca em Tempo Real**: Modal de visualização de logs exclusivo para Administradores com busca textual rápida, filtros por categoria (*Partidas, Votações, Atletas, Acessos, Admin*) e badges coloridos com carimbos de data/hora.

### 📸 Geração de Cards para Redes Sociais
- **Arte do Craque da Partida**: Geração de imagem em alta definição para publicação nos Stories (Instagram e Facebook) e compartilhamento rápido de legenda e imagem no WhatsApp.
- **Escalação dos Times**: Geração automática de imagem PNG estilizada em *Dark Mode / Glassmorphism* com escalação oficial dos dois times.

---


## 🛠️ Tecnologias

O projeto utiliza uma stack moderna focada em alta performance, integridade relacional, responsividade e facilidade de deploy:

- **Frontend**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) (Ícones).
- **Build Tool**: [Vite](https://vitejs.dev/) & [esbuild](https://esbuild.github.io/).
- **Backend & Banco de Dados**: [Express](https://expressjs.com/), [PostgreSQL 16](https://www.postgresql.org/) Relacional, [Drizzle ORM](https://orm.drizzle.team/).
- **Visualizador de Banco (Supabase style)**: [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) (`npm run studio`).
- **Utilitários**: [html-to-image](https://github.com/bubkoo/html-to-image) para renderização de cards.
- **Infraestrutura**: Containerização multi-stage via **Docker** (App + PostgreSQL + Drizzle Studio) e **Docker Compose**, integrada com **Nginx Proxy Manager**.

---

## 🏗️ Arquitetura do Projeto

```text
├── drizzle.config.ts      # Configuração do Drizzle ORM e Drizzle Studio
├── pgdata/                # Volume de dados do PostgreSQL no Docker
├── scripts/               # Scripts de túnel e gestão
│   └── studio.sh          # Conexão e túnel seguro com o Drizzle Studio
├── src/
│   ├── components/        # Componentes React (GameDayTab, RankingTab, ActivityLogsModal...)
│   ├── db/                # PostgreSQL Schema, Conexão e Serviços Drizzle ORM
│   │   ├── index.ts       # Client de conexão com o Postgres
│   │   ├── schema.ts      # Definição relacional das tabelas com Foreign Keys
│   │   └── services.ts    # Auto-população de logs e Recálculo dinâmico
│   ├── types.ts           # Interfaces TypeScript da aplicação
│   ├── utils/             # Algoritmo de sorteio de times e helpers
│   ├── App.tsx            # Componente raiz da aplicação
│   └── main.tsx           # Entry point do React
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Orquestração (Container da App + PostgreSQL)
├── deploy.sh              # Script automatizado de deploy SSH/rsync
└── server.ts              # Servidor Express de API com Drizzle ORM
```


---

## 🎨 Visualizador do Banco de Dados (Drizzle Studio)

Você pode visualizar e editar todo o banco de dados em uma interface gráfica moderna no navegador:

```bash
npm run db:studio
```
O Drizzle Studio abrirá a interface visual com o diagrama relacional e tabelas interligadas por chaves estrangeiras.

---

## 🚀 Execução Local

### Pré-requisitos
- Node.js (v18+)
- Docker e Docker Compose (para subir o PostgreSQL)

### Rodando via Node.js
```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar o ambiente de desenvolvimento (Vite + Express Server)
npm run dev
```
Acesse a aplicação em `http://localhost:3000`.

### Rodando via Docker
```bash
# Compilar e subir os containers (App + PostgreSQL) localmente
docker compose up -d --build
```

---

## 🚢 Deploy & Gerenciamento de Produção

### Deploy Automatizado
O projeto possui um script de deploy em 1 comando que sincroniza os arquivos via `rsync`, recompila a imagem no servidor e reinicia o serviço sem downtime perceptível:

```bash
./deploy.sh
```

### 🗄️ Gerenciamento do Banco de Dados em Produção

Para editar dados dos jogadores ou histórico sem precisar mexer em SSH ou banco de dados manual:

1. **Baixar banco de produção para o seu computador:**
   ```bash
   ./scripts/baixar-db.sh
   ```
   *Baixa a versão atual em `./data/db.json` e cria um backup local.*

2. **Editar os dados localmente:**
   Abra e modifique o arquivo `data/db.json`.

3. **Subir alterações para o servidor:**
   ```bash
   ./scripts/subir-db.sh
   ```
   *Cria backup de segurança no servidor remoto, atualiza o arquivo e reinicia a aplicação.*

---

## 📄 Licença

Este projeto está sob a licença MIT. Sinta-se à vontade para contribuir, clonar e dar uma ⭐️ no repositório!

---

<div align="center">
  Feito com ❤️ e 🏐 para a comunidade do <strong>Culto de Segunda</strong>
</div>
