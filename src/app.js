import express from 'express';
import routes from './routes/index.js';
import morgan from 'morgan';
import { corsMiddleware } from './middleware/cors.js';
import { notFound, errorHandler } from './middleware/error.js';
import { requestResponseLogger } from './middleware/requestLogger.js';
import { apiFileLogger } from './middleware/apiFileLogger.js';

const app = express();

app.use(morgan('dev'));
app.use(corsMiddleware());
app.use(express.json());
app.use(apiFileLogger());
app.use(requestResponseLogger);

app.use('/admin/', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
