const User = require("./User");
const Device = require("./Device");
const Chat = require("./Chat");
const Message = require("./Message");
const AutoReplyRule = require("./AutoReplyRule");
const Number = require("./Number");

Device.hasMany(Chat, { foreignKey: "device_id", onDelete: "CASCADE" });
Chat.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(Number, { foreignKey: "device_id", onDelete: "CASCADE" });
Number.belongsTo(Device, { foreignKey: "device_id" });

Chat.hasMany(Message, { foreignKey: "chat_id", onDelete: "CASCADE" });
Message.belongsTo(Chat, { foreignKey: "chat_id" });

User.hasMany(Message, { foreignKey: "sent_by_user_id" });
Message.belongsTo(User, { foreignKey: "sent_by_user_id" });

Device.hasMany(AutoReplyRule, { foreignKey: "device_id", onDelete: "CASCADE" });
AutoReplyRule.belongsTo(Device, { foreignKey: "device_id" });

module.exports = { User, Device, Chat, Message, AutoReplyRule, Number };
