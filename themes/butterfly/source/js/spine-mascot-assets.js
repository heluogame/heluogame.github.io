(() => {
  'use strict';
  if (window.BlogSpineMascotAssets) return;
  const cacheName = 'blog-spine-mascot-assets-v1';
  const fileLimit = 64; // File entries (metadata and textures), not a model count.
  const bundles = new Map();
  let storePromise;

  function store() {
    if (!storePromise) {
      let timer;
      storePromise = window.caches ? Promise.race([
        window.caches.open(cacheName).catch(() => null),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); })
      ]).then(cache => { clearTimeout(timer); return cache; }) : Promise.resolve(null);
    }
    return storePromise;
  }

  function dataURI(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Unable to decode Spine asset'));
      reader.readAsDataURL(blob);
    });
  }

  async function validate(blob, kind, spine) {
    if (!blob.size) throw new Error('Empty Spine asset');
    if (kind === 'atlas' || kind === 'json') {
      const text = await blob.text();
      if (/^\s*(?:<!doctype|<html)/i.test(text)) throw new Error('Spine URL returned an HTML page');
      if (kind === 'json') { JSON.parse(text); return text; }
      const atlas = new spine.TextureAtlas(text);
      if (!atlas.pages.length) throw new Error('Empty Spine atlas');
      return { text, pages: atlas.pages.map(page => page.name) };
    }
    const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    if (/^\s*(?:<!doctype|<html)/i.test(new TextDecoder().decode(bytes))) throw new Error('Spine URL returned an HTML page');
    if (kind === 'image') {
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69;
      if (!png && !jpeg && !webp) throw new Error('Unsupported Spine texture response');
    } else if (blob.size < 32) throw new Error('Incomplete Spine skeleton');
    return null;
  }

  async function readAsset(url, kind, spine, cache, stats) {
    const key = new URL(url, document.baseURI).href;
    if (cache) {
      try {
        const saved = await cache.match(key);
        if (saved) {
          if (!saved.ok || saved.type === 'opaque') throw new Error('Invalid stored Spine response');
          const blob = await saved.blob();
          const value = await validate(blob, kind, spine);
          stats.persistent++;
          return { blob, value };
        }
      } catch (_) { await cache.delete(key).catch(() => {}); }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const options = { mode: 'cors', credentials: 'omit', signal: controller.signal };
      // Some image hosts reject page referrers while still allowing CORS.
      if (kind === 'image' && new URL(key).origin !== new URL(document.baseURI).origin) {
        options.referrerPolicy = 'no-referrer';
      }
      const response = await fetch(key, options);
      if (!response.ok || response.type === 'opaque') throw new Error(`Spine asset request failed: ${response.status}`);
      const blob = await response.blob();
      const value = await validate(blob, kind, spine);
      stats.network++;
      if (cache) {
        try { await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })); }
        catch (_) {} // Storage denial/quota must not prevent animation playback.
      }
      return { blob, value };
    } finally { clearTimeout(timer); }
  }

  async function prepare(config, spine) {
    const textureBase = typeof config.texture_base === 'string' ? config.texture_base.trim().replace(/\/+$/, '') : '';
    if (textureBase && (typeof config.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(config.id))) {
      throw new Error('Remote texture_base requires a valid model id (a single directory name)');
    }
    const textureUrls = config.texture_urls && typeof config.texture_urls === 'object' && !Array.isArray(config.texture_urls)
      ? { ...config.texture_urls } : {};
    const key = JSON.stringify([config.skeleton, config.atlas, config.id, textureBase, textureUrls]);
    if (bundles.has(key)) return { ...await bundles.get(key), source: 'memory' };
    const pending = (async () => {
      const cache = await store();
      const stats = { network: 0, persistent: 0 };
      const json = /\.json(?:\?|$)/i.test(config.skeleton);
      const [skeleton, atlas] = await Promise.all([
        readAsset(config.skeleton, json ? 'json' : 'binary', spine, cache, stats),
        readAsset(config.atlas, 'atlas', spine, cache, stats)
      ]);
      const parent = config.atlas.slice(0, config.atlas.lastIndexOf('/') + 1);
      const textures = await Promise.all(atlas.value.pages.map(async name => {
        const url = parent + name;
        const mapped = typeof textureUrls[name] === 'string' ? textureUrls[name].trim() : '';
        const source = mapped || (textureBase ? `${textureBase}/${config.id}/${name}` : url);
        const asset = await readAsset(source, 'image', spine, cache, stats);
        // The native atlas loader still asks for its original relative page URL.
        return [url, await dataURI(asset.blob)];
      }));
      const rawDataURIs = Object.fromEntries(textures);
      rawDataURIs[config.skeleton] = json ? `data:application/json,${skeleton.value}` : await dataURI(skeleton.blob);
      rawDataURIs[config.atlas] = `data:text/plain,${atlas.value.text}`;
      if (cache) {
        try {
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - fileLimit)).map(request => cache.delete(request)));
        } catch (_) {}
      }
      return { rawDataURIs, source: stats.network ? 'network' : 'persistent' };
    })();
    bundles.set(key, pending);
    try {
      const assets = await pending;
      if (bundles.size > 8) bundles.delete(bundles.keys().next().value);
      return assets;
    } catch (error) {
      bundles.delete(key);
      throw error;
    }
  }

  window.BlogSpineMascotAssets = Object.freeze({ prepare });
})();
