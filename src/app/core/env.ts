const isLocalhost =
  typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const ENV = {
  API_URL: isLocalhost
    ? 'http://localhost:3000'
    : 'https://nano-clean-api.fly.dev',
};