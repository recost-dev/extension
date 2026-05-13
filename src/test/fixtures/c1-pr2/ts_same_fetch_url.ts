export async function loadOnce() {
  const r = await fetch("https://api.example.com/v1/products/123");
  return r.json();
}

export async function loadAgain() {
  const r = await fetch("https://api.example.com/v1/products/123");
  return r.json();
}
