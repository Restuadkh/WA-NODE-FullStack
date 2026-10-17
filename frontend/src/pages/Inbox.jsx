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

const dayLabel = (d) => new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function Ticks({ status }) {
  if (status === "failed") return <span className="tick tick-failed">gagal</span>;
  if (status === "pending") return <span className="tick">…</span>;
  if (status === "sent") return <span className="tick">✓</span>;
  return <span className={`tick ${status === "read" ? "tick-read" : ""}`}>✓✓</span>;
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

  const bottomRef = useRef(null);
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) || null, [chats, activeId]);

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
  }, [deviceId]);

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
    if (!body || !activeChat || sending) return;
    setSending(true);
    setError("");
    try {
      const msg = await api.sendMessage(activeChat.id, body);
      setText("");
      setMessages((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg]));
      loadChats(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
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
                      {row.m.type !== "text" && row.m.type !== "other" && <div className="media-tag">{row.m.type}</div>}
                      {row.m.media_url && (
                        <a href={row.m.media_url} target="_blank" rel="noreferrer" className="small">
                          Buka media
                        </a>
                      )}
                      <div className="bubble-text">{row.m.body}</div>
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
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Tulis balasan…"
                title="Enter = kirim, Shift+Enter = baris baru"
                rows={1}
              />
              <button className="btn btn-primary" disabled={sending || !text.trim()}>
                {sending ? "Mengirim…" : "Kirim"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
