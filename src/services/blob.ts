export async function blobToDataUrl(b?: Blob): Promise<string | undefined> {
  if (!b) return undefined;
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export async function dataUrlToBlob(u?: string): Promise<Blob | undefined> {
  if (!u) return undefined;
  return (await fetch(u)).blob();
}
