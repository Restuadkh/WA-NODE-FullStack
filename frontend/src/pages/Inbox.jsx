import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getSocket } from "../socket";

const DEVICE_KEY = "wa_selected_device";

const jidLabel = (chat) => chat.contact_name || chat.wa_jid.split("@")[0];
const jidNumber = (chat) => chat.wa_jid.split("@")[0];
const initials = (s) => (s || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";

function fmtListTime(d) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

const fmtDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const dayLabel = (d) => new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function Ticks({ status }) {
  if (status === "failed") return <span className="tick tick-failed">gagal</span>;
  if (status === "pending") return <span className="tick">…</span>;
  if (status === "sent") return <span className="tick">✓</span>;
  return <span className={`tick ${status === "read" ? "tick-read" : ""}`}>✓✓</span>;
}

const MEDIA_LABEL = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  sticker: "Stiker",
  document: "Dokumen",
};

// Tebak jenis media dari file yang dipilih (webp = stiker).
function mediaTypeForFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.type || "").toLowerCase();
  if (mime === "image/webp" || name.endsWith(".webp")) return "sticker";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

const bodyText = (m) => {
  if (m.media_caption) return m.media_caption;
  if (!m.body) return "";
  return /^\[(Gambar|Video|Stiker|Audio|Pesan suara|Dokumen)\]/.test(m.body) ? "" : m.body;
};

// Tampilan media di dalam bubble. URL media sudah bertanda tangan dari server.
function MediaContent({ m }) {
  if (!m.media_url) {
    return m.type !== "text" && m.type !== "other" ? <div className="media-tag">{MEDIA_LABEL[m.type] || m.type}</div> : null;
  }

  if (m.type === "image") {
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer" className="media-wrap">
        <img className="bubble-media" src={m.media_url} alt={m.media_caption || "Gambar"} loading="lazy" />
      </a>
    );
  }
  if (m.type === "video") {
    return <video className="bubble-media" src={m.media_url} controls playsInline preload="metadata" />;
  }
  if (m.type === "sticker") {
    return <img className="bubble-sticker" src={m.media_url} alt="Stiker" loading="lazy" />;
  }
  if (m.type === "audio") {
    return (
      <div className="voice-note">
        <audio src={m.media_url} controls preload="metadata" />
        <span className="small muted">{m.media_ptt ? "Pesan suara" : "Audio"}</span>
      </div>
    );
  }
  if (m.type === "document") {
    return (
      <a className="doc-link" href={m.media_url} target="_blank" rel="noreferrer">
        📄 {m.media_filename || "Dokumen"}
      </a>
    );
  }
  return (
    <a href={m.media_url} target="_blank" rel="noreferrer" className="small">
      Buka media
    </a>
  );
}

export default function Inbox() {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_KEY) || "");
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [attachment, setAttachment] = useState(null); // { file, type, ptt, name, previewUrl }
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const bottomRef = useRef(null);
  const activeIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunks = useRef([]);
  const recorderCancelled = useRef(false);
  const attachmentRef = useRef(null);
  attachmentRef.current = attachment;
  activeIdRef.current = activeId;

  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) || null, [chats, activeId]);

  const clearAttachment = useCallback(() => {
    setAttachment((cur) => {
      if (cur?.previewUrl) URL.revokeObjectURL(cur.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Bersihkan object URL & mikrofon saat komponen dilepas
  useEffect(
    () => () => {
      if (attachmentRef.current?.previewUrl) URL.revokeObjectURL(attachmentRef.current.previewUrl);
      try {
        recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
      } catch {
        /* abaikan */
      }
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Tandai dibaca di server (dipakai bersama oleh semua agent) lalu nolkan badge secara lokal
  const markRead = useCallback((chatId) => {
    setChats((list) => list.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
    api.markRead(chatId).catch(() => {});
  }, []);

  // --- daftar device
  useEffect(() => {
    api
      .listDevices()
      .then((list) => {
        setDevices(list);
        setDeviceId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id || ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setDevicesLoaded(true));
  }, []);

  useEffect(() => {
    if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId);
    setActiveId(null);
    setMessages([]);
    setMobileChatOpen(false);
    clearAttachment();
  }, [deviceId, clearAttachment]);

  // --- daftar chat (+ polling cadangan)
  const loadChats = useCallback(
    async (showSpinner) => {
      if (!deviceId) return;
      if (showSpinner) setLoadingChats(true);
      try {
        setChats(await api.listChats(deviceId));
        setError("");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingChats(false);
      }
    },
    [deviceId],
  );

  const loadMessages = useCallback(async (chatId) => {
    try {
      const list = await api.listMessages(chatId);
      if (activeIdRef.current === chatId) setMessages(list);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadChats(true);
    const t = setInterval(() => {
      loadChats(false);
      if (activeIdRef.current) loadMessages(activeIdRef.current);
    }, 8000);
    return () => clearInterval(t);
  }, [loadChats, loadMessages]);

  // --- realtime
  useEffect(() => {
    if (!deviceId) return;
    const socket = getSocket();
    const join = () => socket.emit("join:device", deviceId);
    join();
    socket.on("connect", join);

    const onNew = async ({ chat_id, message }) => {
      const isActive = chat_id === activeIdRef.current;
      if (isActive) {
        setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
        // chat sedang dibuka -> pesan masuk langsung dianggap terbaca
        if (message.direction === "incoming") await api.markRead(chat_id).catch(() => {});
      }
      loadChats(false); // urutan & unread diambil dari server
    };
    const onUpdate = ({ message_id, status }) =>
      setMessages((list) => list.map((m) => (m.id === message_id ? { ...m, status } : m)));
    const onStatus = ({ device_id, status }) =>
      setDevices((list) => list.map((d) => (d.id === device_id ? { ...d, status } : d)));

    socket.on("message:new", onNew);
    socket.on("message:update", onUpdate);
    socket.on("device:status", onStatus);
    return () => {
      socket.emit("leave:device", deviceId);
      socket.off("connect", join);
      socket.off("message:new", onNew);
      socket.off("message:update", onUpdate);
      socket.off("device:status", onStatus);
    };
  }, [deviceId, loadChats]);

  // --- buka chat
  const openChat = (chat) => {
    setActiveId(chat.id);
    setMessages([]);
    setMobileChatOpen(true);
    if (chat.unread_count > 0) markRead(chat.id);
    loadMessages(chat.id);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeId]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    const file = attachment?.file || null;
    if ((!body && !file) || !activeChat || sending || recording) return;
    setSending(true);
    setError("");
    try {
      const msg = file
        ? await api.sendMedia(activeChat.id, file, {
            caption: body,
            type: attachment.type,
            ptt: !!attachment.ptt,
            filename: attachment.name || file.name,
          })
        : await api.sendMessage(activeChat.id, body);
      setText("");
      clearAttachment();
      if (msg) setMessages((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg]));
      loadChats(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearAttachment();
    const type = mediaTypeForFile(file);
    setAttachment({
      file,
      type,
      ptt: false,
      name: file.name,
      previewUrl:
        type === "image" || type === "video" || type === "sticker" || type === "audio"
          ? URL.createObjectURL(file)
          : null,
    });
    setError("");
    e.target.value = "";
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Perekam suara tidak didukung browser ini.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderChunks.current = [];
      recorderCancelled.current = false;
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size) recorderChunks.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recorderCancelled.current) return;
        const blob = new Blob(recorderChunks.current, { type: recorder.mimeType || "audio/webm" });
        const name = `pesan-suara-${Date.now()}.webm`;
        const file = new File([blob], name, { type: blob.type });
        clearAttachment();
        setAttachment({ file, type: "audio", ptt: true, name, previewUrl: URL.createObjectURL(blob) });
      };
      recorder.start();
      setRecordSeconds(0);
      setRecording(true);
      setError("");
    } catch {
      setError("Tidak bisa mengakses mikrofon. Periksa izin browser.");
    }
  };

  const stopRecording = (cancel = false) => {
    recorderCancelled.current = cancel;
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* abaikan */
    }
    setRecording(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) send(e);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => jidLabel(c).toLowerCase().includes(q) || jidNumber(c).includes(q));
  }, [chats, search]);

  const device = devices.find((d) => d.id === deviceId);

  // pengelompokan pesan per hari
  const grouped = useMemo(() => {
    const out = [];
    let last = "";
    for (const m of messages) {
      const key = new Date(m.created_at || m.createdAt).toDateString();
      if (key !== last) {
        out.push({ type: "day", key, label: dayLabel(m.created_at || m.createdAt) });
        last = key;
      }
      out.push({ type: "msg", key: m.id, m });
    }
    return out;
  }, [messages]);

  if (!devicesLoaded) {
    return <div className="page muted">Memuat…</div>;
  }

  if (devices.length === 0) {
    return (
      <div className="page">
        <div className="card empty">
          Belum ada device. <Link to="/devices">Tambahkan device</Link> dan scan QR dulu untuk mulai menerima chat.
        </div>
      </div>
    );
  }

  return (
    <div className={`inbox ${mobileChatOpen ? "show-chat" : ""}`}>
      <section className="chat-list">
        <div className="chat-list-head">
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Pilih device">
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.phone_number ? ` · ${d.phone_number}` : ""}
              </option>
            ))}
          </select>
          {device && device.status !== "connected" && (
            <div className="alert alert-warn">
              Device {device.status === "pending_qr" ? "belum discan" : "terputus"}. <Link to="/devices">Kelola</Link>
            </div>
          )}
          <input className="input" type="search" placeholder="Cari chat atau nomor" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <ul className="chats">
          {loadingChats && chats.length === 0 && <li className="empty">Memuat…</li>}
          {!loadingChats && filtered.length === 0 && (
            <li className="empty">{search ? "Tidak ada hasil." : "Belum ada chat masuk."}</li>
          )}
          {filtered.map((c) => {
            const unread = c.unread_count > 0;
            return (
              <li key={c.id}>
                <button className={`chat-item ${c.id === activeId ? "active" : ""}`} onClick={() => openChat(c)}>
                  <span className={`avatar ${c.is_group ? "avatar-group" : ""}`}>{initials(jidLabel(c))}</span>
                  <span className="chat-main">
                    <span className="chat-top">
                      <span className="chat-name">{jidLabel(c)}</span>
                      <span className="chat-time">{fmtListTime(c.last_message_at)}</span>
                    </span>
                    <span className="chat-sub">
                      <span className="muted">{c.is_group ? "Grup" : jidNumber(c)}</span>
                      {unread && <span className="unread">{c.unread_count}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="chat-panel">
        {!activeChat ? (
          <div className="chat-empty">
            <div className="chat-empty-art">💬</div>
            <p>Pilih chat di sebelah kiri untuk melihat percakapan.</p>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <button className="btn btn-ghost btn-sm back" onClick={() => setMobileChatOpen(false)}>
                ←
              </button>
              <span className={`avatar ${activeChat.is_group ? "avatar-group" : ""}`}>{initials(jidLabel(activeChat))}</span>
              <div>
                <div className="strong">{jidLabel(activeChat)}</div>
                <div className="muted small">{activeChat.is_group ? "Grup" : jidNumber(activeChat)}</div>
              </div>
            </header>

            <div className="messages">
              {grouped.length === 0 && <div className="empty">Belum ada pesan.</div>}
              {grouped.map((row) =>
                row.type === "day" ? (
                  <div key={row.key} className="day-sep">
                    <span>{row.label}</span>
                  </div>
                ) : (
                  <div key={row.key} className={`bubble-row ${row.m.direction === "outgoing" ? "out" : "in"}`}>
                    <div className={`bubble ${row.m.is_auto_reply ? "bubble-auto" : ""}`}>
                      <MediaContent m={row.m} />
                      {bodyText(row.m) && <div className="bubble-text">{bodyText(row.m)}</div>}
                      <div className="bubble-meta">
                        {row.m.is_auto_reply && <span>auto-reply · </span>}
                        <span>{fmtTime(row.m.created_at || row.m.createdAt)}</span>
                        {row.m.direction === "outgoing" && <Ticks status={row.m.status} />}
                      </div>
                    </div>
                  </div>
                ),
              )}
              <div ref={bottomRef} />
            </div>

            {error && <div className="alert alert-error composer-alert">{error}</div>}

            <form className="composer" onSubmit={send}>
              <div className="composer-body">
                {attachment && (
                  <div className="attachment-preview">
                    {(attachment.type === "image" || attachment.type === "sticker") && (
                      <img src={attachment.previewUrl} alt="Pratinjau" className={attachment.type === "sticker" ? "preview-sticker" : "preview-media"} />
                    )}
                    {attachment.type === "video" && <video src={attachment.previewUrl} className="preview-media" controls />}
                    {attachment.type === "audio" && <audio src={attachment.previewUrl} controls className="preview-audio" />}
                    <span className="small muted">{attachment.ptt ? "Pesan suara" : attachment.name}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearAttachment} title="Hapus lampiran">
                      ✕
                    </button>
                  </div>
                )}

                {recording && (
                  <div className="recording-bar">
                    <span className="rec-dot" /> Merekam {fmtDuration(recordSeconds)}
                    <button type="button" className="btn btn-sm" onClick={() => stopRecording(false)}>
                      Selesai
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => stopRecording(true)}>
                      Batal
                    </button>
                  </div>
                )}

                <div className="composer-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
                    onChange={onPickFile}
                    hidden
                  />
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || recording}
                    title="Lampirkan gambar, video, stiker, audio, atau dokumen"
                  >
                    📎
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost icon-btn ${recording ? "recording" : ""}`}
                    onClick={() => (recording ? stopRecording(false) : startRecording())}
                    disabled={sending}
                    title={recording ? "Selesai merekam" : "Rekam pesan suara"}
                  >
                    {recording ? "⏹" : "🎙"}
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={attachment ? "Tulis caption (opsional)…" : "Tulis balasan…"}
                    title="Enter = kirim, Shift+Enter = baris baru"
                    rows={1}
                    disabled={sending}
                  />
                  <button className="btn btn-primary" disabled={sending || recording || (!text.trim() && !attachment)}>
                    {sending ? "Mengirim…" : recording ? "Rekam…" : "Kirim"}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
