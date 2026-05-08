"use client";

import axios from "axios";

const getApiBaseUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return configuredUrl || "http://localhost:5000";
  }

  if (typeof window !== "undefined" && configuredUrl) {
    try {
      const configuredHost = new URL(configuredUrl).hostname;
      if (window.location.hostname === "chat.onepws.com" && configuredHost === "api.chat.onepws.com") {
        return "";
      }
    } catch {
      return configuredUrl;
    }
  }

  return configuredUrl || "";
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
