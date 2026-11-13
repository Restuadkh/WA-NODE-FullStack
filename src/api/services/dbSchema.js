const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

// Patches skema untuk fitur media (v2.2).
//
// sequelize.sync() hanya MEMBUAT tabel yang belum ada; kolom baru pada tabel lama tidak
// ditambahkan otomatis. Modul ini melengkapi tabel `messages` tanpa menghapus data:
//   - kolom metadata media (mimetype, ukuran, dimensi, durasi, voice note, caption)
//   - nilai "sticker" pada ENUM type (MySQL/MariaDB)
//
// Dijalankan otomatis saat server start (tolerant) dan oleh `npm run db:upgrade`.
const MEDIA_COLUMNS = {
  media_mimetype: { type: DataTypes.STRING(120), allowNull: true },
  media_filename: { type: DataTypes.STRING(255), allowNull: true },
  media_size: { type: DataTypes.INTEGER, allowNull: true },
  media_width: { type: DataTypes.INTEGER, allowNull: true },
  media_height: { type: DataTypes.INTEGER, allowNull: true },
  media_seconds: { type: DataTypes.INTEGER, allowNull: true },
  media_ptt: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  media_caption: { type: DataTypes.TEXT, allowNull: true },
};

const TYPE_VALUES = ["text", "image", "document", "audio", "video", "sticker", "other"];

// Webhook per device (v2.3). Tabel `devices` lama belum punya kolom ini.
const DEVICE_WEBHOOK_COLUMNS = {
  webhook_url: { type: DataTypes.STRING(500), allowNull: true },
  webhook_secret: { type: DataTypes.STRING(255), allowNull: true },
};

// Antrean: klaim worker (v2.5). Dipakai untuk reset job "sending" yang aman.
const JOB_CLAIM_COLUMNS = {
  claimed_at: { type: DataTypes.DATE, allowNull: true },
};

// Reply/quote pesan (v2.6). Kolom pesan yang dibalas.
const REPLY_COLUMNS = {
  reply_to_wa_id: { type: DataTypes.STRING, allowNull: true },
  reply_to_body: { type: DataTypes.TEXT, allowNull: true },
  reply_to_from_me: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Pengirim asli pesan grup (participant) untuk quoted key saat membalas.
  sender_jid: { type: DataTypes.STRING, allowNull: true },
};

// Tabel `users` lama: kolom hierarki created_by (siapa admin pembuat akun ini).
const USER_HIERARCHY_COLUMNS = {
  created_by: { type: DataTypes.UUID, allowNull: true },
};

// Izin kontak (v2.8). Tabel `role_permissions` lama belum punya kolom ini.
const ROLE_PERMISSION_COLUMNS = {
  contacts_import: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
};

// Role super_admin (v2.7). Tabel `users` lama belum punya nilai ENUM ini.
const USER_ROLE_VALUES = ["super_admin", "admin", "agent"];

function tableNameOf(model) {
  const name = model.getTableName();
  return typeof name === "string" ? name : name.tableName;
}

async function ensureColumns(model, columns, { log = () => {}, dryRun = false } = {}) {
  const qi = sequelize.getQueryInterface();
  const table = tableNameOf(model);

  let existing;
  try {
    existing = await qi.describeTable(table);
  } catch {
    // Tabel belum ada (DB baru). sequelize.sync() akan membuatnya lengkap.
    log(`${table}: tabel belum ada, kolom baru dibuat oleh sync()`);
    return { added: [], existing: [] };
  }

  const added = [];
  for (const [name, definition] of Object.entries(columns)) {
    if (existing[name]) continue;
    if (dryRun) {
      log(`${table}: [dry-run] akan menambah kolom ${name}`);
      continue;
    }
    await qi.addColumn(table, name, definition);
    added.push(name);
    log(`${table}: kolom ${name} ditambahkan`);
  }
  return { added, existing: Object.keys(columns).filter((name) => existing[name]) };
}

async function ensureMediaColumns(options = {}) {
  const { Message } = require("../models");
  return ensureColumns(Message, MEDIA_COLUMNS, options);
}

async function ensureDeviceWebhookColumns(options = {}) {
  const { Device } = require("../models");
  return ensureColumns(Device, DEVICE_WEBHOOK_COLUMNS, options);
}

async function ensureJobClaimColumns(options = {}) {
  const { MessageJob } = require("../models");
  return ensureColumns(MessageJob, JOB_CLAIM_COLUMNS, options);
}

async function ensureReplyColumns(options = {}) {
  const { Message } = require("../models");
  return ensureColumns(Message, REPLY_COLUMNS, options);
}

async function ensureMessageTypeEnum({ log = () => {}, dryRun = false } = {}) {
  if (sequelize.getDialect() !== "mysql") return { changed: false };

  const { Message } = require("../models");
  const qi = sequelize.getQueryInterface();
  const table = tableNameOf(Message);
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM ${qi.quoteIdentifier(table)} LIKE 'type'`);
  const current = String(rows?.[0]?.Type || "");
  // Kolom non-ENUM (mis. VARCHAR) sudah bisa menyimpan "sticker" tanpa diubah.
  if (!current.toLowerCase().startsWith("enum") || current.includes("'sticker'")) {
    return { changed: false };
  }

  if (dryRun) {
    log(`${table}: [dry-run] akan menambah nilai ENUM "sticker" pada kolom type`);
    return { changed: false, pending: true };
  }

  const values = TYPE_VALUES.map((v) => `'${v}'`).join(", ");
  await sequelize.query(
    `ALTER TABLE ${qi.quoteIdentifier(table)} MODIFY COLUMN ${qi.quoteIdentifier("type")} ENUM(${values}) NOT NULL DEFAULT 'text'`,
  );
  log(`${table}: ENUM type diperbarui (menambahkan sticker)`);
  return { changed: true };
}

// Kolom hierarki created_by pada tepi tabel users lama.
async function ensureUserColumns(options = {}) {
  const { User } = require("../models");
  return ensureColumns(User, USER_HIERARCHY_COLUMNS, options);
}

// Kolom izin baru pada tabel role_permissions lama.
async function ensureRolePermissionColumns(options = {}) {
  const { RolePermission } = require("../models");
  return ensureColumns(RolePermission, ROLE_PERMISSION_COLUMNS, options);
}

// Tambah nilai ENUM "super_admin" pada kolom role tabel users lama (MySQL/MariaDB).
async function ensureUserRoleEnum({ log = () => {}, dryRun = false } = {}) {  if (sequelize.getDialect() !== "mysql") return { changed: false };

  const { User } = require("../models");
  const qi = sequelize.getQueryInterface();
  const table = tableNameOf(User);
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM ${qi.quoteIdentifier(table)} LIKE 'role'`);
  const current = String(rows?.[0]?.Type || "");
  // Kolom non-ENUM (mis. VARCHAR) sudah bisa menyimpan "super_admin" tanpa diubah.
  if (!current.toLowerCase().startsWith("enum") || current.includes("'super_admin'")) {
    return { changed: false };
  }

  if (dryRun) {
    log(`${table}: [dry-run] akan menambah nilai ENUM "super_admin" pada kolom role`);
    return { changed: false, pending: true };
  }

  const values = USER_ROLE_VALUES.map((v) => `'${v}'`).join(", ");
  await sequelize.query(
    `ALTER TABLE ${qi.quoteIdentifier(table)} MODIFY COLUMN ${qi.quoteIdentifier("role")} ENUM(${values}) NOT NULL DEFAULT 'agent'`,
  );
  log(`${table}: ENUM role diperbarui (menambahkan super_admin)`);
  return { changed: true };
}

// `tolerant` dipakai saat start server: kegagalan hanya diperingatkan.
async function ensureMediaSchema({ log = () => {}, warn = log, dryRun = false, tolerant = false } = {}) {
  const result = { columns: { added: [], existing: [] }, enumChanged: false };
  try {
    result.columns = await ensureMediaColumns({ log, dryRun });
    await ensureReplyColumns({ log, dryRun });
    const enumResult = await ensureMessageTypeEnum({ log, dryRun });
    result.enumChanged = !!enumResult.changed;
  } catch (err) {
    if (!tolerant) throw err;
    warn(`Skema media belum lengkap (${err.message}). Jalankan: npm run db:upgrade`);
  }
  return result;
}

// `tolerant` dipakai saat start server: kegagalan hanya diperingatkan.
async function ensureDeviceWebhookSchema({ log = () => {}, warn = log, dryRun = false, tolerant = false } = {}) {
  try {
    return await ensureDeviceWebhookColumns({ log, dryRun });
  } catch (err) {
    if (!tolerant) throw err;
    warn(`Kolom webhook device belum lengkap (${err.message}). Jalankan: npm run db:upgrade`);
    return { added: [], existing: [] };
  }
}

module.exports = {
  ensureMediaSchema,
  ensureMediaColumns,
  ensureMessageTypeEnum,
  ensureUserColumns,
  ensureUserRoleEnum,
  ensureRolePermissionColumns,
  ensureDeviceWebhookSchema,
  ensureDeviceWebhookColumns,
  ensureJobClaimColumns,
  ensureReplyColumns,
  MEDIA_COLUMNS,
  DEVICE_WEBHOOK_COLUMNS,
  JOB_CLAIM_COLUMNS,
  REPLY_COLUMNS,
  TYPE_VALUES,
};
