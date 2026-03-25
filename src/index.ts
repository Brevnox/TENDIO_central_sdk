export { TendioAuth } from './core/client.js';
export { verifyWebhookPayload } from './core/webhook.js';
export { generateCodeVerifier, generateCodeChallenge, generateState } from './core/pkce.js';

export type {
  TendioAuthConfig,
  TendioUser,
  TendioLocation,
  TendioStaffUser,
  SyncResult,
  TendioTokenSet,
  AppConfig,
  AppRole,
  TendioLogger,

  TendioWebhookEvent,
  WebhookEventType,
  UserCreatedData,
  UserUpdatedData,
  UserDeactivatedData,
  UserReactivatedData,
  UserPasswordChangedData,
  UserRoleChangedData,
  SessionRevokedAllData,
  UsersBulkSyncedData,
  WebhookTestData,

  TendioAuthErrorCode,

  InitiateLoginOptions,
  RequireAuthOptions,
  LogoutOptions,
} from './types.js';

export { TendioAuthError } from './types.js';

export function parseEnvironment(val?: string): 'development' | 'staging' | 'production' {
  if (val === 'development' || val === 'staging' || val === 'production') return val;
  return 'production';
}
