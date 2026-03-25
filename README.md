# Projeto Aprendiz • Gestão de Alunos

Nova base do sistema criada a partir do HTML original e dos arquivos de sugestões/implementações.

## O que esta versão entrega

- publicação simples em **GitHub Pages**
- autenticação com **Supabase Auth**
- controle de acesso por e-mail em `allowed_users`
- dashboard com ranking de igrejas, timeline e segmentação por região
- CRUD de alunos, turmas, aulas, presenças e permissões
- modo demonstração com os alunos-base reaproveitados do sistema anterior
- exportação para Excel e PDF
- estrutura mais limpa, sem depender de um único HTML gigante

## Estrutura

```text
index.html
assets/
  app.js
  styles.css
data/
  seed_students.json
sql/
  supabase_schema.sql
```

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Envie todos os arquivos desta pasta.
3. Em **Settings > Pages**, publique pela branch principal e pela pasta raiz.
4. Abra o site publicado.
5. Cole a `Supabase URL` e a `Anon key` na tela inicial.
6. Faça login com usuário criado no Supabase Auth.

## Como configurar o Supabase

1. Crie um projeto no Supabase.
2. Rode o SQL do arquivo `sql/supabase_schema.sql` no SQL Editor.
3. Em **Authentication**, habilite e-mail/senha e/ou magic link.
4. Cadastre ao menos um usuário no Auth.
5. Insira esse e-mail também na tabela `allowed_users` com status `ativo`.

Exemplo inicial:

```sql
insert into public.allowed_users (email, status, modules)
values (
  'admin@dominio.com',
  'ativo',
  '{"students":"admin","classes":"admin","lessons":"admin","attendance":"admin","dashboard":"admin","permissions":"admin"}'::jsonb
);
```

## Observações importantes

- O app funciona sem build; por isso é ótimo para GitHub Pages.
- O modo demonstração usa `data/seed_students.json` como base.
- Para upload real de arquivos, a próxima etapa ideal é conectar um bucket do Supabase Storage.
- Para uso em produção, vale separar `app.js` em módulos menores.

## Próxima evolução sugerida

- upload real de documentos no Supabase Storage
- logs de auditoria
- filtros avançados por igreja, região e instrumento
- importação automática de planilhas
- tema institucional persistente
