const { Sequelize } = require("sequelize");
const config = require("./config");

const common = {
  logging: false,
  define: { underscored: true, timestamps: true },
};

const sequelize =
  config.db.dialect === "sqlite"
    ? // Opsional untuk development/test tanpa MySQL (butuh: npm i sqlite3)
      new Sequelize({ dialect: "sqlite", storage: config.db.storage, ...common })
    : new Sequelize(config.db.name, config.db.user, config.db.password, {
        host: config.db.host,
        port: config.db.port,
        dialect: "mysql",
        pool: { max: 10, min: 0, idle: 10000 },
        ...common,
      });

module.exports = sequelize;
