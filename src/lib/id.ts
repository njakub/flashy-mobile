import { randomUUID } from "expo-crypto";

/** Client-generated UUID — the server accepts any client-generated UUID string. */
export function newId(): string {
  return randomUUID();
}
