// Erreur métier avec code HTTP et message lisible par le client
export class AppError extends Error {
  constructor(status, message, code = 'ERREUR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
