// Controlled camera: a canvas stream whose content follows an exact timeline.
(() => {
  const CLEAN_S = 25, EVERY_S = 6, FPS = 12;
  const imgs = {};
  const load = (n, v) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `/e2e/f${n}_${v}.jpg`; imgs[`${n}_${v}`] = i; });
  let ready = null;
  const fake = async () => {
    if (!ready) ready = Promise.all([0,1,2,3,4,5].flatMap((n) => [load(n,0), load(n,1)]));
    await ready;
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    const t0 = performance.now(); let k = 0;
    window.__fakecamStart = t0;
    setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const n = t < CLEAN_S ? 0 : Math.min(5, 1 + Math.floor((t - CLEAN_S) / EVERY_S));
      window.__fakecamHoles = n;
      g.drawImage(imgs[`${n}_${k++ % 2}`], 0, 0);
    }, 1000 / FPS);
    return c.captureStream(FPS);
  };
  navigator.mediaDevices.getUserMedia = async () => fake();
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'fake', label: 'Range camera (test)', groupId: 'g' }];
})();
