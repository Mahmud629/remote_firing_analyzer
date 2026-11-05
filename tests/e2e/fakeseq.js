// Fake camera that plays a rendered sequence (out/e2e/seq/manifest.json + fNNN.jpg)
// at a fixed rate, so the browser runs the real live path end to end.
(() => {
  const fake = async () => {
    const man = await (await fetch('/e2e/seq/manifest.json')).json();
    const imgs = await Promise.all(
      Array.from({ length: man.n }, (_, i) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = `/e2e/seq/f${String(i).padStart(3, '0')}.jpg`; })),
    );
    const c = document.createElement('canvas');
    c.width = man.w; c.height = man.h;
    const g = c.getContext('2d');
    const t0 = performance.now();
    window.__seq = { frame: 0, shots: man.shots };
    setInterval(() => {
      const i = Math.min(man.n - 1, Math.floor(((performance.now() - t0) / 1000) * man.fps));
      window.__seq.frame = i;
      window.__seq.fired = man.shots.filter((f) => f <= i).length;
      g.drawImage(imgs[i], 0, 0);
    }, 1000 / 15);
    return c.captureStream(15);
  };
  navigator.mediaDevices.getUserMedia = async () => fake();
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'fake', label: 'Range camera (test)', groupId: 'g' }];
})();
