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

function tableNameOf(model) {
  const name = model.getTableName();
  return typeof name === "string" ? name : name.tableName;
}

async function ensureMediaColumns({ log = () => {}, dryRun = false } = {}) {
  const { Message } = require("../models");
  const qi = sequelize.getQueryInterface();
  const table = tableNameOf(Message);

  let existing;
  try {
    existing = await qi.describeTable(table);
  } catch {
    // Tabel belum ada (DB baru). sequelize.sync() akan membuatnya lengkap.
    log(`${table}: tabel belum ada, kolom media dibuat oleh sync()`);
    return { added: [], existing: [] };
  }

  const added = [];
  for (const [name, definition] of Object.entries(MEDIA_COLUMNS)) {
    if (existing[name]) continue;
    if (dryRun) {
      log(`${table}: [dry-run] akan menambah kolom ${name}`);
      continue;
    }
    await qi.addColumn(table, name, definition);
    added.push(name);
    log(`${table}: kolom ${name} ditambahkan`);
  }
  return { added, existing: Object.keys(MEDIA_COLUMNS).filter((name) => existing[name]) };
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

// `tolerant` dipakai saat start server: kegagalan hanya diperingatkan.
async function ensureMediaSchema({ log = () => {}, warn = log, dryRun = false, tolerant = false } = {}) {
  const result = { columns: { added: [], existing: [] }, enumChanged: false };
  try {
    result.columns = await ensureMediaColumns({ log, dryRun });
    const enumResult = await ensureMessageTypeEnum({ log, dryRun });
    result.enumChanged = !!enumResult.changed;
  } catch (err) {
    if (!tolerant) throw err;
    warn(`Skema media belum lengkap (${err.message}). Jalankan: npm run db:upgrade`);
  }
  return result;
}

module.exports = { ensureMediaSchema, ensureMediaColumns, ensureMessageTypeEnum, MEDIA_COLUMNS, TYPE_VALUES };
