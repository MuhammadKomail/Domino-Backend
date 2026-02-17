import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { loginSchema, logoutSchema, registerSchema, validateSchema } from '../schemas/auth.schemas.js';
import { insertSchema, updateSchema, deleteSchema, tableParamSchema } from '../schemas/table.schemas.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// Schemas
const UserSchema = z.object({ username: z.string(), role: z.string() }).openapi({ title: 'User' });
const AuthLoginResponse = z
  .object({ success: z.boolean(), sessionId: z.string(), token: z.string(), message: z.string() })
  .openapi({ title: 'AuthLoginResponse' });
const ValidateResponse = z
  .object({ valid: z.boolean(), user: UserSchema.optional() })
  .openapi({ title: 'ValidateResponse' });
const ErrorSchema = z.object({ error: z.string() }).openapi({ title: 'Error' });

// Register component schemas
registry.register('User', UserSchema);
registry.register('AuthLoginResponse', AuthLoginResponse);
registry.register('ValidateResponse', ValidateResponse);
registry.register('Error', ErrorSchema);
registry.register('LoginBody', loginSchema);
registry.register('LogoutBody', logoutSchema);
registry.register('RegisterBody', registerSchema);
registry.register('ValidateBody', validateSchema);
registry.register('InsertBody', insertSchema);
registry.register('UpdateBody', updateSchema);
registry.register('DeleteBody', deleteSchema);
registry.register('TableParams', tableParamSchema);

// Paths
registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: AuthLoginResponse } } } }
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/validate',
  request: { body: { content: { 'application/json': { schema: validateSchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: ValidateResponse } } } }
});

registry.registerPath({
  method: 'get',
  path: '/api/tables',
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(z.string()) } } } }
});

registry.registerPath({
  method: 'get',
  path: '/api/table/{name}',
  request: { params: tableParamSchema },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(z.record(z.string())) } } } }
});

registry.registerPath({
  method: 'post',
  path: '/api/table/{name}/insert',
  request: { params: tableParamSchema, body: { content: { 'application/json': { schema: insertSchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ status: z.string() }) } } } }
});

registry.registerPath({
  method: 'post',
  path: '/api/table/{name}/update',
  request: { params: tableParamSchema, body: { content: { 'application/json': { schema: updateSchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ status: z.string() }) } } } }
});

registry.registerPath({
  method: 'post',
  path: '/api/table/{name}/delete',
  request: { params: tableParamSchema, body: { content: { 'application/json': { schema: deleteSchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ status: z.string() }) } } } }
});

export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'DERPS Backend Node API', version: '0.1.0' }
  });
}
