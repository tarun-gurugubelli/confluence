import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'confluence.registration_password';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly password = signal<string | null>(this.readStored());
  readonly isAuthed = signal<boolean>(this.readStored() !== null);

  setPassword(value: string): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable */
    }
    this.password.set(value);
    this.isAuthed.set(true);
  }

  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    this.password.set(null);
    this.isAuthed.set(false);
  }

  private readStored(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
