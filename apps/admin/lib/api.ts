"use client";

import axios from "axios";

const clientApiBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5000";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("onepws-admin-token");
}

export const api = axios.create({
  baseURL: clientApiBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
