export function isAdminCredentials(email, password) {
  return (
    String(email || '').trim().toLowerCase() === 'gitrepo02@gmail.com' &&
    String(password || '') === 'admin12345'
  );
}
