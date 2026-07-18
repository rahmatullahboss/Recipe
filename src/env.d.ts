/// <reference types="astro/client" />

import type { AuthSession, AuthUser } from "./lib/auth";

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
      session: AuthSession | null;
      authReady: boolean;
    }
  }
}

export {};
