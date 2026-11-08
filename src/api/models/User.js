const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const User = sequelize.define("User", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  // super_admin = akses penuh SEMUA device; admin = hanya device yang ditugaskan/dibuatnya; agent = hanya device penugasan.
  role: { type: DataTypes.ENUM("super_admin", "admin", "agent"), defaultValue: "agent" },
});

module.exports = User;
