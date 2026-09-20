# API Sentinel

API Sentinel é uma aplicação web para cadastrar endpoints HTTP, verificar sua
disponibilidade, preservar o histórico das tentativas e acompanhar os resultados
por uma interface simples ou por uma API JSON.

O projeto resolve um problema comum de observabilidade em pequena escala: saber se
uma URL está respondendo, quanto tempo levou e o que aconteceu nas tentativas
anteriores. Mais do que um CRUD, ele reúne persistência relacional, chamadas HTTP,
tratamento de falhas de rede, tarefas assíncronas, ciclo de vida do FastAPI,
templates server-rendered e testes isolados da internet.

Este repositório representa um **MVP local e single-process**. O monitor automático
em memória foi escolhido intencionalmente para manter a arquitetura compreensível
e adequada ao escopo atual; a aplicação não é apresentada como production-ready.

## Funcionalidades

- Cadastro, listagem, edição e exclusão de endpoints HTTP/HTTPS.
- Validação de nome, URL e duplicidade.
- Checagem manual pela API ou pelo navegador.
- Monitoramento automático a cada 60 segundos enquanto a aplicação está ativa.
- Persistência de sucesso, código HTTP, duração, horário UTC e mensagem de erro.
- Histórico newest-first, isolado por endpoint e com limites aplicados no SQLite.
- Dashboard responsivo com o último resultado conhecido.
- Página de detalhes com os 25 resultados mais recentes.
- API JSON com documentação OpenAPI interativa.
- Suíte offline com SQLite temporário, HTTP simulado e controle determinístico do
  monitor automático.

## Arquitetura e fluxo de dados

A aplicação mantém uma arquitetura direta: [app.py](app.py) contém o FastAPI, as
rotas, o monitor e a integração com os templates; [database.py](database.py)
concentra a conexão SQLite e a persistência do histórico.

### Checagem manual

```text
UI ou API
  -> perform_endpoint_check(endpoint_id)
  -> HTTPX faz um GET
  -> save_check_result(...)
  -> SQLite
  -> resultado retornado ou exibido
```

### Monitoramento automático

```text
FastAPI lifespan
  -> uma tarefa de monitoramento
  -> espera 60 segundos
  -> carrega novamente os IDs cadastrados
  -> asyncio.to_thread(...)
  -> perform_endpoint_check(endpoint_id)
  -> histórico no SQLite
```

O trabalho síncrono de SQLite e HTTPX é deslocado para threads para não bloquear o
event loop. A lista de endpoints é recarregada em cada ciclo: cadastros novos entram
no ciclo seguinte e endpoints excluídos deixam de ser verificados. Uma falha
inesperada em um endpoint é registrada no log e não interrompe os demais.

### Consulta de histórico

```text
UI ou API
  -> get_check_history(endpoint_id, limit=...)
  -> consulta SQLite ordenada por checked_at DESC, id DESC
  -> HTML server-rendered ou JSON
```

As páginas GET apenas leem dados persistidos. Checagens e alterações exigem POST,
PUT ou DELETE, conforme a rota.

## Tecnologias

| Tecnologia | Uso no projeto |
| --- | --- |
| Python 3.14 | Linguagem e biblioteca padrão (`asyncio`, `sqlite3`, `time`) |
| FastAPI | API, validação de rotas e ciclo de vida |
| Uvicorn | Servidor ASGI local |
| Pydantic | Validação de nomes e URLs HTTP/HTTPS |
| HTTPX | Requisições aos endpoints monitorados |
| SQLite | Endpoints e histórico persistente |
| Jinja2 | Templates HTML com escaping automático |
| HTML/CSS | Interface responsiva sem framework frontend |
| pytest | Testes automatizados |

As versões exatas e validadas estão em [requirements.txt](requirements.txt).

## Estrutura do projeto

```text
api-sentinel-starter/
├── app.py                    # FastAPI, monitor, API JSON e rotas da UI
├── database.py               # Conexão, schema e persistência SQLite
├── requirements.txt          # Dependências diretas fixadas
├── pytest.ini                # Descoberta e importação dos testes
├── templates/
│   ├── base.html             # Layout e navegação compartilhados
│   ├── dashboard.html        # Lista e último estado dos endpoints
│   ├── endpoint_detail.html  # Histórico e gerenciamento
│   └── not_found.html        # 404 específico da interface
├── static/
│   └── styles.css            # Estilos locais e responsivos
├── tests/
│   ├── conftest.py           # Banco temporário e bloqueio de rede real
│   ├── test_endpoints.py     # Gerenciamento de endpoints
│   ├── test_check_history.py # Persistência e integridade do histórico
│   ├── test_manual_checks.py # HTTP manual e falhas de rede
│   ├── test_history_api.py   # API de histórico e limites
│   ├── test_monitoring.py    # Ciclo de vida e monitor automático
│   ├── test_ui.py            # Dashboard, formulários e escaping
│   └── test_smoke.py         # Health check e CSS local
├── .gitignore                # Artefatos locais e dados sensíveis
└── ROADMAP.md                # MVP concluído e ideias futuras
```

Arquivos gerados, como `.venv`, `api_sentinel.db`, caches e bytecode, não fazem
parte do repositório.

## Como uma checagem funciona

O modelo atual monitora endpoints com um único método: `GET`.

1. A URL atual é lida do SQLite.
2. O horário inicial é registrado em UTC.
3. `httpx.get(...)` executa uma única tentativa com verificação TLS ativa.
4. Redirecionamentos não são seguidos e não há retries.
5. `time.perf_counter()` mede a duração em milissegundos.
6. Respostas `2xx` são sucesso; `3xx`, `4xx` e `5xx` são falha.
7. Timeout, conexão e outros `httpx.RequestError` viram resultados persistidos,
   sem expor o traceback ao usuário.

`CHECK_TIMEOUT_SECONDS = 10.0` é aplicado às operações do HTTPX. Ele não representa
um limite total rígido de dez segundos para toda a tentativa. Proxies configurados
no ambiente não são herdados (`trust_env=False`).

## Persistência

O banco fica em `api-sentinel-starter/api_sentinel.db`, independentemente do
diretório de onde o comando é executado. Ele é criado pelo lifespan do FastAPI e é
ignorado pelo Git.

### `endpoints`

- `id`: chave primária.
- `name`: nome obrigatório.
- `url`: URL obrigatória e única.
- `created_at`: horário de criação fornecido pelo SQLite.

### `checks`

- `id`: chave primária.
- `endpoint_id`: chave estrangeira obrigatória.
- `checked_at`: timestamp ISO 8601 normalizado para UTC.
- `success`: inteiro restrito a `0` ou `1`.
- `status_code`: nullable quando não houve resposta HTTP.
- `response_time_ms`: nullable e nunca negativo quando presente.
- `error_message`: nullable.

Chaves estrangeiras são habilitadas em cada conexão. Excluir um endpoint remove
seu histórico com `ON DELETE CASCADE`. O índice
`(endpoint_id, checked_at DESC, id DESC)` atende às consultas newest-first e torna
a ordem determinística quando dois resultados têm o mesmo timestamp.

## Interface web

Com o servidor ativo, abra <http://127.0.0.1:8000/>.

No dashboard é possível:

- cadastrar um endpoint;
- consultar o último resultado conhecido;
- iniciar uma checagem manual;
- abrir o histórico recente.

Na página de detalhes também é possível editar ou excluir o endpoint. Todas as
ações mutáveis usam formulários POST. Os templates usam escaping automático do
Jinja2, e o CSS é servido localmente — não há JavaScript, CDN ou framework de
frontend.

## Instalação no Windows

Os comandos abaixo foram validados no Windows com Python 3.14.3 e devem ser
executados na pasta que contém `app.py`:

```powershell
cd api-sentinel/api-sentinel-starter
```

Crie o ambiente virtual local do projeto:

```powershell
py -3.14 -m venv .venv
```

Ative-o:

```powershell
.\.venv\Scripts\Activate.ps1
```

Se a política do PowerShell impedir a ativação, os próximos comandos continuam
funcionando porque chamam diretamente o Python do `.venv`.

Instale e valide as dependências:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

Inicie a aplicação:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Abra:

- Dashboard: <http://127.0.0.1:8000/>
- OpenAPI/Swagger UI: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/health>

Encerre o servidor com `Ctrl+C`. Se o ambiente estiver ativado, use `deactivate`
para sair dele.

Em macOS/Linux, os equivalentes usuais são `python3 -m venv .venv`,
`source .venv/bin/activate` e `python -m uvicorn app:app`; a estrutura e o entry
point continuam os mesmos.

## API JSON

O resumo abaixo complementa a documentação interativa em `/docs`.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/health` | Confirma que o API Sentinel está ativo |
| `GET` | `/about` | Retorna informações básicas do projeto |
| `POST` | `/endpoints` | Cadastra nome e URL |
| `GET` | `/endpoints` | Lista os endpoints |
| `PUT` | `/endpoints/{endpoint_id}` | Atualiza nome e URL |
| `DELETE` | `/endpoints/{endpoint_id}` | Exclui endpoint e histórico associado |
| `POST` | `/endpoints/{endpoint_id}/check` | Executa e persiste uma checagem manual |
| `GET` | `/endpoints/{endpoint_id}/checks` | Retorna histórico newest-first |

O parâmetro `limit` da rota de histórico tem padrão `50`, mínimo `1` e máximo
`100`. Endpoint inexistente retorna `404`, URL duplicada retorna `409` e dados
inválidos retornam `422`.

Exemplo de cadastro no PowerShell:

```powershell
$body = @{ name = "Minha API"; url = "https://example.com/health" } |
    ConvertTo-Json
Invoke-RestMethod -Method Post `
    -Uri "http://127.0.0.1:8000/endpoints" `
    -ContentType "application/json" `
    -Body $body
```

Exemplo de checagem manual:

```powershell
Invoke-RestMethod -Method Post `
    -Uri "http://127.0.0.1:8000/endpoints/1/check"
```

## Testes

Não é necessário iniciar o Uvicorn. Execute no diretório do projeto:

```powershell
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -B -m pytest -q -p no:cacheprovider
```

Cada teste que usa persistência recebe um banco SQLite temporário. Um bloqueio global impede transporte
HTTP real, e respostas/falhas são simuladas com recursos do HTTPX e do pytest. O
monitor automático fica desativado nas suítes não relacionadas e usa ciclos
controlados nos testes próprios, sem esperas de 60 segundos.

A cobertura funcional inclui:

- regras de cadastro, duplicidade, edição, exclusão e `404`;
- constraints, foreign keys, cascade e ordenação do histórico;
- sucesso HTTP, respostas não-2xx, timeout e erros de conexão;
- limites e ausência de efeitos colaterais na leitura do histórico;
- início, isolamento de falhas e shutdown do monitor;
- dashboard, formulários, escaping HTML e compatibilidade da API JSON;
- smoke checks do health endpoint e do CSS local.

## Decisões de projeto

- **SQLite sem ORM:** mantém o schema e as consultas explícitos para o tamanho do
  projeto.
- **Scheduler in-process:** suficiente para o MVP single-process, sem Redis,
  Celery ou outro serviço operacional.
- **Uma implementação de checagem:** API, UI e monitor reutilizam
  `perform_endpoint_check(...)`.
- **Thread offload:** preserva a responsividade do event loop sem reescrever a
  camada HTTP síncrona.
- **Server-side rendering:** oferece uma demonstração utilizável sem Node ou uma
  aplicação frontend separada.
- **GET sem efeitos colaterais:** páginas e histórico apenas leem; checagens e
  mudanças usam métodos mutáveis.
- **Testes offline:** tornam a suíte determinística e segura para execução local.

## Limitações atuais

Estas limitações são deliberadas no MVP e devem ser tratadas antes de uma eventual
exposição pública:

- não há autenticação, autorização nem separação entre usuários;
- a UI é orientada a uso local por uma única pessoa;
- formulários não possuem proteção CSRF;
- URLs fornecidas pelo usuário aceitam HTTP/HTTPS, mas ainda não possuem proteção
  completa contra SSRF ou acesso a redes internas;
- SQLite é adequado ao uso local, mas não substitui um banco multiusuário;
- não há framework de migrations;
- o scheduler vive dentro de um único processo; múltiplos workers criariam tarefas
  duplicadas e não há coordenação distribuída;
- checagens automáticas são sequenciais por ciclo;
- não há alertas, notificações, rate limiting ou métricas agregadas de uptime;
- não há configuração de Docker, CI/CD, proxy reverso, TLS do servidor ou
  deployment.

## Próximos passos possíveis

Uma fase futura de production readiness pode avaliar PostgreSQL, migrations,
Docker, CI, autenticação, proteção CSRF e SSRF, rate limiting, alertas, deployment
e processamento distribuído caso a escala realmente exija. Esses recursos não
fazem parte do MVP atual.

O histórico detalhado das etapas está em [ROADMAP.md](ROADMAP.md).
