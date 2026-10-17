const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const AutoReplyRule = sequelize.define("AutoReplyRule", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  device_id: { type: DataTypes.UUID, allowNull: false },
  keyword: { type: DataTypes.STRING, allowNull: false }, // "halo", atau "*" untuk semua pesan
  match_type: {
    type: DataTypes.ENUM("exact", "contains", "starts_with"),
    defaultValue: "contains",
  },
  reply_text: { type: DataTypes.TEXT, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  priority: { type: DataTypes.INTEGER, defaultValue: 0 }, // makin besar makin didahulukan
});

module.exports = AutoReplyRule;
