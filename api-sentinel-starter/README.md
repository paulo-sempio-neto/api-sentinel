# API Sentinel

Projeto de portfólio e projeto final do CS50x para monitorar endpoints HTTP.
Nesta etapa, a aplicação oferece uma API para cadastrar, listar, editar e excluir URLs,
com persistência em SQLite e verificações HTTP manuais que gravam e retornam seus
resultados, consulta do histórico pela API e monitoramento automático enquanto a
aplicação está em execução. Interface web e alertas ainda não estão implementados.

## Funcionalidades atuais

| Método e rota | Função |
| --- | --- |
| `GET /health` | Confirma que o API Sentinel está executando |
| `GET /about` | Exibe informações do projeto |
| `POST /endpoints` | Cadastra nome e URL HTTP/HTTPS |
| `GET /endpoints` | Lista os endpoints cadastrados |
| `PUT /endpoints/{endpoint_id}` | Atualiza nome e URL de um endpoint |
| `DELETE /endpoints/{endpoint_id}` | Exclui um endpoint |
| `POST /endpoints/{endpoint_id}/check` | Executa uma verificação HTTP e retorna o resultado salvo |
| `GET /endpoints/{endpoint_id}/checks` | Consulta o histórico salvo, com limite de resultados |
| `GET /docs` | Abre a documentação interativa da API |

O nome tem os espaços das extremidades removidos e não pode ficar vazio.
Dados inválidos retornam `422`, URLs duplicadas retornam `409` e atualizar ou
excluir um endpoint inexistente retorna `404`. A rota `/health` verifica o API Sentinel,
não as URLs cadastradas.

Para editar, envie os dois campos (`name` e `url`) no corpo JSON do `PUT`.
As validações são as mesmas do cadastro. É permitido manter a própria URL;
usar a URL de outro endpoint retorna `409` e preserva os dados anteriores.

```json
{"name":"Minha API atualizada","url":"https://example.com/api"}
```

## Ambiente e dependências

O ambiente virtual escolhido é **`api-sentinel-starter\.venv`**. Todos os comandos
abaixo usam esse ambiente. O `.venv` da pasta superior não faz parte deste fluxo
e não precisa ser ativado nem excluído.

Esta etapa foi validada com Python 3.14.3 no Windows. Instale o Python 3.14 com o
comando `py` disponível antes de seguir as instruções.

As dependências diretas estão em `requirements.txt`: FastAPI, Uvicorn, Pydantic e
HTTPX. A aplicação usa HTTPX para executar as verificações manuais e automáticas.
SQLite e os demais módulos da biblioteca padrão vêm com o Python. As dependências
de testes também estão no arquivo: pytest e HTTPX2, usado pelo `TestClient` da
versão atual do Starlette (base do FastAPI).

## Instalação no Windows (PowerShell)

Abra um novo terminal PowerShell e entre na pasta que contém `app.py`.
Neste checkout, o caminho é o seguinte; ajuste-o se o projeto estiver em outro local:

```powershell
cd "C:\Users\USER\Downloads\API-Sentinel-Begin\api-sentinel-starter"
```

Crie o ambiente virtual na primeira instalação. Se `.venv` já existir nesta pasta,
reutilize-o e siga para a ativação:

```powershell
py -3.14 -m venv .venv
```

Ative o ambiente:

```powershell
.\.venv\Scripts\Activate.ps1
```

Se o PowerShell bloquear o script de ativação, continue com os comandos abaixo:
eles usam diretamente o Python do ambiente escolhido e dispensam a ativação.

Instale as dependências e confira se são compatíveis:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

## Executar e verificar a API

Na mesma pasta, inicie o servidor de desenvolvimento:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Mantenha esse terminal aberto. Em outro terminal PowerShell, verifique a aplicação:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health"
```

A resposta deve ter os valores abaixo, com status HTTP `200`:

```json
{"status":"ok","service":"api-sentinel"}
```

Abra <http://127.0.0.1:8000/docs> no navegador para experimentar as rotas.
Use `Ctrl+C` no terminal do servidor para encerrar a aplicação. Se tiver ativado
o ambiente virtual, execute `deactivate` para sair dele.

Enquanto o processo estiver ativo, uma tarefa interna verifica os endpoints
cadastrados a cada 60 segundos. Essa solução é intencionalmente simples e adequada
ao servidor local executado em um único processo; não é um agendador distribuído.

## Banco de dados

O arquivo é sempre `api-sentinel-starter/api_sentinel.db`, ao lado de
`database.py`, independentemente da pasta a partir da qual o Python é executado.
A inicialização ocorre no ciclo de vida do FastAPI (`lifespan`), quando o servidor
inicia. Importar o módulo não cria o banco.

As tabelas são criadas somente se ainda não existirem; os cadastros existentes são
preservados. O banco local é ignorado pelo Git.

### Persistência do histórico (Etapa 3)

A tabela `checks` armazena `id`, `endpoint_id`, `checked_at` (texto ISO 8601 em UTC),
`success` (0 ou 1), `status_code`, `response_time_ms` e `error_message`. Os três
últimos campos aceitam `NULL`; a duração, quando informada, não pode ser negativa.

As funções internas de `database.py` recebem resultados já calculados:

- `save_check_result(endpoint_id, success, *, status_code=None, response_time_ms=None, error_message=None, checked_at=None)` grava o resultado e retorna seu ID. `checked_at` aceita um `datetime` com fuso horário; se omitido, usa o instante atual em UTC.
- `get_check_history(endpoint_id, limit=None)` retorna uma lista de dicionários, com `success` convertido para booleano. Ordena por horário decrescente e, em caso de empate, por ID decrescente. Retorna `[]` se não houver histórico ou se o endpoint não existir. O padrão continua sem limite; um limite positivo opcional é aplicado diretamente no SQLite.

Chaves estrangeiras são ativadas em cada conexão. Gravar um resultado para um
endpoint inexistente gera `sqlite3.IntegrityError`. Excluir um endpoint também
exclui seu histórico (`ON DELETE CASCADE`); editar o endpoint preserva seus
resultados, vinculados ao ID. O histórico não guarda uma cópia da URL antiga.
Essas funções de persistência não executam requisições HTTP.

## Verificação manual (Etapa 4)

Com a API em execução e um endpoint cadastrado, use a documentação `/docs` ou
execute o comando abaixo, substituindo `1` pelo ID desejado:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/endpoints/1/check"
```

A função `perform_endpoint_check(endpoint_id)` busca a URL atual, executa um único
GET com `httpx`, grava o resultado por `save_check_result(...)` e devolve o registro
criado. O modelo não armazena método HTTP ou status esperado: nesta etapa, apenas
respostas **2xx** representam sucesso. Respostas 3xx, 4xx e 5xx são falhas, com o
código HTTP preservado e `error_message` nulo. Redirecionamentos não são seguidos.

O timeout é definido uma vez, em `CHECK_TIMEOUT_SECONDS = 10.0`, em `app.py`.
Ele limita cada operação de conexão/leitura/escrita/espera por conexão do HTTPX;
não representa um limite total de 10 segundos para toda a checagem. A duração é
medida com `time.perf_counter()` e salva em milissegundos, incluindo o tempo até
uma falha. O horário UTC registrado é o início da tentativa. O corpo da resposta
é recebido pelo HTTPX, mas não é armazenado nem retornado pela API Sentinel.

Timeouts, falhas de conexão/DNS/TLS e outros `httpx.RequestError` são registrados
com `success=false`, `status_code=null` e uma mensagem curta, sem traceback ou
detalhes internos. A rota retorna HTTP `200` com o resultado, mesmo se o serviço
monitorado estiver indisponível. Um ID inexistente retorna `404`, sem requisição
externa e sem criar histórico.

A resposta contém `id`, `endpoint_id`, `checked_at`, `success`, `status_code`,
`response_time_ms` e `error_message`, com os mesmos valores persistidos. Cada
chamada cria exatamente um resultado. Não há retries; a verificação de
certificados TLS continua ativa, e configurações de proxy do ambiente não são
herdadas (`trust_env=False`). A rota manual continua disponível mesmo com o
monitoramento automático ativo.

## Consulta do histórico (Etapa 5)

Para consultar os resultados já armazenados de um endpoint:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/endpoints/1/checks?limit=10"
```

A rota `GET /endpoints/{endpoint_id}/checks` retorna uma lista JSON com os mesmos
campos da resposta da checagem manual: `id`, `endpoint_id`, `checked_at`, `success`,
`status_code`, `response_time_ms` e `error_message`. Os resultados são ordenados
do horário mais recente ao mais antigo; empates são resolvidos pelo maior ID.

O parâmetro `limit` é opcional: padrão **50**, mínimo **1**, máximo **100**.
O limite é aplicado na consulta SQLite, antes de carregar os resultados.
Valores inválidos retornam a validação padrão `422` do FastAPI.

Um endpoint existente sem verificações retorna `200` e `[]`; um ID inexistente
retorna `404`. A consulta só lê os registros daquele endpoint: não executa HTTP,
não cria verificações e não oferece paginação por cursor ou offset. Monitoramento
automático não altera esse comportamento de leitura.

## Monitoramento automático (Etapa 6)

O lifespan do FastAPI inicia uma única tarefa de monitoramento junto com a
aplicação. Após cada intervalo de `MONITOR_INTERVAL_SECONDS = 60.0`, ela consulta
novamente os IDs atualmente cadastrados e executa `perform_endpoint_check(...)`
para cada um. Assim, verificações manuais e automáticas compartilham as mesmas
regras HTTP e o mesmo caminho de persistência.

Como o HTTPX usado pelo projeto é síncrono, tanto a leitura da lista quanto cada
checagem são deslocadas para threads com `asyncio.to_thread(...)`, sem bloquear o
event loop. Falhas normais de rede viram resultados persistidos; uma exceção
inesperada em um endpoint é registrada no log e não impede os demais nem os ciclos
seguintes. A lista é recarregada em todo ciclo, portanto endpoints novos entram no
próximo ciclo e endpoints removidos deixam de participar.

No encerramento, o lifespan sinaliza a tarefa e aguarda sua finalização. O
monitoramento existe somente dentro deste processo: executar vários workers criaria
um monitor por processo. Não há Redis, Celery, APScheduler, alertas ou coordenação
distribuída nesta etapa.

## Testes automatizados

Na pasta `api-sentinel-starter`, com as dependências instaladas, execute:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Não é necessário iniciar o Uvicorn. Cada teste usa um SQLite temporário separado,
inicializado pelo ciclo de vida da aplicação. O banco `api_sentinel.db` do projeto
não é usado nem alterado, e nenhuma URL cadastrada é acessada pela rede.

A suíte cobre cadastro, listagem, nomes vazios ou com espaços, URLs duplicadas,
edição, exclusão e respostas `404` para endpoints inexistentes. Também verifica
que uma edição com URL duplicada não altera os dados e que manter a própria URL
é permitido. Os testes de persistência cobrem sucessos, falhas com campos nulos,
ordenação, isolamento entre endpoints, integridade referencial, exclusão em cascata
e inicialização sobre um banco existente sem perda de dados.
Os testes de checagem manual usam `httpx.MockTransport` para simular respostas e
exceções, com um relógio controlado para conferir a duração. O transporte HTTPX
real é bloqueado durante os testes; nenhuma URL é acessada pela internet.
Os testes da API de histórico cobrem formato, ordenação, isolamento, limites,
validação e leitura sem efeitos colaterais, além da compatibilidade com a
checagem manual e com o comportamento anterior da função de persistência.
Os testes de monitoramento controlam diretamente os ciclos, sem esperar os 60
segundos reais. Nas demais suítes, uma configuração interna desativa a tarefa para
evitar verificações automáticas inesperadas. Também são cobertos início e parada,
persistência, múltiplos endpoints, isolamento de falhas e recarga da lista.

## Próximas etapas

O [ROADMAP.md](ROADMAP.md) acompanha as funcionalidades existentes e planejadas:
interface web, alertas e ampliação dos testes automatizados para essas
funcionalidades.
