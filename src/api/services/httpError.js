// Helper kecil: Error HTTP dengan statusCode untuk controller/service.
module.exports = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });
