export function index(_req, res) {
  res.type('html').send('<h1>Index</h1>');
}

export function loginPage(_req, res) {
  res.type('html').send('<h1>Login</h1>');
}
