/** Capture credentials never outlive the active account in the native listener. */
import { NotificationListenerModule } from '../native/NotificationListenerModule';

let owner: string | null = null;
let generation = 0;
let accessToken = '';
export function captureSession() { return { owner, generation, accessToken }; }

export function activateCaptureSession(userId: string, token: string): void {
  if (owner !== userId) { generation++; owner = userId; }
  accessToken = token;
  NotificationListenerModule.setCaptureSession(userId, token);
}

/** Synchronous native detach happens before any awaited logout/network work. */
export function detachCaptureSession(): void {
  generation++;
  owner = null;
  accessToken = '';
  NotificationListenerModule.clearCaptureSession();
}
