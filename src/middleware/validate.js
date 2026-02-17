import { jsonResponse } from '../utils/response.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const input = source === 'params' ? req.params : source === 'query' ? req.query : req.body;
    const result = schema.safeParse(input);
    if (!result.success) {
      return jsonResponse(res, { error: 'Validation failed', details: result.error.flatten() }, 400);
    }
    if (source === 'params') req.params = result.data;
    else if (source === 'query') req.query = result.data;
    else req.body = result.data;
    next();
  };
}
