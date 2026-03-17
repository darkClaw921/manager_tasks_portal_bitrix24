/**
 * Password policy validation module.
 *
 * Enforces password strength rules:
 * - Minimum 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 */

interface PasswordValidationResult {
  valid: boolean;
  message: string;
}

/**
 * Validate a password against the project password policy.
 * Returns the first failed rule with a descriptive message in Russian.
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Пароль должен содержать минимум 8 символов',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Пароль должен содержать хотя бы одну заглавную букву (A-Z)',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Пароль должен содержать хотя бы одну строчную букву (a-z)',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Пароль должен содержать хотя бы одну цифру (0-9)',
    };
  }

  return {
    valid: true,
    message: '',
  };
}
