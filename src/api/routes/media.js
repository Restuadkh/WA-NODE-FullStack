const express = require("express");
const mediaStore = require("../services/mediaStore");

// GET /media/:deviceId/:filename?e=<expiry>&t=<tanda tangan>
// URL dibuat oleh services/mediaStore.publicUrl() dan diperbarui tiap kali inbox dibuka.
const router = express.Router();

router.get("/:deviceId/:filename", (req, res) => {
  const { deviceId, filename } = req.params;
  if (!mediaStore.verify(deviceId, filename, req.query.t, req.query.e)) {
    return res.status(403).json({ error: true, message: "Tanda tangan media tidak valid atau kedaluwarsa" });
  }
  const file = mediaStore.resolve(deviceId, filename);
  if (!file) return res.status(404).json({ error: true, message: "Media tidak ditemukan" });

  res.set("Cache-Control", "private, max-age=3600");
  res.sendFile(file, { headers: { "X-Content-Type-Options": "nosniff" } });
});

module.exports = router;
