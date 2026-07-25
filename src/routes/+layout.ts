// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const prerender = true;
export const ssr = false;

// emit directory-style routes (build/output/index.html) so the Tauri asset
// protocol can resolve the output window at /output/
export const trailingSlash = "always";
