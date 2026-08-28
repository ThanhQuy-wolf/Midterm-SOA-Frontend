import { apiClient } from "./client";
import type { Payer } from "../types/domain";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  payer: Payer;
}

export function login(payload: LoginRequest) {
  return apiClient.post<LoginResponse>("/auth/login", payload).then((res) => res.data);
}

export function logout() {
  return apiClient.post("/auth/logout");
}
