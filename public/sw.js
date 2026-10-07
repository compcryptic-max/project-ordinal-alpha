const CACHE="ordinal-shell-v0170";
const ART=["pale-hound","veil-stalker","hollow-marauder","glass-warden","mirehorn","ash-revenant","choirless-knight","riftweaver"].map(x=>"/assets/monsters/"+x+".webp").concat(["vanguard","ranger","arcanist","rogue"].map(x=>"/assets/characters/"+x+".webp"));
const SHELL=["/","/styles.css","/game.js","/effects.js","/manifest.webmanifest","/ordinal-icon.svg",...ART];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=="GET"||u.origin!==location.origin||u.pathname.startsWith("/api/")||u.pathname==="/health")return;
 if(!SHELL.includes(u.pathname))return;
 event.respondWith(fetch(event.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return r}).catch(()=>caches.match(event.request)));
});
