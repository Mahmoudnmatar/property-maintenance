import { Role } from "@prisma/client";

export class AuthorizationError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  preferredLocale?: string;
  isDisabled?: boolean;
}

export function assertAuthenticated(user: AuthUser | null | undefined): asserts user is AuthUser {
  if (!user) {
    throw new AuthorizationError("UNAUTHENTICATED");
  }
  if (user.isDisabled) {
    throw new AuthorizationError("ACCOUNT_DISABLED");
  }
}

export function assertRole(user: AuthUser | null | undefined, roles: Role[]): asserts user is AuthUser {
  assertAuthenticated(user);
  if (!roles.includes(user.role)) {
    throw new AuthorizationError("FORBIDDEN");
  }
}

export function assertSuperAdmin(user: AuthUser | null | undefined): asserts user is AuthUser {
  assertRole(user, [Role.SUPER_ADMIN]);
}

export function assertOwner(user: AuthUser | null | undefined): asserts user is AuthUser {
  assertRole(user, [Role.OWNER, Role.SUPER_ADMIN]);
}

export function assertTenant(user: AuthUser | null | undefined): asserts user is AuthUser {
  assertRole(user, [Role.TENANT, Role.SUPER_ADMIN]);
}

export function assertWorker(user: AuthUser | null | undefined): asserts user is AuthUser {
  assertRole(user, [Role.WORKER, Role.SUPER_ADMIN]);
}
