const { proto, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const sequelize = require("../../config/database");
const logger = require("../services/logger");

// Penyimpanan kredensial Baileys di MySQL (tabel "Session"), memakai koneksi Sequelize yang sama.
const TABLE = "Session";
let tableReady = null;

function ensureTable() {
  tableReady ??= sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        session_key VARCHAR(255) NOT NULL,
        id VARCHAR(255) NOT NULL,
        data LONGTEXT,
        PRIMARY KEY (session_key, id)
      )`,
    )
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

module.exports = async function useMySQLAuthState(instanceKey) {
  // Pola sanitasi ini dipertahankan agar sesi lama tetap terbaca
  const sessionKey = String(instanceKey).replace(/[^a-zA-Z0-9_]/g, "_");
  await ensureTable();

  const writeData = async (data, id) => {
    try {
      const json = JSON.stringify(data, BufferJSON.replacer);
      await sequelize.query(
        `INSERT INTO \`${TABLE}\` (session_key, id, data) VALUES (:sessionKey, :id, :json)
         ON DUPLICATE KEY UPDATE data = VALUES(data)`,
        { replacements: { sessionKey, id, json } },
      );
    } catch (err) {
      logger.error({ err, id }, "Gagal menulis sesi WhatsApp ke MySQL");
    }
  };

  const readData = async (id) => {
    try {
      const [rows] = await sequelize.query(
        `SELECT data FROM \`${TABLE}\` WHERE session_key = :sessionKey AND id = :id`,
        { replacements: { sessionKey, id } },
      );
      if (!rows.length) return null;
      const raw = rows[0].data;
      return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw), BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await sequelize.query(
        `DELETE FROM \`${TABLE}\` WHERE session_key = :sessionKey AND id = :id`,
        { replacements: { sessionKey, id } },
      );
    } catch {
      /* abaikan */
    }
  };

  const removeCreds = async () => {
    try {
      await sequelize.query(`DELETE FROM \`${TABLE}\` WHERE session_key = :sessionKey`, {
        replacements: { sessionKey },
      });
    } catch {
      /* abaikan */
    }
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const rowId = `${category}-${id}`;
              tasks.push(value ? writeData(value, rowId) : removeData(rowId));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
    removeCreds,
  };
};
