// Lokaler Adapter: localStorage. Kein Login, kein Sync – nur dieses Gerät.
// Gedacht zum Ausprobieren und als Fallback. Bilder werden verkleinert als Data-URL abgelegt
// (localStorage ist auf ~5 MB begrenzt, also nur für wenige Bilder geeignet).

import { uid } from '../utils.js';

const KEYS = { days: 'tj.days', notes: 'tj.notes', checklists: 'tj.checklists' };

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const stamp = (o) => ({ ...o, updated_at: new Date().toISOString() });

async function resizeToDataUrl(file, maxPx = 1400, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function upsertList(key, item) {
  const all = read(key, []);
  const i = all.findIndex((x) => x.id === item.id);
  const saved = stamp(item);
  if (i >= 0) all[i] = saved; else all.unshift(saved);
  write(key, all);
  return saved;
}

export function createLocalAdapter() {
  return {
    mode: 'local',
    async init() { return { id: 'local', email: 'Lokal (nur dieses Gerät)' }; },
    onAuthChange() {},
    async signIn() {},
    async signOut() {},

    async getDays(from, to) {
      return Object.values(read(KEYS.days, {})).filter((d) => d.date >= from && d.date <= to);
    },
    async saveDay(day) {
      const all = read(KEYS.days, {});
      all[day.date] = stamp(day);
      write(KEYS.days, all);
      return all[day.date];
    },
    async deleteDay(iso) {
      const all = read(KEYS.days, {});
      delete all[iso];
      write(KEYS.days, all);
    },

    async listNotes() { return read(KEYS.notes, []); },
    async saveNote(note) { return upsertList(KEYS.notes, note); },
    async deleteNote(id) { write(KEYS.notes, read(KEYS.notes, []).filter((n) => n.id !== id)); },

    async listChecklists() { return read(KEYS.checklists, []); },
    async saveChecklist(cl) { return upsertList(KEYS.checklists, cl); },
    async deleteChecklist(id) { write(KEYS.checklists, read(KEYS.checklists, []).filter((c) => c.id !== id)); },

    async uploadImage(iso, file) {
      const path = await resizeToDataUrl(file);
      return { id: uid(), path, name: file.name };
    },
    async imageUrl(path) { return path; },
    async deleteImage() {},
  };
}
