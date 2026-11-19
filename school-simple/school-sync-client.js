/* School diary encrypted snapshot client. No passphrase is persisted. */
(() => {
  "use strict";
  const DB_NAME = "school-diary-private";
  const DB_VERSION = 1;
  const STORE = "records";
  const SNAPSHOT_KEY = "latest-snapshot";
  const CRYPTO_KEY = "aes-key";
  const DATA_URL = "https://raw.githubusercontent.com/G-Spitfire/tracker/school-data/data.enc.json";

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }
  async function dbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  async function deriveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }
  function requestPassphrase() {
    return new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px";
      const form = document.createElement("form");
      form.style.cssText = "width:min(100%,360px);background:var(--card,#fff);color:var(--text,#222);padding:24px;border-radius:16px;box-shadow:0 8px 36px #0004";
      const title = document.createElement("h2");
      title.textContent = "Подключение дневника";
      title.style.cssText = "margin:0 0 12px;font-size:20px";
      const description = document.createElement("p");
      description.textContent = "Введите пароль шифрования, сохранённый на Mac. Он не будет сохранён в открытом виде.";
      description.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 14px";
      const field = document.createElement("input");
      field.type = "password";
      field.autocomplete = "off";
      field.required = true;
      field.placeholder = "Пароль шифрования";
      field.setAttribute("aria-label", "Пароль шифрования");
      field.style.cssText = "box-sizing:border-box;width:100%;padding:12px;border:1px solid #999;border-radius:8px;font-size:16px;color:#222;background:#fff";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:16px";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Отмена";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Подключить";
      for (const button of [cancel, submit]) button.style.cssText = "padding:10px 14px;border-radius:8px;border:1px solid #aaa;cursor:pointer";
      submit.style.background = "#376fe5";
      submit.style.color = "#fff";
      actions.append(cancel, submit);
      form.append(title, description, field, actions);
      overlay.append(form);
      document.body.append(overlay);
      const close = () => overlay.remove();
      cancel.addEventListener("click", () => { close(); reject(new Error("Подключение отменено")); });
      form.addEventListener("submit", event => { event.preventDefault(); const value = field.value; field.value = ""; close(); resolve(value); });
      field.focus();
    });
  }
  async function decryptEnvelope(envelope) {
    if (envelope.format !== "school-diary-encrypted" || envelope.version !== 1 ||
        envelope.kdf !== "PBKDF2-SHA256" || envelope.cipher !== "AES-256-GCM" ||
        envelope.iterations !== 600000) throw new Error("Unsupported encrypted data format");
    const salt = fromB64(envelope.salt);
    let key = await dbGet(CRYPTO_KEY);
    if (!key) {
      const passphrase = await requestPassphrase();
      if (!passphrase) throw new Error("Для первого подключения нужен пароль шифрования");
      key = await deriveKey(passphrase, salt);
      await dbSet(CRYPTO_KEY, key);
    }
    const nonce = fromB64(envelope.nonce);
    const ciphertext = fromB64(envelope.ciphertext);
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode("school-diary-v1") }, key, ciphertext);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (error) {
      // A changed password/salt must not silently leave a permanently unusable key.
      await dbSet(CRYPTO_KEY, null);
      throw new Error("Не удалось расшифровать данные. Проверь пароль шифрования и повтори синхронизацию.");
    }
  }
  async function sync(options = {}) {
    const cached = await dbGet(SNAPSHOT_KEY).catch(() => null);
    if (navigator.onLine && options.force !== false) {
      try {
        const response = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("Не удалось загрузить зашифрованные данные (" + response.status + ")");
        const envelope = await response.json();
        const data = await decryptEnvelope(envelope);
        if (data.schemaVersion !== 1 || !data.children || !data.children.polina || !data.children.matvey) {
          throw new Error("Получен файл неизвестной или неполной структуры");
        }
        const record = { data, savedAt: new Date().toISOString(), generatedAt: data.generatedAt || null };
        await dbSet(SNAPSHOT_KEY, record);
        return { data, source: "network", savedAt: record.savedAt };
      } catch (error) {
        if (cached) return { data: cached.data, source: "cache", savedAt: cached.savedAt, warning: error.message };
        throw error;
      }
    }
    if (cached) return { data: cached.data, source: "cache", savedAt: cached.savedAt };
    throw new Error("Нет сохранённых данных. Подключись к интернету и выполни первую синхронизацию.");
  }
  async function readCached() {
    const cached = await dbGet(SNAPSHOT_KEY).catch(() => null);
    if (!cached || !cached.data || cached.data.schemaVersion !== 1 || !cached.data.children?.polina || !cached.data.children?.matvey) return null;
    return { data: cached.data, source: 'cache', savedAt: cached.savedAt };
  }
  async function clearLocal() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  window.SchoolSync = { sync, readCached, clearLocal };
})();
