# Arquitetura

O FitManager é um monorepo com três programas e um projeto de vídeo. Nenhum serviço externo é obrigatório para rodar: o banco é o SQLite nativo do Node e o gateway de pagamento tem um modo simulado.

```
navegador ──► web/ (React + Vite)
                 │  /api/*
                 ▼
             api/ (Express + node:sqlite) ──► Asaas (Pix, cartão, boleto, split)
                 ▲          ▲
   SSE (fita ao vivo)        │ HTTP com token do equipamento
                 │          │
             painel      bridge/ (PC da recepção) ◄── catraca Control iD (modo online)
                                                  ◄── leitor QR USB (teclado)
```

## api/

| Pasta | Responsabilidade |
|---|---|
| `src/db.js` | Esquema, migrações aditivas (`addColumn`), transações aninhadas com SAVEPOINT, WAL |
| `src/domain/billing.js` | Contratos, geração de faturas, multa de 2% e juros de 1% ao mês pro rata, trancamento, cancelamento com fidelidade |
| `src/domain/access.js` | Motor de decisão da catraca: 10 verificações em ordem, antipassback, lotação, mensagens do display |
| `src/domain/members.js` | CPF, menor de idade com responsável, consentimento de biometria (LGPD) |
| `src/domain/exercise-guide.js` | Catálogo de 44 exercícios com fotos, músculo principal, passo a passo e erros comuns |
| `src/payments/` | `service.js` orquestra; `asaas.js` e `simulated.js` implementam a mesma interface (`createCharge`, `tokenizeCard`, `refund`, `parseWebhook`) |
| `src/routes/` | Um arquivo por área. Middleware de perfil (`dono`, `recepcao`, `professor`, `aluno`) em cada rota |
| `src/lib/` | Tempo em America/Sao_Paulo, CPF, Pix BR Code com CRC16, HMAC para tokens e QR, HTTP helpers |
| `src/seed.js` | Academia Contrapeso: 150 alunos, 14 meses, 4 mil passagens geradas pelo próprio motor de regras (PRNG determinístico) |
| `test/` | 19 testes das regras de negócio com `node:test` |

**Dinheiro** é sempre inteiro em centavos. **Datas** são texto `YYYY-MM-DD` no fuso da academia; instantes são ISO em UTC.

**Segredos**: senhas com scrypt, tokens de sessão e QR com HMAC, chaves do gateway em cofre AES-GCM (`api/.secret`). Templates biométricos nunca chegam ao servidor: ficam no equipamento, o servidor guarda só o identificador.

## web/

| Pasta | O que é |
|---|---|
| `src/site/` | Landing com vídeo de fundo que acompanha a rolagem, login, cadastro da academia |
| `src/admin/` | Painel: Hoje, Catraca, Alunos, Financeiro, CRM, Treinos, Dietas, Planos, Relatórios, Configurações |
| `src/member/` | App do aluno (PWA): treino, guia de execução, cardio com GPS, passe QR, dieta, mensalidade, story para Instagram |
| `src/platform/` | Painel de quem opera o FitManager: assinaturas, taxas, churn |
| `src/ui/` | Kit: ícones (Bootstrap Icons), formulários, formatação de moeda e data |
| `src/styles.css` | Sistema visual compartilhado: preto `#060606`, lime `#D2F531`, Barlow Condensed + Archivo |

Sem gerenciador de estado: a sessão fica em `localStorage`, os dados vêm por `fetch` em cada tela, e a fita da catraca chega por `EventSource`.

## bridge/

Agente Node que roda no PC da recepção. Recebe do equipamento Control iD o `new_user_identified.fcgi`, consulta a API com o token do equipamento, responde liberar ou negar com a mensagem do display, e executa comandos pendentes (`execute_actions.fcgi`, `remote_enroll.fcgi`). Sem internet, usa `offline-cache.json` com as últimas decisões por aluno.

## Fluxos principais

**Passagem na catraca**
1. Equipamento identifica a digital e chama o bridge.
2. Bridge chama `POST /api/bridge/identify` com o token do equipamento e o identificador biométrico.
3. `access.js` roda as verificações em ordem; a primeira que falha vira a mensagem.
4. Resultado é gravado em `access_logs` e publicado no SSE; o painel atualiza na hora.

**Mensalidade pelo app**
1. Aluno toca em Pagar; `payments/service.js` cria a cobrança no gateway com split para a carteira da plataforma.
2. Webhook do gateway chega em `POST /api/webhooks/asaas/:gymId`, é verificado e deduplicado em `webhook_events`.
3. Fatura baixa, contrato volta ao estado em dia e a próxima passagem é liberada sem intervenção.

**Fechamento de contrato**
- Fatura vencida acima da tolerância bloqueia a catraca, mas a recepção pode liberar com justificativa.
- Trancamento de 7 dias ou mais estende o contrato e empurra os vencimentos.
- Cancelamento com fidelidade calcula a multa sobre as parcelas restantes.

## motion/

Projeto Remotion com duas composições: `FitManager` (16:9, 1 min 41 s) e `Reels` (9:16, 30 s). `src/fx.jsx` tem câmera 3D, planos em profundidade, luz de persiana, grão e adesivos manuscritos. As vozes vêm do ElevenLabs; `scripts/voz.mjs` regenera e `scripts/historico.mjs` puxa do histórico da conta.

## Demonstração online (GitHub Pages)

O GitHub Pages só serve arquivos estáticos, então a demonstração leva a API junto. Com `FM_DEMO=1`, o Vite empacota os módulos de `api/src` dentro do front e troca o que é do Node por substitutos em `web/src/demo/shims`:

| Módulo do Node | No navegador |
|---|---|
| `node:sqlite` | sql.js, o SQLite compilado para WebAssembly |
| `express` | roteador compatível com `Router`, `use`, parâmetros e `next(err)` |
| `node:crypto` | `@noble/hashes` e `@noble/ciphers` (scrypt, HMAC, SHA-256, AES-GCM) |
| `node:fs`, `path`, `url`, `events` | versões mínimas em memória |

`web/src/demo/server.js` monta as mesmas rotas de `api/src/server.js` e responde às chamadas que o front faria por `fetch`. Na primeira visita do dia ele roda o próprio `seed.js`, depois guarda o banco no IndexedDB do visitante. A fita ao vivo da catraca usa o mesmo `accessBus` que alimenta o SSE no servidor. O workflow `.github/workflows/pages.yml` gera e publica a cada push na `main`.

Nada disso muda o modo normal: sem `FM_DEMO`, o front continua chamando a API em `/api`.

## Escala

SQLite atende uma instância com folga para centenas de academias pequenas. Para várias instâncias, trocar `db.js` por Postgres: as queries são SQL padrão e o acesso passa todo por esse módulo.
