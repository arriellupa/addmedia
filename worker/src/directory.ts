// Directory — one Durable Object for the whole service: which rooms have people right now.
// Every PageRoom reports its presence when it changes (debounced); the media page lists the busiest rooms,
// grouped by site, so a reader can see where everyone is and join. Entries fade out after 3 minutes
// without a report, so a room that went silent disappears by itself.
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./util";
import type { RoomMeta } from "./room";

const STALE = 3 * 60_000;

interface Entry {
  meta: RoomMeta;
  n: number;
  at: number;
}

export class Directory extends DurableObject<Env> {
  private rooms = new Map<string, Entry>();
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    const saved = await this.ctx.storage.get<Record<string, Entry>>("rooms");
    if (saved) for (const [k, v] of Object.entries(saved)) this.rooms.set(k, v);
    this.loaded = true;
  }
  private async save() {
    const obj: Record<string, Entry> = {};
    for (const [k, v] of this.rooms) obj[k] = v;
    await this.ctx.storage.put("rooms", obj);
  }

  async report(meta: RoomMeta, n: number): Promise<void> {
    await this.load();
    if (n <= 0) this.rooms.delete(meta.roomId);
    else this.rooms.set(meta.roomId, { meta, n, at: Date.now() });
    await this.save();
  }

  /** rooms with people, newest report first within a site; `campus` selects the campus rooms only (or excludes them) */
  async list(opts: { campus?: boolean; limit?: number } = {}): Promise<{ total: number; sites: { site: string; n: number; rooms: { roomId: string; kind: string; url?: string; title?: string; n: number }[] }[] }> {
    await this.load();
    const cutoff = Date.now() - STALE;
    const bySite = new Map<string, { site: string; n: number; rooms: any[] }>();
    let total = 0;
    for (const [id, e] of this.rooms) {
      if (e.at < cutoff) {
        this.rooms.delete(id);
        continue;
      }
      const isCampus = (e.meta.domain || "").startsWith("campus.");
      if (opts.campus !== undefined && isCampus !== opts.campus) continue;
      const site = e.meta.domain || "?";
      const s = bySite.get(site) || { site, n: 0, rooms: [] };
      s.n += e.n;
      total += e.n;
      s.rooms.push({ roomId: e.meta.roomId, kind: e.meta.kind, url: e.meta.url, title: e.meta.title, n: e.n });
      bySite.set(site, s);
    }
    const sites = [...bySite.values()].sort((a, b) => b.n - a.n).slice(0, opts.limit ?? 30);
    for (const s of sites) s.rooms.sort((a, b) => b.n - a.n);
    return { total, sites };
  }
}
