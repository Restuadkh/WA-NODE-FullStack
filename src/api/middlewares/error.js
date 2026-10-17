const config = require("../../config/config");
const logger = require("../services/logger");

const notFound = (req, res) =>
  res.status(404).json({ error: true, message: "Endpoint tidak ditemukan" });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;
  let message = err.message;

  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "Ukuran file terlalu besar";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Body request bukan JSON yang valid";
  }

  if (status >= 500) {
    logger.error({ err, path: req.path }, "Unhandled error");
    if (config.isProduction) message = "Terjadi kesalahan pada server";
  }

  if (res.headersSent) return;
  res.status(status).json({ error: true, message });
};

module.exports = { notFound, errorHandler };
