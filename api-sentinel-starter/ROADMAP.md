# API Sentinel Roadmap

Este documento separa o MVP concluído de possíveis trabalhos futuros. Itens da
seção de production readiness são ideias, não funcionalidades atuais.

## MVP concluído

### Stage 1 — Base de execução

- [x] Criar a aplicação FastAPI e as rotas iniciais.
- [x] Usar um único ambiente virtual local ao projeto.
- [x] Fixar as dependências diretas.
- [x] Usar um caminho SQLite relativo aos arquivos do projeto.
- [x] Inicializar o banco pelo lifespan do FastAPI.
- [x] Documentar instalação e execução no Windows.

### Stage 2 — Gerenciamento de endpoints

- [x] Cadastrar, listar, editar e excluir endpoints.
- [x] Validar URLs HTTP/HTTPS e nomes após trim.
- [x] Rejeitar URLs duplicadas com `409`.
- [x] Retornar `404` para edição ou exclusão inexistente.
- [x] Testar o gerenciamento com SQLite temporário.

### Stage 3 — Histórico persistente

- [x] Criar a tabela `checks` com integridade referencial.
- [x] Persistir sucesso, status HTTP, duração, horário e erro.
- [x] Consultar histórico newest-first com desempate por ID.
- [x] Excluir histórico em cascata com o endpoint.
- [x] Testar constraints, isolamento e compatibilidade de inicialização.

### Stage 4 — Checagem HTTP manual

- [x] Executar GET com timeout finito, TLS ativo e sem retries/redirecionamentos.
- [x] Classificar respostas `2xx` como sucesso.
- [x] Converter falhas de rede em resultados persistidos.
- [x] Expor `POST /endpoints/{endpoint_id}/check`.
- [x] Testar o fluxo sem acessar a internet pública.

### Stage 5 — API de histórico

- [x] Expor `GET /endpoints/{endpoint_id}/checks`.
- [x] Manter a leitura sem efeitos colaterais.
- [x] Aplicar limite padrão 50 e faixa válida 1–100 no SQLite.
- [x] Testar ordenação, isolamento, validação e compatibilidade manual.

### Stage 6 — Monitoramento automático

- [x] Criar uma tarefa in-process pelo lifespan.
- [x] Verificar endpoints em ciclos de 60 segundos.
- [x] Deslocar SQLite e HTTP síncronos com `asyncio.to_thread(...)`.
- [x] Recarregar endpoints a cada ciclo e isolar falhas.
- [x] Encerrar a tarefa de forma coordenada.
- [x] Testar ciclos determinísticos sem esperar o intervalo real.

### Stage 7 — Interface web

- [x] Criar dashboard e detalhes com Jinja2.
- [x] Exibir último resultado e histórico recente.
- [x] Adicionar formulários de cadastro, edição, exclusão e checagem manual.
- [x] Usar CSS local e responsivo sem framework frontend.
- [x] Preservar as rotas e respostas da API JSON.
- [x] Testar formulários, escaping e ausência de efeitos colaterais em GET.

### Stage 8 — Fechamento do MVP

- [x] Reorganizar o README para apresentação de portfólio.
- [x] Documentar arquitetura, fluxos, stack, estrutura e decisões.
- [x] Validar setup, comandos, dependências e entry point.
- [x] Auditar `.gitignore`, arquivos rastreados e possíveis dados sensíveis.
- [x] Revisar código, templates, CSS e cobertura de testes.
- [x] Adicionar smoke tests para `/health` e o stylesheet local.
- [x] Documentar limitações e separar o roadmap futuro.

### Phase 1 — Integração contínua

- [x] Configurar GitHub Actions para instalar dependências, executar `pip check`
  e rodar a suíte de testes em cada `push` e `pull_request`.

## Entrega do projeto

- [ ] Gravar o vídeo de demonstração.
- [ ] Realizar a submissão final do CS50.

## Futuro — production readiness

- [ ] Migrar para PostgreSQL se o uso multiusuário justificar.
- [ ] Adotar migrations de banco de dados.
- [ ] Adicionar autenticação, autorização e isolamento entre usuários.
- [ ] Implementar proteção CSRF para formulários autenticados.
- [ ] Endurecer requisições contra SSRF e acesso a redes internas.
- [ ] Adicionar rate limiting e políticas operacionais de timeout.
- [ ] Criar alertas por canais configuráveis.
- [ ] Avaliar Docker e configuração de deployment.
- [ ] Adotar processamento distribuído somente se a escala exigir.
- [ ] Documentar backup, observabilidade e operação em produção.
