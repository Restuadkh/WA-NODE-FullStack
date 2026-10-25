// Index tambahan (v2.1) dikelola di sini, BUKAN di definisi model.
//
// Alasan: Sequelize v6 `sync()` ikut menambah index model yang belum ada ke tabel yang sudah ada.
// Pada DB lama yang sudah berisi baris duplikat, itu membuat server GAGAL START. Dengan modul ini:
//   - start server  : index dipasang bila bisa; bila gagal (ada duplikat) hanya peringatan, server tetap jalan
//   - db:upgrade    : hapus duplikat lalu pasang index (lihat src/scripts/dbUpgrade.js)
const sequelize = require("../../config/database");

const models = () => require("../models"); // lazy: hindari require melingkar

// keep: baris mana yang dipertahankan saat ada duplikat (id = UUIDv7 berurutan waktu)
const DEFINITIONS = [
  // numbers: satu baris per (device, lid). MAX = terbaru (nama kontak terkini)
  { model: "ContactName", name: "numbers_device_lid_unique", fields: ["device_id", "lid_user"], unique: true, keep: "MAX" },
  // messages: cegah pesan ganda saat event WhatsApp datang bersamaan. MIN = terlama. NULL boleh berulang.
  { model: "Message", name: "messages_chat_wa_message_unique", fields: ["chat_id", "wa_message_id"], unique: true, keep: "MIN" },
  // messages: riwayat chat (WHERE chat_id ORDER BY created_at)
  { model: "Message", name: "messages_chat_created_idx", fields: ["chat_id", "created_at"] },
];

const tableOf = (model) => {
  const t = model.getTableName();
  return typeof t === "string" ? t : t.tableName;
};

async function findDuplicateGroups(model, fields, keep) {
  const qi = sequelize.getQueryInterface();
  const q = (n) => qi.quoteIdentifier(n);
  const cols = fields.map(q).join(", ");
  const notNull = fields.map((c) => `${q(c)} IS NOT NULL`).join(" AND ");
  const [rows] = await sequelize.query(
    `SELECT ${cols}, ${keep}(${q("id")}) AS keep_id, COUNT(*) AS total
       FROM ${q(tableOf(model))} WHERE ${notNull}
      GROUP BY ${cols} HAVING COUNT(*) > 1`,
  );
  return rows;
}

// Hapus baris duplikat (sisakan satu per grup). dryRun = hanya hitung.
async function removeDuplicates(def, { dryRun = false, log = () => {} } = {}) {
  const model = models()[def.model];
  const qi = sequelize.getQueryInterface();
  const q = (n) => qi.quoteIdentifier(n);
  const table = tableOf(model);

  const groups = await findDuplicateGroups(model, def.fields, def.keep || "MIN");
  const extra = groups.reduce((sum, g) => sum + (Number(g.total) - 1), 0);
  log(`${table}: ${extra} baris duplikat di ${groups.length} grup (${def.fields.join(", ")})`);
  if (dryRun || !groups.length) return extra;

  for (const g of groups) {
    const where = def.fields.map((c) => `${q(c)} = :${c}`).join(" AND ");
    await sequelize.query(`DELETE FROM ${q(table)} WHERE ${where} AND ${q("id")} <> :keep_id`, { replacements: g });
  }
  log(`${table}: ${extra} baris duplikat dihapus`);
  return extra;
}

/**
 * Pasang index yang belum ada.
 *   dedupe   : hapus duplikat dulu (db:upgrade). Saat start server = false.
 *   tolerant : kegagalan hanya diperingatkan (start server). false = lempar error (db:upgrade).
 *   dryRun   : hanya laporkan, tanpa mengubah apa pun.
 */
async function ensureIndexes({ dedupe = false, tolerant = false, dryRun = false, log = () => {}, warn } = {}) {
  const warnFn = warn || log;
  const qi = sequelize.getQueryInterface();
  const summary = { created: [], existing: [], failed: [] };
  const existingByTable = new Map();

  for (const def of DEFINITIONS) {
    const model = models()[def.model];
    const table = tableOf(model);
    if (!existingByTable.has(table)) {
      existingByTable.set(table, new Set((await qi.showIndex(table)).map((i) => i.name)));
    }

    if (existingByTable.get(table).has(def.name)) {
      log(`${table}: index ${def.name} sudah ada`);
      summary.existing.push(def.name);
      continue;
    }

    try {
      if (def.unique && (dedupe || dryRun)) await removeDuplicates(def, { dryRun, log });
      if (dryRun) {
        log(`${table}: [dry-run] akan membuat index ${def.name}`);
        continue;
      }
      await qi.addIndex(table, def.fields, { name: def.name, unique: !!def.unique });
      log(`${table}: index ${def.name} dibuat`);
      summary.created.push(def.name);
    } catch (err) {
      if (!tolerant) throw err;
      summary.failed.push(def.name);
      warnFn(
        `${table}: index ${def.name} gagal dibuat (${err.message}). Kemungkinan ada data duplikat. ` +
          "Backup database lalu jalankan: npm run db:upgrade",
      );
    }
  }
  return summary;
}

module.exports = { DEFINITIONS, ensureIndexes, removeDuplicates, findDuplicateGroups };
