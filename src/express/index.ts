export { TendioExpressAuth as TendioAuth } from './middleware.js';

export {
  TendioAuth as TendioAuthCore,
  verifyWebhookPayload,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  TendioAuthError,
  parseEnvironment,
} from '../index.js';

export type {
  TendioAuthConfig,
  TendioUser,
  TendioLocation,
  TendioStaffUser,
  SyncResult,
  TendioTokenSet,
  AppConfig,
  AppRole,
  AppRoleDefinition,
  AppRoleMapping,
  RegisterRolesResult,
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
} from '../index.js';
