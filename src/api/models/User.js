const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const User = sequelize.define("User", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  // admin = kelola device & user; agent = balas chat.
  role: { type: DataTypes.ENUM("admin", "agent"), defaultValue: "agent" },
});

module.exports = User;
