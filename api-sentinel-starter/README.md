# API Sentinel

Projeto de portfólio e projeto final do CS50x para monitorar endpoints HTTP.
Nesta etapa, a aplicação oferece uma API para cadastrar, listar, editar e excluir URLs,
com persistência em SQLite e funções internas para armazenar e consultar resultados
de verificações. Verificações HTTP reais, rotas de consulta do histórico, interface
web e agendamento ainda não estão implementados.

## Funcionalidades atuais

| Método e rota | Função |
| --- | --- |
| `GET /health` | Confirma que o API Sentinel está executando |
| `GET /about` | Exibe informações do projeto |
| `POST /endpoints` | Cadastra nome e URL HTTP/HTTPS |
| `GET /endpoints` | Lista os endpoints cadastrados |
| `PUT /endpoints/{endpoint_id}` | Atualiza nome e URL de um endpoint |
| `DELETE /endpoints/{endpoint_id}` | Exclui um endpoint |
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
HTTPX. HTTPX já é importado pelo código, mas ainda não é usado para monitorar URLs.
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
- `get_check_history(endpoint_id)` retorna uma lista de dicionários, com `success` convertido para booleano. Ordena por horário decrescente e, em caso de empate, por ID decrescente. Retorna `[]` se não houver histórico ou se o endpoint não existir.

Chaves estrangeiras são ativadas em cada conexão. Gravar um resultado para um
endpoint inexistente gera `sqlite3.IntegrityError`. Excluir um endpoint também
exclui seu histórico (`ON DELETE CASCADE`); editar o endpoint preserva seus
resultados, vinculados ao ID. O histórico não guarda uma cópia da URL antiga.
Nenhuma dessas funções executa requisições HTTP, e não há novas rotas nesta etapa.

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

## Próximas etapas

O [ROADMAP.md](ROADMAP.md) acompanha as funcionalidades existentes e planejadas:
verificações manuais, consulta do histórico pela API, verificações periódicas, interface web e ampliação
dos testes automatizados para essas funcionalidades.
