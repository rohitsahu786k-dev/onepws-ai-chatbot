"use client";

import axios from "axios";

const getApiBaseUrl = () => {
  const explicitApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const legacyApiUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return explicitApiUrl || legacyApiUrl || "http://localhost:5000";
  }

  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  return "";
};

const clientApiBaseUrl = getApiBaseUrl();

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
