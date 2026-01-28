/**
 * TypeScript declarations for auth-service canister
 * Generated from auth_service.did
 *
 * @module ic/declarations/auth-service
 * @see AC-1.3.2.1 - Token validation with auth-service
 */

import type { IDL } from '@dfinity/candid';
import type { Principal } from '@dfinity/principal';

// Auth method enum
export type AuthMethodType =
  | { EmailPassword: null }
  | { InternetIdentity: null }
  | { Google: null }
  | { Apple: null }
  | { Microsoft: null }
  | { GitHub: null }
  | { Discord: null };

// Device trust levels
export type DeviceTrustLevel =
  | { Trusted: null }
  | { New: null }
  | { Suspicious: null };

// Session info returned from validate_session
export interface SessionInfo {
  user_id: string;
  user_principal: [] | [Principal];
  auth_method: AuthMethodType;
  device_fingerprint: string;
  device_trust_level: DeviceTrustLevel;
  ip_anomaly_detected: boolean;
  session_age_seconds: bigint;
}

// Result types
export type ValidateAccessTokenResult = { Ok: string } | { Err: string };
export type ValidateSessionResult = { Ok: SessionInfo } | { Err: string };

// Service interface
export interface AuthServiceInterface {
  validate_access_token: (access_token: string) => Promise<ValidateAccessTokenResult>;
  validate_session: (access_token: string, current_ip_hash: [] | [string]) => Promise<ValidateSessionResult>;
  health: () => Promise<string>;
}

// IDL Factory
export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const AuthMethodType = IDL.Variant({
    EmailPassword: IDL.Null,
    InternetIdentity: IDL.Null,
    Google: IDL.Null,
    Apple: IDL.Null,
    Microsoft: IDL.Null,
    GitHub: IDL.Null,
    Discord: IDL.Null,
  });

  const DeviceTrustLevel = IDL.Variant({
    Trusted: IDL.Null,
    New: IDL.Null,
    Suspicious: IDL.Null,
  });

  const SessionInfo = IDL.Record({
    user_id: IDL.Text,
    user_principal: IDL.Opt(IDL.Principal),
    auth_method: AuthMethodType,
    device_fingerprint: IDL.Text,
    device_trust_level: DeviceTrustLevel,
    ip_anomaly_detected: IDL.Bool,
    session_age_seconds: IDL.Nat64,
  });

  return IDL.Service({
    validate_access_token: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ Ok: IDL.Text, Err: IDL.Text })],
      ['query']
    ),
    validate_session: IDL.Func(
      [IDL.Text, IDL.Opt(IDL.Text)],
      [IDL.Variant({ Ok: SessionInfo, Err: IDL.Text })],
      ['query']
    ),
    health: IDL.Func([], [IDL.Text], ['query']),
  });
};
