/*
  Client ID integrado (opcional).

  Si lo rellenas, Onda mostrará solo «Iniciar sesión con Spotify», sin pedir a nadie
  que cree su propia app. Ojo: en el modo desarrollo de Spotify solo pueden entrar
  hasta 5 cuentas, y cada una hay que añadirla a mano en el panel de desarrolladores
  (tu app → User Management). Para un uso público hace falta la «extended quota»,
  que Spotify solo concede a empresas.

  Déjalo vacío en versiones públicas: cada persona usará su propia app.
*/
window.ONDA_CONFIG = {
  clientId: '',
};
