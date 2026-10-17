const pino = require("pino");
const config = require("../../config/config");

// Satu logger ke stdout (PM2 / journald yang mengurus rotasi file).
const logger = pino({
  level: config.logLevel,
  serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
});

module.exports = logger;
