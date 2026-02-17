export interface HostsOptions {
  lastNameUpperCase?: boolean;
}

export function hosts(firstName: string, lastName: string, options?: HostsOptions) {
  if (options?.lastNameUpperCase) {
    return firstName + ' ' + lastName.toLocaleUpperCase();
  }
  return firstName + ' ' + lastName;
}
