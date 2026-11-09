# FitManager, vídeo de vendas (roteiro)

Duração alvo: 1 min 40 s. Formato 1920x1080, 30 fps. Tom: direto, de dono para dono. Nada de "revolucione sua academia".

A narração abaixo é o texto exato gravado. Enquanto não há locutor, a trilha de voz usa a voz Luciana do macOS como guia de tempo; para a versão final, grave o mesmo texto com um locutor (ou ElevenLabs, voz pt-BR "Antoni"/"Rachel" ajustada) e substitua os arquivos em `public/audio/cena-N.wav` mantendo os nomes. A duração de cada cena se ajusta sozinha ao áudio.

| # | Cena | Narração | Imagem |
|---|------|----------|--------|
| 1 | Abertura | Toda academia conhece a cena. O aluno atrasado passa pela catraca, a recepção não sabe quem pagou, e a conta fecha no fim do mês, na raça. | Filmagem escura da barra. Título sobe linha a linha: "A catraca sabe quem pagou." |
| 2 | Catraca | O FitManager liga a catraca ao financeiro. Quem está em dia entra com a digital ou com o rosto. Quem atrasou vê o motivo no display, sem constrangimento no balcão. | Display da catraca em vidro alternando Liberado e Bloqueado, com mensagens reais. |
| 3 | Pix | E resolve na hora. O aluno paga o Pix pelo app, a confirmação chega sozinha e a catraca libera. Sem comprovante, sem fila. | Celular com Pix → "Pagamento confirmado" → display muda para Liberado. |
| 4 | Painel | Para o dono, um painel só. Quantas pessoas estão treinando agora, o pico de cada dia da semana, a receita do mês, quem cobrar primeiro, e o motivo de cada bloqueio. | Recorte do painel "Hoje" com números contando e barras crescendo. |
| 5 | Regras | As regras você configura uma vez por plano. Tolerância de atraso, horário, atestado, trancamento, fidelidade. O sistema aplica em cada passagem, em cada cobrança, em cada cancelamento. | Oito telas do display aparecendo em sequência, cada uma com a mensagem que o aluno lê. |
| 6 | App | O aluno ganha um app que dá vontade de abrir. Ficha de treino com fotos reais de cada exercício, cronômetro de descanso, cardio com GPS, e um story pronto para o Instagram marcando a sua academia. | Celular passando por treino, foto do exercício, cardio e story. |
| 7 | Retenção | E antes de alguém sumir, o sistema avisa. Quem está há dez dias sem treinar, quem vence em trinta, quem ainda está decidindo. Cada um com o WhatsApp a um toque. | Lista de retenção do CRM com nomes e dias de ausência. |
| 8 | Fechamento | FitManager. Preço por academia, não por aluno. Teste grátis por catorze dias em fitmanager ponto com ponto be erre. | Logo, endereço do site, botão "Testar 14 dias grátis". |

## Produção

- Trilha musical: não incluída. Sugestão: faixa instrumental grave, 90 a 100 bpm, sem drop, entrando em -18 dB sob a voz. Coloque o arquivo em `public/audio/trilha.mp3` e ela entra automaticamente.
- Filmagens: os clipes de fundo são do Pexels (uso livre). Trocar por filmagem própria da academia melhora muito.
- Render: `npm run render` gera `out/fitmanager.mp4` em 1080p com áudio.
- Prévia com linha do tempo: `npm run studio`.
