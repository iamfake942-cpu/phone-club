import axios from "axios";

axios.defaults.baseURL = import.meta.env.VITE_API_URL || "http://localhost:5000";
axios.defaults.withCredentials = true;

let accessToken = null;

axios.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

export async function register(name, email, password) {
  const { data } = await axios.post("/api/auth/register", {
    name,
    email,
    password,
  });

  accessToken = data.accessToken;
  return data.user;
}

export async function login(email, password) {
  const { data } = await axios.post("/api/auth/login", {
    email,
    password,
  });

  accessToken = data.accessToken;
  return data.user;
}

export async function loginWithGoogle(credential) {
  const { data } = await axios.post("/api/auth/google", {
    credential,
  });

  accessToken = data.accessToken;
  return data.user;
}

export async function refreshSession() {
  const { data } = await axios.post("/api/auth/refresh");

  accessToken = data.accessToken;
  return data.user;
}

export async function logout() {
  await axios.post("/api/auth/logout");
  accessToken = null;
}

export async function getCurrentUser() {
  const { data } = await axios.get("/api/auth/me");
  return data.user;
}

export async function getCart() {
  const { data } = await axios.get("/api/cart");
  return data;
}

export async function addToCart(productId, quantity = 1) {
  const { data } = await axios.post("/api/cart/items", {
    product_id: productId,
    quantity,
  });

  return data.item;
}

export async function updateCartItem(productId, quantity) {
  const { data } = await axios.patch(`/api/cart/items/${productId}`, {
    quantity,
  });

  return data.item;
}

export async function removeCartItem(productId) {
  const { data } = await axios.delete(`/api/cart/items/${productId}`);
  return data;
}

export async function clearCart() {
  const { data } = await axios.delete("/api/cart");
  return data;
}
