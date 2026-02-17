export function jsonResponse(res, obj, status = 200) {
  res.status(status).json(obj);
}
