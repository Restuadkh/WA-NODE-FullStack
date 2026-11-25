const User = require("./User");
const Device = require("./Device");
const Chat = require("./Chat");
const Message = require("./Message");
const ContactName = require("./ContactName");

Device.hasMany(Chat, { foreignKey: "device_id", onDelete: "CASCADE" });
Chat.belongsTo(Device, { foreignKey: "device_id" });

// Pemetaan nomor <-> LID dan nama kontak (dipakai Inbox untuk menampilkan identitas).
Device.hasMany(ContactName, { foreignKey: "device_id", onDelete: "CASCADE" });
ContactName.belongsTo(Device, { foreignKey: "device_id" });

Chat.hasMany(Message, { foreignKey: "chat_id", onDelete: "CASCADE" });
Message.belongsTo(Chat, { foreignKey: "chat_id" });

User.hasMany(Message, { foreignKey: "sent_by_user_id" });
Message.belongsTo(User, { foreignKey: "sent_by_user_id" });

module.exports = { User, Device, Chat, Message, ContactName };
