const User = require("./User");
const Device = require("./Device");
const Chat = require("./Chat");
const Message = require("./Message");
const AutoReplyRule = require("./AutoReplyRule");
const ContactName = require("./ContactName");
const MessageJob = require("./MessageJob");
const DeviceAgent = require("./DeviceAgent");

Device.hasMany(Chat, { foreignKey: "device_id", onDelete: "CASCADE" });
Chat.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(ContactName, { foreignKey: "device_id", onDelete: "CASCADE" });
ContactName.belongsTo(Device, { foreignKey: "device_id" });

Chat.hasMany(Message, { foreignKey: "chat_id", onDelete: "CASCADE" });
Message.belongsTo(Chat, { foreignKey: "chat_id" });

User.hasMany(Message, { foreignKey: "sent_by_user_id" });
Message.belongsTo(User, { foreignKey: "sent_by_user_id" });

Device.hasMany(AutoReplyRule, { foreignKey: "device_id", onDelete: "CASCADE" });
AutoReplyRule.belongsTo(Device, { foreignKey: "device_id" });

Device.hasMany(MessageJob, { foreignKey: "device_id", onDelete: "CASCADE" });
MessageJob.belongsTo(Device, { foreignKey: "device_id" });
MessageJob.belongsTo(Message, { foreignKey: "message_id" });
MessageJob.belongsTo(User, { foreignKey: "created_by_user_id" });

// ACL: agent hanya melihat device yang ditugaskan (DeviceAgent).
Device.belongsToMany(User, { through: DeviceAgent, foreignKey: "device_id", otherKey: "user_id" });
User.belongsToMany(Device, { through: DeviceAgent, foreignKey: "user_id", otherKey: "device_id" });

module.exports = { User, Device, Chat, Message, AutoReplyRule, ContactName, MessageJob, DeviceAgent };
