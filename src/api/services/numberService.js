/**
 * Mengambil WhatsApp JID berdasarkan nomor telepon.
 * Mendukung remoteJid dan remoteJidAlt.
 */
const { Number } = require("../models");

function getWhatsappJid(key) {
    if (!key) return null;

    const { remoteJid, remoteJidAlt, participant, participantAlt } = key;

    // Prioritaskan nomor WhatsApp asli
    const jids = [
        remoteJidAlt,
        remoteJid,
        participantAlt,
        participant,
    ];

    return jids.find(
        jid => typeof jid === "string" && jid.endsWith("@s.whatsapp.net")
    ) || null;
}

function getWhatsappLid(key) {
    if (!key) return null;

    const { remoteJid, remoteJidAlt, participant, participantAlt } = key;

    // Prioritaskan nomor WhatsApp asli
    const jids = [
        remoteJidAlt,
        remoteJid,
        participantAlt,
        participant,
    ];

    return jids.find(
        jid => typeof jid === "string" && jid.endsWith("@lid")
    ) || null;
}


function getWhatsappName(message) {
    if (!message) return null;

    const { pushName, verifiedBizName,  } = message;

    // Prioritaskan nomor WhatsApp asli
    const name = [
        pushName,
        verifiedBizName,
    ].find(n => typeof n === "string" && n.length > 0) || null;

    return name;
}

async function storeNumberName(jid,lid,name,device) {
    if (!jid || !lid || !name) return;
	const fromJid = jid;
	const lidUser = lid;
	const device_id = device.id;
	const notify = name;
    // Implementasikan logika penyimpanan nama nomor WhatsApp di sini
    await Number.create({
        fromJid,
        lidUser,
        notify,
        device_id,
    });
}


module.exports = { getWhatsappJid, getWhatsappLid, getWhatsappName, storeNumberName };