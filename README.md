# Backend-Node (Express)

A mirror of the C++ server APIs with a structured Express app, running on port 3000 by default.

## Routes
- GET `/api/tables` (auth)
- GET `/api/table/:name` (auth)
- POST `/api/auth/login|logout|register|validate`
- POST `/api/table/:name/insert|update|delete` (auth)

Auth supports either `Authorization: Bearer <JWT>` or `Session-ID` header (in-memory sessions for demo). JWT secret/time is configurable.

## Setup
1. Copy `.env.example` to `.env` and edit if needed.
2. Install deps:
   ```bash
   npm install --prefix backend-node
   ```
3. Run dev:
   ```bash
   npm run dev --prefix backend-node
   ```

## Features added
- Logging via morgan
- CORS whitelist via `ALLOWED_ORIGINS` (comma-separated; empty allows all in dev)
- Zod validation middleware for params/body
- Global 404 and error handler
- JWT auth (with Session-ID fallback)
- Safe SQL mutations using parameterized queries and column whitelisting via `information_schema`
- Dev tooling: nodemon, eslint, prettier
- Knex integration for DB with migrations
- OpenAPI docs at `/docs` (and raw JSON at `/docs/openapi.json`)
- TypeScript types build (declaration-only) for API schemas

## Auth flow
1) Login
```bash
curl -sX POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"u","password":"p"}'
# => { success, sessionId, token }
```
2) Authenticated request (either):
```bash
# Using JWT
curl -s http://localhost:3000/api/tables -H "Authorization: Bearer $TOKEN"

# Using Session-ID header
curl -s http://localhost:3000/api/tables -H "Session-ID: $SESSION"
```

## Examples
List tables
```bash
curl -s http://localhost:3000/api/tables -H "Authorization: Bearer $TOKEN"
```
Get table rows (first 500)
```bash
curl -s http://localhost:3000/api/table/my_table -H "Authorization: Bearer $TOKEN"
```
Insert (fields must exist on table)
```bash
curl -sX POST http://localhost:3000/api/table/my_table/insert \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"data":{"col1":"value","col2":123}}'
```
Update
```bash
curl -sX POST http://localhost:3000/api/table/my_table/update \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"data":{"col1":"new"},"where":{"id":1}}'
```
Delete
```bash
curl -sX POST http://localhost:3000/api/table/my_table/delete \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"where":{"id":1}}'
```

## Notes
- Requires access to the same PostgreSQL DB as C++ server.
- For production, use persistent sessions (Redis/DB) or JWT only, add HTTPS/proxy, and enable stricter validation/role-based auth.

## Knex migrations
Create migration:
```bash
npm run migrate:make --prefix backend-node create_users
```
Run latest migrations:
```bash
npm run migrate:latest --prefix backend-node
```
Rollback last batch:
```bash
npm run migrate:rollback --prefix backend-node
```

Migrations live in `backend-node/migrations` and use `knexfile.cjs` config.

## Docs
- Swagger UI: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/docs/openapi.json

## Types (optional)
Generate declaration files from TypeScript definitions (if you add any under `src/types`):
```bash
npm run types --prefix backend-node
```
