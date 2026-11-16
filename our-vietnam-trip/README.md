# Our Vietnam Trip 🇻🇳

Guia digital pessoal da viagem ao Vietnã (nov–dez 2026). PWA instalável em iPhone e Android, com tudo disponível **sem internet**.

> **Estado atual: Etapa 1 (estrutura).** O app tem só os dados já informados (destino, período aproximado e cidades previstas). Hotéis, voos, reservas e atividades **não foram inventados**: aparecem como "a importar" até o roteiro ser enviado.
> Para ver o design com dados **fictícios**, abra `/?sample=1` (aparece o aviso "Modo exemplo"; `/?sample=0` sai).

## Telas

| Aba | O que mostra |
|---|---|
| **Visão geral** | Capa, contagem regressiva / "Dia X de 14", atalhos Hoje/Amanhã, mapa do percurso, cidades em ordem, linha do tempo dos 14 dias, hotéis, voos e o botão **Save Trip Offline** |
| **Dia a dia** | Faixa de datas, cabeçalho com cidade(s), hotel da noite, horários fixos, programação por Manhã/Tarde/Noite, botões do Google Maps, próximo dia. "Hoje" é calculado no fuso do Vietnã (UTC+7) |
| **Mapa** | Percurso num mapa SVG local do Vietnã (funciona offline) + lugares filtráveis por cidade e dia, com link para o Google Maps |
| **Reservas** | Voos (estilo cartão de embarque), hotéis, transportes e passeios. Códigos de reserva protegidos por senha |

## Stack

React 18 + TypeScript + Vite + Tailwind CSS 4 + vite-plugin-pwa (Workbox). Sem backend, sem login, sem chaves de API, sem serviços pagos. Fontes (Fraunces + Be Vietnam Pro, com acentos vietnamitas) e o mapa são locais.

```
src/
  data/
    types.ts          ← modelo de dados (Trip, City, Place, Hotel, Airport, Flight, Booking, Day, Activity)
    trip.ts           ← ★ FONTE DA VERDADE: o roteiro real entra aqui
    sample.ts         ← dados fictícios só para o modo exemplo
    validate.ts       ← validação de consistência (roda antes de cada build)
    model.ts          ← índices e derivados (percurso, agenda ordenada, fase da viagem)
    private.enc.json  ← códigos de reserva criptografados (gerado)
  pages/              ← Overview, DayPage, MapPage, Reservations
  components/         ← cards, mapa SVG, faixa de datas, capa, etc.
  lib/                ← fuso horário, URLs do Google Maps, offline, criptografia
  sw.ts               ← service worker (cache offline + verificação)
scripts/              ← validação, mapa, ícones, criptografia, teste offline
```

## Modelo de dados (resumo)

- **Sem duplicação:** cada hotel/lugar é cadastrado uma vez em `places` e referenciado por `id` (`placeId`, `hotelId`, `flightId`, `bookingId`).
- **Datas** `YYYY-MM-DD`, **horas** `HH:mm` no **horário local do lugar** (voos: partida no fuso da origem, chegada no fuso do destino; cada aeroporto tem `timeZone`).
- **`status`**: `confirmed` (reservado/horário fixo — destaque visual), `suggestion`, `pending`.
- **Campos ausentes = omitidos.** A interface nunca mostra campo vazio.
- **Coordenadas** têm `verified: true|false`. O link do Maps usa `googlePlaceId` > coordenadas verificadas > nome + endereço.
- Cada `Day` tem `cityIds` (2+ cidades = dia de deslocamento, destacado), `hotelId` da noite e `activities`.

`npm run validate` verifica: um dia por data, ids únicos, referências existentes, hotel × noites, voos com chegada depois da partida (considerando fusos), reservas no dia certo, horários sobrepostos, coordenadas fora do Vietnã e lista o que está **faltando**.

## Dados sensíveis (critério 13)

O site da Vercel é público para quem tiver o link (e está marcado `noindex`). Por isso **códigos de reserva, bilhetes, telefones e contatos não ficam no código**:

1. Copie `private.example.json` para `private/private.json` (pasta ignorada pelo git) e preencha, usando os mesmos ids do `trip.ts`.
2. Rode `TRIP_PASSPHRASE="uma senha longa" npm run private:encrypt` → gera `src/data/private.enc.json` (AES-256-GCM, PBKDF2 310 mil iterações).
3. Compartilhe a senha com as outras duas pessoas por fora do app. Cada uma digita uma vez em **Reservas → Códigos protegidos**; fica salva só naquele celular e funciona offline.

Nomes de hotéis, datas e horários ficam visíveis a quem tiver o link. Se quiserem esconder o app inteiro, a opção é a proteção por senha da Vercel (plano pago) — não é necessária para o funcionamento.

## Desenvolvimento

```bash
npm install
npm run dev            # http://localhost:5173 (offline desativado em dev)
npm test               # testes unitários
npm run build          # validate + typecheck + build
npm run e2e:offline    # após o build: instala, salva offline, corta a rede, reabre e navega todas as telas
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. **Root Directory:** `our-vietnam-trip` · Framework: Vite (o `vercel.json` já define build, rewrites de SPA, cabeçalhos de cache e `noindex`).
3. Cada push gera um deploy. Os celulares baixam a nova versão em segundo plano quando estiverem online; aparece **"Roteiro atualizado → Atualizar"**. Até lá (e sem internet), continua valendo a versão já salva — a nova só substitui a antiga depois de baixada por completo.

## Como testar o funcionamento offline

**Antes de viajar, cada pessoa faz isto com internet:**

### iPhone (Safari)
1. Abra o link no **Safari** (não no Chrome do iPhone).
2. Toque em **Compartilhar** → **Adicionar à Tela de Início** → Adicionar.
3. **Abra o app pelo ícone da tela de início** (importante: no iPhone, o app instalado tem armazenamento separado do Safari).
4. Na Visão geral, toque em **Save Trip Offline** e espere **"Disponível offline"**.
5. Teste: ative o **Modo Avião**, feche o app (deslize para cima na troca de apps), abra de novo pelo ícone e navegue por Visão geral, vários dias, Mapa e Reservas.
6. Se usar os códigos protegidos, desbloqueie dentro do app instalado.

### Android (Chrome)
1. Abra o link no **Chrome**.
2. Toque em **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).
3. Abra pelo ícone e toque em **Save Trip Offline** → espere **"Disponível offline"**.
4. Teste: **Modo avião**, feche o app nos recentes, abra pelo ícone e navegue por todas as abas.

**Observações**
- O status "Disponível offline" só aparece depois que **cada arquivo** do app foi conferido no cache do aparelho. Ao reabrir, o app confere de novo; se algo foi apagado pelo sistema, volta para "Download pendente" — basta tocar no botão com internet.
- Links do **Google Maps** precisam de internet, ou de mapas offline baixados no próprio app Google Maps (Maps → foto do perfil → Mapas off-line → selecione Hanói, Hoi An, etc.).
- Depois de publicar uma atualização, abra o app com internet e toque em **Atualizar**; em seguida, **Verificar novamente**.

## Próximo passo (Etapa 2)

Enviar o documento do roteiro. Ele será transcrito para `src/data/trip.ts` (+ `private/private.json` para códigos), validado com `npm run validate`, e as lacunas/conflitos serão listados — sem inventar passeios ou horários. Fotos podem ser colocadas em `public/photos/` (são salvas offline automaticamente).
