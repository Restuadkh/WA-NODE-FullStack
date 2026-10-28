const { AutoReplyRule } = require("../models");
const { findDevice, httpError } = require("./devices.controller");
const { assertDeviceAccess } = require("../services/deviceAccess");

const MATCH_TYPES = ["exact", "contains", "starts_with"];

function parseRule(body, partial = false) {
  const out = {};
  if (!partial || body.keyword !== undefined) {
    out.keyword = String(body.keyword ?? "").trim();
    if (!out.keyword) throw httpError("Keyword wajib diisi (gunakan * untuk semua pesan)", 400);
    if (out.keyword.length > 255) throw httpError("Keyword terlalu panjang", 400);
  }
  if (!partial || body.reply_text !== undefined) {
    out.reply_text = String(body.reply_text ?? "").trim();
    if (!out.reply_text) throw httpError("Isi balasan wajib diisi", 400);
    if (out.reply_text.length > 4096) throw httpError("Balasan terlalu panjang", 400);
  }
  if (body.match_type !== undefined) {
    if (!MATCH_TYPES.includes(body.match_type)) throw httpError("match_type tidak valid", 400);
    out.match_type = body.match_type;
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isInteger(p)) throw httpError("priority harus bilangan bulat", 400);
    out.priority = p;
  }
  if (body.is_active !== undefined) out.is_active = !!body.is_active;
  return out;
}

async function findRule(id) {
  const rule = await AutoReplyRule.findByPk(id);
  if (!rule) throw httpError("Rule tidak ditemukan", 404);
  return rule;
}

async function listRules(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const rules = await AutoReplyRule.findAll({
    where: { device_id: req.params.deviceId },
    order: [
      ["priority", "DESC"],
      ["createdAt", "ASC"],
    ],
  });
  res.json({ error: false, data: rules });
}

async function createRule(req, res) {
  const device = await findDevice(req.params.deviceId);
  const rule = await AutoReplyRule.create({ ...parseRule(req.body || {}), device_id: device.id });
  res.status(201).json({ error: false, data: rule });
}

async function updateRule(req, res) {
  const rule = await findRule(req.params.id);
  await rule.update(parseRule(req.body || {}, true));
  res.json({ error: false, data: rule });
}

async function removeRule(req, res) {
  const rule = await findRule(req.params.id);
  await rule.destroy();
  res.json({ error: false, message: "Rule dihapus" });
}

module.exports = { listRules, createRule, updateRule, removeRule };
