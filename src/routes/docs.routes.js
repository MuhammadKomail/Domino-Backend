import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiDocument } from '../docs/openapi.js';

const router = Router();

const openapiDoc = getOpenApiDocument();

router.get('/openapi.json', (_req, res) => {
  res.json(openapiDoc);
});

router.use('/', swaggerUi.serve, swaggerUi.setup(openapiDoc));

export default router;
