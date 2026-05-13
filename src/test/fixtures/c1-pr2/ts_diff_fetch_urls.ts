export async function listProducts() {
  const r = await fetch("https://api.example.com/v1/products");
  return r.json();
}

export async function listCustomers() {
  const r = await fetch("https://api.example.com/v1/customers");
  return r.json();
}

export async function listOrders() {
  const r = await fetch("https://api.example.com/v1/orders");
  return r.json();
}
