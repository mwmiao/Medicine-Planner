# Planeador de Medicação · 用药小助手

Aplicação web (PWA) simples e bilingue — **português europeu** e **chinês simplificado** — para ajudar uma pessoa idosa a tomar os medicamentos a horas, no iPhone, a partir de um atalho no ecrã principal.

- Mostra as tomas de hoje, com botões grandes: **"Já tomei"** e **"Adiar 15 min"**.
- Guarda tudo no telemóvel (IndexedDB, via Dexie.js) e, opcionalmente, **no NAS da família** (sincronização sem contas, com um código). Não há login.
- Lê o texto da caixa com a câmara (OCR com Tesseract.js, no próprio telemóvel).
- Liga cada medicamento ao registo oficial do **INFARMED / INFOMED**.
- Funciona offline depois da primeira utilização.

> ⚠️ Esta informação é apenas para referência. Siga sempre as indicações do seu médico ou farmacêutico.

---

## 1. Executar localmente

Requisitos: **Node.js 20 ou superior** e npm.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Para experimentar no iPhone na mesma rede Wi-Fi, use o endereço IP do computador (ex.: `http://192.168.1.20:3000`). A câmara (`getUserMedia`) só funciona em **HTTPS** ou em `localhost`; em HTTP simples a app usa automaticamente a alternativa "Escolher fotografia".

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Gera a versão estática final na pasta `out/` |
| `npm start` | Serve a pasta `out/` com o servidor do NAS (`SYNC_CODE=… npm start` liga a sincronização) |
| `npm test` | Corre os testes (Vitest + fake-indexeddb) |
| `npm run typecheck` | Verifica os tipos TypeScript |
| `npm run icons` | Volta a gerar os ícones PNG em `public/icons/` |

## 2. Publicar gratuitamente (Vercel)

A app é **100 % estática** (`output: "export"`), por isso pode ser alojada em qualquer serviço gratuito.

**Vercel:**

1. Crie uma conta gratuita em <https://vercel.com> e coloque este projeto num repositório GitHub.
2. Em Vercel → **Add New… → Project**, importe o repositório.
3. Deixe as opções detetadas (Framework: Next.js; Build Command: `npm run build`). Clique em **Deploy**.
4. Recebe um endereço `https://…vercel.app` com HTTPS — necessário para a câmara e para instalar a app.

Alternativas: Netlify ou Cloudflare Pages (pasta de publicação: `out`, comando: `npm run build`).

### Alternativa: Docker no NAS (com Watchtower)

A cada push para `main`, o GitHub Actions (`.github/workflows/docker.yml`) corre os testes, gera a app e publica a imagem `eazyeight/medicine-planner:latest` (amd64 e arm64) no Docker Hub. São precisos os segredos `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` no repositório.

Exemplo de `docker-compose.yml` no NAS:

```yaml
services:
  medicine-planner:
    image: eazyeight/medicine-planner:latest
    container_name: medicine-planner
    ports:
      - "1380:1380"
    environment:
      # Código longo e aleatório (ex.: `openssl rand -hex 16`). Sem ele, a sincronização fica desligada.
      SYNC_CODE: "troque-por-um-codigo-longo-e-aleatorio"
    volumes:
      - medicine-planner-data:/data
    restart: unless-stopped
    labels:
      - com.centurylinklabs.watchtower.enable=true

volumes:
  medicine-planner-data:
```

**Importante — HTTPS:** no iPhone, a câmara (`getUserMedia`), o service worker (funcionamento offline) e as notificações só funcionam em **HTTPS**. Através de `http://IP-do-NAS:1380` a app abre, mas fica sem modo offline e usa "Escolher da galeria" em vez da câmara ao vivo. Coloque o contentor atrás de um proxy reverso com certificado válido (ex.: proxy reverso do Synology/QNAP com Let's Encrypt, Nginx Proxy Manager, Caddy ou Cloudflare Tunnel). O código de sincronização viaja em cada pedido, por isso **use sempre HTTPS** fora de casa.

### Guardar os dados no NAS (sincronização)

No iPhone, o Safari e a app adicionada ao ecrã principal têm **armazenamento separado**: o que se escreve num não aparece no outro. O mesmo acontece com endereços diferentes (IP, nome, http/https). Para os dados nunca se perderem, a imagem Docker inclui um pequeno servidor (`server/server.mjs`, só Node, sem dependências) que:

- serve a app (como o nginx fazia: cache, 404, redirecionamentos relativos);
- guarda os dados em `/data/medicine-planner.json` (volume), com escrita atómica;
- mantém as últimas 50 versões em `/data/history/` (`HISTORY_KEEP` para mudar);
- exige o **código de sincronização** (`SYNC_CODE`) — não há contas; bloqueia após 10 códigos errados em 15 minutos.

No telemóvel: **Definições → Guardar no NAS** → escrever o código → **Ligar ao NAS**. Faça isto em **cada** sítio onde a app é usada (Safari e ecrã principal): a primeira ligação **junta** os dados de ambos. Depois a app:

- continua a funcionar sem rede (os dados ficam também no telemóvel);
- sincroniza ao abrir, ao voltar à app, quando a rede volta, a cada minuto e logo depois de cada alteração;
- junta alterações dos dois lados: ganha a mais recente, apagar não "ressuscita", e **uma toma marcada como tomada nunca é substituída por "adiada"** (só "Desfazer" a remove) — para evitar doses a dobrar.

"Importar dados" e "Apagar todos os dados" substituem também a cópia do NAS. Para recuperar uma versão antiga, copie um ficheiro de `/data/history/` para `/data/medicine-planner.json` com o contentor parado.

Se usar uma pasta do NAS em vez de um volume (`./data:/data`), dê-lhe permissões ao utilizador 1000 (`chown 1000:1000 data`), porque o servidor não corre como root.

## 3. Adicionar ao ecrã principal do iPhone

1. Abra o endereço da app no **Safari** (tem de ser o Safari).
2. Toque no botão **Partilhar** (quadrado com uma seta para cima).
3. Escolha **"Adicionar ao ecrã principal"**.
4. Toque em **"Adicionar"**. Aparece o ícone azul **"Planeador"**.

A partir daí a app abre em ecrã inteiro, sem barra do Safari, e funciona sem internet. As mesmas instruções estão em **Definições** dentro da app, nas duas línguas.

## 4. Lembretes no iOS — limitações

O iOS limita muito o que uma web app pode fazer em segundo plano:

- **Avisos dentro da app (implementado):** enquanto a app está aberta, quando chega a hora de uma toma aparece uma faixa no topo, ouve-se um som curto e, se o utilizador permitiu, surge uma notificação do sistema. **Com a app fechada ou o ecrã bloqueado, estes avisos não acontecem.**
- **Notificações Web Push (não ativadas):** o Safari no iOS 16.4+ aceita Web Push apenas em apps adicionadas ao ecrã principal, e exige um **servidor** com chaves VAPID para enviar as mensagens à hora certa. Isso contraria o objetivo de não ter servidor nem conta, e a entrega no iOS não é garantida. Fica um esboço limpo em `src/lib/push.ts` e um comentário em `public/sw.js`.
- **Solução recomendada — alarmes / Atalhos do iPhone:**
  - App **Relógio → Alarmes → +**: um alarme por cada hora de toma (ex.: 08:00 "Medicamentos").
  - Ou app **Atalhos → Automação → Nova automação → Hora do dia**: escolha a hora, "Diariamente", "Executar imediatamente", e adicione a ação **"Abrir app"** (ou "Abrir URL" com o endereço da app).

Não são usadas funcionalidades que exijam certificado de programador iOS, App Store ou notificações nativas.

## 5. Como funciona a pesquisa no INFARMED

### O que foi investigado

O **INFOMED** (<https://extranet.infarmed.pt/INFOMED-fo/>) é a base de dados nacional de medicamentos de uso humano do INFARMED. Permite pesquisar por nome do medicamento ou substância ativa (DCI) e tem uma pesquisa avançada (forma farmacêutica, dosagem, titular de AIM, estado, etc.).

Na investigação feita (outubro de 2026):

- **Não existe uma API pública e documentada** (JSON ou outra) para aplicações.
- O INFOMED é uma aplicação JSF (páginas `.xhtml`, formulários POST com estado de sessão). **A pesquisa não aceita parâmetros no URL**, por isso não é possível criar uma ligação direta para "resultados de pesquisa de X".
- Os URLs estáveis são:
  - Página inicial / pesquisa: `https://extranet.infarmed.pt/INFOMED-fo/index.xhtml`
  - Pesquisa avançada: `https://extranet.infarmed.pt/INFOMED-fo/pesquisa-avancada.xhtml`
  - Ficha de cada medicamento: `https://extranet.infarmed.pt/INFOMED-fo/detalhes-medicamento.xhtml?med_guid=<identificador>`
- Extrair dados do HTML ("scraping") seria frágil, e o site esteve indisponível (HTTP 503) para pedidos automáticos durante os testes. Por isso **a app não inventa endpoints nem dados**.

### O que a app faz

1. **"Pesquisar no INFARMED"** (no formulário, ou automaticamente depois de fotografar a caixa, com o nome lido):
   - procura primeiro nos registos já guardados **neste telemóvel** (funciona offline);
   - mostra os resultados com nome comercial, substância ativa, forma farmacêutica, dosagem e estado da autorização, com um botão **"Selecionar"**;
   - explica de forma simpática, nas duas línguas, que não há pesquisa automática.
2. **"Copiar nome e abrir INFARMED"** copia o nome e abre o INFOMED oficial. **"Ver no INFARMED"** abre o site.
3. **"Ligar ao registo oficial"**: o utilizador cola o endereço da ficha do medicamento (com `med_guid`) e copia os dados principais, bem como, se quiser, os endereços do **Folheto Informativo** e do **RCM**. A app só aceita endereços `https://…infarmed.pt`.
4. Ao selecionar, os campos do formulário são **pré-preenchidos, mas tudo continua editável**. O registo é guardado em cache no IndexedDB **com a data de obtenção**, e fica disponível offline e em pesquisas futuras.
5. Em todo o lado é mostrada a **fonte** e a **data**. Dados escritos pelo utilizador aparecem como "Copiado da página oficial do INFARMED" ou "Escrito à mão", **nunca** como informação oficial gerada automaticamente.

### Quando não há resultado

Aparece uma mensagem amigável nas duas línguas, com as opções de abrir o INFARMED ou **escrever os dados à mão**. O medicamento pode ser guardado na mesma.

### Se no futuro existir uma API

Basta implementar a interface `InfarmedProvider` (`src/lib/infarmed/provider.ts`) e chamá-la com `setDefaultProvider(...)`, se necessário através de uma pequena rota/proxy por causa de CORS. O resto da app (resultados, seleção, cache, fonte e data) já está preparado.

## 6. Informação do medicamento

Cada medicamento tem uma secção **"Ver informação"** (recolhível), com estes blocos separados:

- **Indicações do médico**: dose, horário e instruções escritas no formulário.
- **Informação oficial / folheto**: para que serve, como tomar, se se esquecer de uma toma, efeitos secundários, avisos e conservação. Tudo editável, com a fonte (INFARMED, folheto informativo, caixa, ou escrito à mão) e a data da última alteração.
- **Lido da caixa (fotografia)**: o que o OCR encontrou.
- **Notas pessoais**.

Regras de segurança fixas: se não houver orientação para uma toma esquecida aparece *"Se se esquecer de uma toma, siga as instruções da embalagem ou pergunte ao seu médico ou farmacêutico. Não tome uma dose a dobrar."*, e é sempre mostrado o aviso de sinais urgentes (dificuldade em respirar, inchaço da cara ou garganta → 112). A app **não gera** posologias, interações, contraindicações nem efeitos secundários. O texto é mostrado tal como foi escrito (a app não traduz automaticamente informação médica).

## 7. Fotografar a caixa (OCR)

- Usa a câmara traseira com `getUserMedia`. Se não for possível (permissão negada, HTTP, Safari antigo), usa `<input type="file" accept="image/*" capture="environment">`.
- O OCR corre no navegador, num Web Worker do Tesseract.js, com `por`, `chi_sim` ou ambos.
- Da **primeira vez** é preciso internet para descarregar o motor e os idiomas (de cdn.jsdelivr.net). Depois ficam em cache.
- Tenta identificar: nome, substância ativa, dosagem, forma farmacêutica, unidades na caixa, validade e fabricante. **São apenas sugestões**: o utilizador confirma e corrige tudo antes de guardar.
- **A fotografia não é guardada.** Fica só na memória durante a leitura, pode ser apagada com "Apagar fotografia" e é libertada ao usar os dados.

## 8. Cópia de segurança

Em **Definições**: exportar todos os dados para um ficheiro JSON, importar (substitui os dados atuais, com confirmação) e apagar tudo (com dupla confirmação).

## 9. Estrutura do projeto

```
src/
  app/                    páginas (Hoje, Histórico, Medicamentos, Novo/Editar/Ver, Definições)
  components/             componentes pequenos e reutilizáveis (DoseCard, MedicationForm,
                          BoxScanner, InfarmedPanel, MedicalInfoSection, ConfirmDialog, …)
  lib/
    db.ts                 base de dados Dexie (IndexedDB)
    schedule.ts           geração das tomas do dia, estados, próxima toma
    doses.ts              marcar como tomado / adiar / desfazer
    medications.ts        criar, editar, validar, apagar
    backup.ts             exportar / importar JSON
    infarmed/             URLs oficiais, fornecedor (interface) e pesquisa + cache
    ocr/                  Tesseract.js e heurísticas de leitura da caixa
    i18n/                 textos pt-PT e zh-CN (o chinês é verificado pelo TypeScript)
public/
  manifest.webmanifest, sw.js, icons/
scripts/                  geração de ícones e ajuste pós-build da exportação estática
tests/                    testes Vitest
```

## 10. Notas técnicas

- Next.js 16 (App Router), React 19, TypeScript estrito (sem `any`), Tailwind CSS 4.
- O modo de texto (normal / grande / muito grande) muda o tamanho da fonte da raiz; toda a interface usa `rem`.
- A interface respeita as margens seguras do iPhone (notch / Dynamic Island) com `env(safe-area-inset-*)`.
- `scripts/postbuild-export.mjs` corrige os nomes dos ficheiros de pré-carregamento da exportação estática do Next.js 16, para a navegação funcionar em qualquer alojamento estático e offline.
