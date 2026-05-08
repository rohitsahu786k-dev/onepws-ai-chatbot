// @ts-nocheck
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { env } from "@onepws/config";
import type { AdminRole } from "@onepws/types";

export type AuthUser = {
  id: string;
  email: string;
  roles: AdminRole[];
  departmentSlug?: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: "1d" });
}

export function signRefreshToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthUser;
}

export function parseAuthHeader(request: Request) {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice(7);
}

export function hasRole(user: AuthUser, allowed: AdminRole[]) {
  return allowed.some((role) => user.roles.includes(role));
}
